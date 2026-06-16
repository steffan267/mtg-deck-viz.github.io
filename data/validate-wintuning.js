#!/usr/bin/env node
/*
 * validate-wintuning.js — run win-tuning + Game Changers across the 100-precon
 * corpus and report the score distribution, band spread, and Game Changer
 * counts. Used to sanity-check that the model's bands are calibrated against a
 * known-casual reference set (precons should cluster low/mid, NOT "Highly
 * tuned") and that Game Changer detection fires on the cards WotC lists.
 *
 *   node data/validate-wintuning.js            # full 100 (network)
 *   node data/validate-wintuning.js 20          # first 20 only
 *
 * Writes data/wintuning-corpus.json with per-deck results.
 */
const fs = require("fs");
const path = require("path");
const { loadCards, build, fetchMoxfield } = require("../src/build-deck-viz.js");

const DEFAULT_CORPUS = path.join(__dirname, "precon-sample-100.json");
const DEFAULT_OUT = path.join(__dirname, "wintuning-corpus.json");
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Fetch with backoff: the r.jina.ai proxy rate-limits (HTTP 429) under a fast
// loop, so we retry with growing delays before giving up on a deck.
async function fetchWithRetry(id, tries = 5) {
  let wait = 4000;
  for (let t = 0; t < tries; t++) {
    try { return await fetchMoxfield(id); }
    catch (e) {
      if (!/429|HTTP 5/.test(e.message) || t === tries - 1) throw e;
      await sleep(wait); wait = Math.min(wait * 2, 30000);
    }
  }
}

function parseArgs(argv) {
  const opts = { corpus: DEFAULT_CORPUS, out: DEFAULT_OUT, limit: Infinity };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--corpus') opts.corpus = argv[++i];
    else if (a === '--out') opts.out = argv[++i];
    else if (a === '--limit') opts.limit = parseInt(argv[++i], 10) || Infinity;
    else if (/^\d+$/.test(a)) opts.limit = parseInt(a, 10);
    else if (a === '--help') {
      console.error('Usage: node data/validate-wintuning.js [limit] [--corpus file] [--out file] [--limit n]');
      process.exit(2);
    }
  }
  return opts;
}

function loadCorpus(file) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  return Array.isArray(raw) ? raw : (raw.decks || []);
}

function loadPrior(out) {
  if (!fs.existsSync(out)) return { results: [], failures: [] };
  const raw = JSON.parse(fs.readFileSync(out, "utf8"));
  if (Array.isArray(raw)) return { results: raw, failures: [] };
  return {
    results: Array.isArray(raw.results) ? raw.results : [],
    failures: Array.isArray(raw.failures) ? raw.failures : [],
  };
}

function buildOutput(corpusFile, requestedDecks, results, failures) {
  return {
    meta: {
      corpus: corpusFile,
      requestedDecks,
      analyzedDecks: results.length,
      failedDecks: failures.length,
      complete: results.length + failures.length === requestedDecks,
      updatedAt: new Date().toISOString(),
    },
    results,
    failures,
  };
}

function writeCheckpoint(out, payload) {
  fs.writeFileSync(out, JSON.stringify(payload, null, 2));
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const limit = opts.limit;
  const corpus = loadCorpus(opts.corpus).slice(0, limit);
  const idx = loadCards();
  // resume: keep decks already scored in a previous (rate-limited) run
  const prior = loadPrior(opts.out);
  const done = new Map(prior.results.map(r => [r.id, r]));
  const results = [];
  const failures = [];
  for (let i = 0; i < corpus.length; i++) {
    const { id, name } = corpus[i];
    if (done.has(id)) { results.push(done.get(id)); continue; }
    process.stdout.write(`[${i + 1}/${corpus.length}] ${name.slice(0, 40)} … `);
    try {
      const { decklist } = await fetchWithRetry(id);
      const g = build(decklist, idx);
      const m = g.metrics;
      await sleep(1500);   // be polite to the proxy between decks
      results.push({
        name: name.slice(0, 50), id,
        win: m.winTuningScore, band: m.winTuningBand,
        cohesion: m.cohesionScore, self: m.selfSufficiencyScore,
        gc: m.gameChangerCount, gcCards: m.gameChangers, bracket: m.bracketHint, sourceBracket: typeof corpus[i].bracket === "number" ? corpus[i].bracket : null, likes: corpus[i].likes ?? null,
        sig: Object.fromEntries(Object.entries(m.winTuningSignals).map(([k, v]) => [k, v.score])),
        summary: m.winSummary,
      });
      process.stdout.write(`win ${m.winTuningScore} (${m.winTuningBand}) · GC ${m.gameChangerCount} · B${m.bracketHint}\n`);
      writeCheckpoint(opts.out, buildOutput(opts.corpus, corpus.length, results, failures));   // checkpoint so a 429 mid-run is resumable
    } catch (e) {
      process.stdout.write(`✗ ${e.message}\n`);
      failures.push({
        id,
        name: name.slice(0, 50),
        error: e.message,
        sourceBracket: typeof corpus[i].bracket === "number" ? corpus[i].bracket : null,
        likes: corpus[i].likes ?? null,
      });
      writeCheckpoint(opts.out, buildOutput(opts.corpus, corpus.length, results, failures));
    }
  }

  writeCheckpoint(opts.out, buildOutput(opts.corpus, corpus.length, results, failures));

  // ---- distribution report ----
  const wins = results.map(r => r.win).sort((a, b) => a - b);
  const median = wins.length ? wins[Math.floor(wins.length / 2)] : 0;
  const mean = wins.length ? +(wins.reduce((a, b) => a + b, 0) / wins.length).toFixed(1) : 0;
  const bands = {};
  for (const r of results) bands[r.band] = (bands[r.band] || 0) + 1;
  const gcs = results.map(r => r.gc);
  const brackets = {};
  for (const r of results) brackets["B" + r.bracket] = (brackets["B" + r.bracket] || 0) + 1;

  console.log("\n==== WIN-TUNING CORPUS REPORT (" + results.length + " decks) ====");
  console.log("win score: min", wins[0], "median", median, "mean", mean, "max", wins[wins.length - 1]);
  console.log("bands:", JSON.stringify(bands));
  console.log("brackets:", JSON.stringify(brackets));
  console.log("analysis completeness:", `${results.length}/${corpus.length} succeeded`, `failures ${failures.length}`);
  console.log("game changers: min", Math.min(...gcs), "median", gcs.slice().sort((a, b) => a - b)[Math.floor(gcs.length / 2)], "max", Math.max(...gcs));
  console.log("\ntop 8 by win:");
  results.slice().sort((a, b) => b.win - a.win).slice(0, 8).forEach(r => console.log(`  ${r.win} ${(r.band).padEnd(12)} GC${r.gc} ${r.name}`));
  console.log("\nbottom 5 by win:");
  results.slice().sort((a, b) => a.win - b.win).slice(0, 5).forEach(r => console.log(`  ${r.win} ${(r.band).padEnd(12)} GC${r.gc} ${r.name}`));
  console.log("\nGame Changers seen across corpus:");
  const gcFreq = {};
  for (const r of results) for (const c of r.gcCards) gcFreq[c] = (gcFreq[c] || 0) + 1;
  Object.entries(gcFreq).sort((a, b) => b[1] - a[1]).forEach(([c, n]) => console.log(`  ${n}× ${c}`));
  if (failures.length) {
    console.log("\nFailed deck fetch/builds:");
    failures.slice().sort((a, b) => (a.sourceBracket || 0) - (b.sourceBracket || 0) || (b.likes || 0) - (a.likes || 0) || a.name.localeCompare(b.name)).forEach(r => console.log(`  B${r.sourceBracket || "?"} ${r.name}: ${r.error}`));
  }
  console.log("\n✓ wrote " + opts.out);
}

if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(1); });
} else {
  module.exports = {
    parseArgs,
    loadCorpus,
    loadPrior,
    buildOutput,
  };
}
