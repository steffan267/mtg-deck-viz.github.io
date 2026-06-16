#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const {
  TARGET_BRACKETS,
  GLOBAL_PAGE_SIZE,
  encodePublicBracketQuery,
  parseJinaJson,
  parsePublicBracketPage,
  isCommanderDeck,
  normalizeLeaderboardRow,
  sampleStatus,
  maybeAddDeck,
  finalizeDecks,
  initSampleState,
} = require('../lib/moxfield-bracket-sample');

const DEFAULT_OUT = path.join(__dirname, 'moxfield-bracket-sample-500.json');
const SEARCH_API = 'https://api2.moxfield.com/v2/decks/search';
const PUBLIC_PAGE = 'https://moxfield.com/decks/public?q=';
const sleep = ms => new Promise(r => setTimeout(r, ms));

function usage() {
  console.error('Usage: node data/fetch-moxfield-bracket-sample.js [--out file] [--target 100] [--max-pages 200] [--page-size 100]');
  process.exit(2);
}

function parseArgs(argv) {
  const opts = { out: DEFAULT_OUT, target: 100, maxPages: 200, pageSize: GLOBAL_PAGE_SIZE };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') opts.out = argv[++i];
    else if (a === '--target') opts.target = parseInt(argv[++i], 10);
    else if (a === '--max-pages') opts.maxPages = parseInt(argv[++i], 10);
    else if (a === '--page-size') opts.pageSize = parseInt(argv[++i], 10);
    else if (a === '--help') usage();
    else usage();
  }
  if (!opts.target || !opts.maxPages || !opts.pageSize) usage();
  return opts;
}

async function httpGet(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json,text/plain,*/*' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

async function fetchViaJina(url, tries = 5) {
  let wait = 3000;
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try { return await httpGet('https://r.jina.ai/http://' + url); }
    catch (err) {
      lastErr = err;
      if (i === tries - 1) break;
      await sleep(wait);
      wait = Math.min(wait * 2, 30000);
    }
  }
  throw lastErr;
}

function loadExisting(out) {
  if (!fs.existsSync(out)) return { meta: null, decks: [] };
  const raw = JSON.parse(fs.readFileSync(out, 'utf8'));
  if (Array.isArray(raw)) return { meta: null, decks: raw };
  return { meta: raw.meta || null, decks: raw.decks || [] };
}

function save(out, payload) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(payload, null, 2));
}

async function seedBracketPages(state, targetPerBracket) {
  for (const bracket of TARGET_BRACKETS) {
    if (state.counts[bracket] >= targetPerBracket) continue;
    const q = encodePublicBracketQuery(bracket);
    const body = await fetchViaJina(PUBLIC_PAGE + q);
    const entries = parsePublicBracketPage(body, bracket);
    for (const deck of entries) maybeAddDeck(state, deck, targetPerBracket);
    await sleep(500);
  }
}

async function scanGlobalLikes(state, targetPerBracket, maxPages, pageSize) {
  let pagesScanned = 0;
  for (let pageNumber = 1; pageNumber <= maxPages; pageNumber++) {
    const qs = new URLSearchParams({ pageNumber: String(pageNumber), pageSize: String(pageSize), sortType: 'likes' });
    const body = await fetchViaJina(`${SEARCH_API}?${qs.toString()}`);
    const json = parseJinaJson(body);
    const rows = Array.isArray(json.data) ? json.data : [];
    if (!rows.length) break;
    pagesScanned = pageNumber;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!isCommanderDeck(row)) continue;
      maybeAddDeck(state, normalizeLeaderboardRow(row, pageNumber, i), targetPerBracket);
    }
    const status = sampleStatus(state.decks, targetPerBracket);
    process.stdout.write(`[global page ${pageNumber}] counts ${JSON.stringify(status.counts)}\n`);
    if (status.complete) return { pagesScanned, complete: true };
    await sleep(350);
  }
  return { pagesScanned, complete: false };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const existing = loadExisting(opts.out);
  const state = initSampleState(existing.decks);
  process.stdout.write(`Resuming with ${state.decks.length} saved decks\n`);
  await seedBracketPages(state, opts.target);
  const seeded = sampleStatus(state.decks, opts.target);
  process.stdout.write(`After bracket-page seeding: ${JSON.stringify(seeded.counts)}\n`);
  save(opts.out, {
    meta: { generatedAt: new Date().toISOString(), targetPerBracket: opts.target, stage: 'seeded', counts: seeded.counts, shortfalls: seeded.shortfalls },
    decks: finalizeDecks(state.decks),
  });
  const global = await scanGlobalLikes(state, opts.target, opts.maxPages, opts.pageSize);
  const finalStatus = sampleStatus(state.decks, opts.target);
  const payload = {
    meta: {
      generatedAt: new Date().toISOString(),
      targetPerBracket: opts.target,
      globalPageSize: opts.pageSize,
      globalPagesScanned: global.pagesScanned,
      counts: finalStatus.counts,
      shortfalls: finalStatus.shortfalls,
      complete: finalStatus.complete,
      notes: [
        'Public bracket pages are used to seed the first likes-sorted page (64 decks) per bracket.',
        'Additional decks are filled from the global likes leaderboard, filtered locally to Commander decks with Moxfield bracket values.',
      ],
    },
    decks: finalizeDecks(state.decks),
  };
  save(opts.out, payload);
  process.stdout.write(`Wrote ${opts.out} with ${state.decks.length} decks\n`);
  process.stdout.write(`Counts ${JSON.stringify(finalStatus.counts)}\n`);
  if (!finalStatus.complete) {
    process.stderr.write(`Shortfalls ${JSON.stringify(finalStatus.shortfalls)}\n`);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(err => { console.error(err); process.exit(1); });
}
