#!/usr/bin/env node
/*
 * cache-reference-decks.js — materialize the public Moxfield reference sample as
 * local decklists so repeated bracket / interaction analysis can run without
 * re-fetching every deck from Moxfield.
 *
 * The cache intentionally stores the normalized decklist payload returned by
 * fetchMoxfield(), not the full upstream response. That keeps the artifact
 * compact while preserving resolved card facts needed by the graph builder,
 * including double-faced card face data and aliases.
 */
const fs = require('fs');
const path = require('path');
const { fetchMoxfield } = require('../../src/build-deck-viz.js');
const { createProgress } = require('../../lib/progress');

const DEFAULT_SAMPLE = path.join(__dirname, 'moxfield-bracket-sample-500.json');
const DEFAULT_OUT = path.join(__dirname, 'moxfield-reference-decks.json');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function usage() {
  console.error('Usage: node analysis/bracket/cache-reference-decks.js [--sample file] [--out file] [--limit n] [--delay-ms n] [--retries n] [--force] [--fail-fast] [--progress-every n]');
  process.exit(2);
}

function parsePositiveInt(value, fallback) {
  const parsed = parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseArgs(argv) {
  const opts = {
    sample: DEFAULT_SAMPLE,
    out: DEFAULT_OUT,
    limit: Infinity,
    delayMs: 1500,
    retries: 5,
    force: false,
    failFast: false,
    progressEvery: 10,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--sample') opts.sample = argv[++i];
    else if (a === '--out') opts.out = argv[++i];
    else if (a === '--limit') opts.limit = parsePositiveInt(argv[++i], Infinity);
    else if (a === '--delay-ms') opts.delayMs = parsePositiveInt(argv[++i], opts.delayMs);
    else if (a === '--retries') opts.retries = parsePositiveInt(argv[++i], opts.retries);
    else if (a === '--force') opts.force = true;
    else if (a === '--fail-fast') opts.failFast = true;
    else if (a === '--progress-every') opts.progressEvery = parsePositiveInt(argv[++i], opts.progressEvery);
    else if (a === '--help') usage();
    else usage();
  }
  return opts;
}

function loadReferenceDecks(file) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const decks = Array.isArray(raw) ? raw : raw.decks;
  if (!Array.isArray(decks)) throw new Error(`Reference sample has no decks array: ${file}`);
  return decks.filter(deck => deck && deck.id);
}

function normalizeCache(raw) {
  if (Array.isArray(raw)) return { meta: null, decks: raw, failures: [] };
  return {
    meta: raw && raw.meta || null,
    decks: Array.isArray(raw && raw.decks) ? raw.decks : [],
    failures: Array.isArray(raw && raw.failures) ? raw.failures : [],
  };
}

function loadDeckCache(file) {
  if (!file || !fs.existsSync(file)) return { meta: null, decks: [], failures: [] };
  return normalizeCache(JSON.parse(fs.readFileSync(file, 'utf8')));
}

function sortedBySampleOrder(sampleDecks, recordsById) {
  const rows = [];
  for (const source of sampleDecks) {
    const record = recordsById.get(source.id);
    if (record) rows.push(record);
  }
  return rows;
}

function activeFailures(failuresById, cachedIds, sampleDecks) {
  const rows = [];
  for (const source of sampleDecks) {
    if (cachedIds.has(source.id)) continue;
    const failure = failuresById.get(source.id);
    if (failure) rows.push(failure);
  }
  return rows;
}

function buildOutput(sampleFile, sampleDecks, recordsById, failuresById) {
  const decks = sortedBySampleOrder(sampleDecks, recordsById);
  const cachedIds = new Set(decks.map(deck => deck.id));
  const failures = activeFailures(failuresById, cachedIds, sampleDecks);
  return {
    meta: {
      sample: sampleFile,
      requestedDecks: sampleDecks.length,
      cachedDecks: decks.length,
      failedDecks: failures.length,
      complete: decks.length === sampleDecks.length && failures.length === 0,
      updatedAt: new Date().toISOString(),
    },
    decks,
    failures,
  };
}

function writeCheckpoint(out, payload) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(payload, null, 2));
}

function sanitizeDecklist(decklist) {
  return (decklist || []).map(entry => ({
    qty: entry.qty || 1,
    name: entry.name,
    resolved: entry.resolved || undefined,
  })).filter(entry => entry.name);
}

function toCachedDeck(source, fetched) {
  return {
    id: source.id,
    name: source.name || fetched.title || source.id,
    title: fetched.title || source.name || source.id,
    url: source.url || `https://moxfield.com/decks/${source.id}`,
    bracket: typeof source.bracket === 'number' ? source.bracket : null,
    sourceBracket: typeof source.bracket === 'number' ? source.bracket : null,
    likes: source.likes ?? null,
    views: source.views ?? null,
    comments: source.comments ?? null,
    bracketRank: source.bracketRank ?? null,
    source: source.source || null,
    fetchedAt: new Date().toISOString(),
    decklist: sanitizeDecklist(fetched.decklist),
  };
}

async function fetchWithRetry(id, fetcher = fetchMoxfield, tries = 5) {
  let wait = 4000;
  for (let t = 0; t < tries; t++) {
    try { return await fetcher(id); }
    catch (err) {
      if (!/429|HTTP 5/.test(err.message) || t === tries - 1) throw err;
      await sleep(wait);
      wait = Math.min(wait * 2, 30000);
    }
  }
}

async function cacheReferenceDecks(opts, fetcher = fetchMoxfield) {
  const sampleDecks = loadReferenceDecks(opts.sample).slice(0, opts.limit);
  const existing = loadDeckCache(opts.out);
  const recordsById = new Map(existing.decks.filter(deck => deck && deck.id).map(deck => [deck.id, deck]));
  const failuresById = new Map(existing.failures.filter(failure => failure && failure.id).map(failure => [failure.id, failure]));

  process.stdout.write(`Reference sample ${opts.sample}: ${sampleDecks.length} decks\n`);
  process.stdout.write(`Resuming with ${recordsById.size} cached decklists and ${failuresById.size} prior failures\n`);
  const progress = createProgress('reference-deck-cache', sampleDecks.length, { every: opts.progressEvery });
  progress.start(`out=${opts.out}`);

  for (let i = 0; i < sampleDecks.length; i++) {
    const source = sampleDecks[i];
    if (!opts.force && recordsById.has(source.id)) {
      progress.tick(i + 1, `cached=${recordsById.size} failures=${failuresById.size} last=${source.name || source.id}`);
      continue;
    }
    process.stdout.write(`[${i + 1}/${sampleDecks.length}] ${String(source.name || source.id).slice(0, 44)} … `);
    try {
      const fetched = await fetchWithRetry(source.id, fetcher, opts.retries);
      const record = toCachedDeck(source, fetched);
      recordsById.set(source.id, record);
      failuresById.delete(source.id);
      process.stdout.write(`${record.decklist.length} cards\n`);
    } catch (err) {
      const failure = {
        id: source.id,
        name: String(source.name || source.id).slice(0, 80),
        error: err.message,
        sourceBracket: typeof source.bracket === 'number' ? source.bracket : null,
        likes: source.likes ?? null,
        failedAt: new Date().toISOString(),
      };
      failuresById.set(source.id, failure);
      process.stdout.write(`✗ ${err.message}\n`);
      if (opts.failFast) throw err;
    }
    writeCheckpoint(opts.out, buildOutput(opts.sample, sampleDecks, recordsById, failuresById));
    progress.tick(i + 1, `cached=${recordsById.size} failures=${failuresById.size} last=${source.name || source.id}`);
    if (opts.delayMs > 0) await sleep(opts.delayMs);
  }
  progress.done(`cached=${recordsById.size} failures=${failuresById.size}`);

  const payload = buildOutput(opts.sample, sampleDecks, recordsById, failuresById);
  writeCheckpoint(opts.out, payload);
  return payload;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const payload = await cacheReferenceDecks(opts);
  process.stdout.write(`\n✓ wrote ${opts.out}\n`);
  process.stdout.write(`cached ${payload.meta.cachedDecks}/${payload.meta.requestedDecks}; failures ${payload.meta.failedDecks}; complete ${payload.meta.complete}\n`);
  if (!payload.meta.complete) process.exitCode = 1;
}

if (require.main === module) {
  main().catch(err => { console.error(err); process.exit(1); });
} else {
  module.exports = {
    DEFAULT_SAMPLE,
    DEFAULT_OUT,
    parseArgs,
    loadReferenceDecks,
    loadDeckCache,
    buildOutput,
    toCachedDeck,
    fetchWithRetry,
    cacheReferenceDecks,
  };
}
