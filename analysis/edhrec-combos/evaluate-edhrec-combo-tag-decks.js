#!/usr/bin/env node
/*
 * evaluate-edhrec-combo-tag-decks.js — score EDHREC /tags/combo average decks.
 *
 * The input cache contains aggregate EDHREC commander/cardlist data, not exact
 * public decklists. This evaluator runs those average-deck approximations
 * through the current interaction engine and writes a reusable local report.
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { build, loadCards } = require('../../src/build-deck-viz');
const { createProgress } = require('../../lib/progress');

const DEFAULT_CACHE = path.join(__dirname, 'edhrec-combo-tag-decks.json');
const DEFAULT_JSON_OUT = path.join(__dirname, 'edhrec-combo-tag-deck-evaluation.json');

function usage() {
  process.stderr.write('Usage: node analysis/edhrec-combos/evaluate-edhrec-combo-tag-decks.js [--cache file] [--json-out file] [--max n|all] [--progress-every n] [--timeout-ms n] [--deck-card-limit n|all]\n');
  process.exit(2);
}

function parseLimit(value, fallback) {
  if (String(value).toLowerCase() === 'all') return Infinity;
  const n = parseInt(String(value), 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function parsePositiveInt(value, fallback) {
  const n = parseInt(String(value), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseArgs(argv) {
  const opts = { cache: DEFAULT_CACHE, jsonOut: DEFAULT_JSON_OUT, max: 100, progressEvery: 10, timeoutMs: 20000, deckCardLimit: 60, scoreOne: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--cache') opts.cache = argv[++i];
    else if (arg === '--json-out') opts.jsonOut = argv[++i];
    else if (arg === '--max') opts.max = parseLimit(argv[++i], opts.max);
    else if (arg === '--progress-every') opts.progressEvery = parsePositiveInt(argv[++i], opts.progressEvery);
    else if (arg === '--timeout-ms') opts.timeoutMs = parsePositiveInt(argv[++i], opts.timeoutMs);
    else if (arg === '--deck-card-limit') opts.deckCardLimit = parseLimit(argv[++i], opts.deckCardLimit);
    else if (arg === '--score-one') opts.scoreOne = parsePositiveInt(argv[++i], null);
    else if (arg === '--help' || arg === '-h') usage();
    else usage();
  }
  return opts;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

function round(value, digits = 1) {
  return Number.isFinite(value) ? +value.toFixed(digits) : 0;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function stats(values) {
  const nums = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  return {
    min: nums[0] || 0,
    median: median(nums),
    mean: round(nums.reduce((sum, value) => sum + value, 0) / (nums.length || 1)),
    max: nums[nums.length - 1] || 0,
  };
}

function counts(values) {
  const map = new Map();
  for (const value of values) map.set(value, (map.get(value) || 0) + 1);
  return Object.fromEntries([...map.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
}

function familyCounts(graph) {
  const map = new Map();
  for (const edge of graph.edges || []) {
    for (const interaction of edge.interactions || []) {
      map.set(interaction.family, (map.get(interaction.family) || 0) + 1);
    }
  }
  return map;
}

function topFamilies(graph, limit = 8) {
  return [...familyCounts(graph).entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([family, count]) => ({ family, count }));
}

function scoreDeck(deck, idx, deckCardLimit = Infinity) {
  const decklist = (deck.decklist || [])
    .slice(0, deckCardLimit)
    .map(entry => typeof entry === 'string' ? { qty: 1, name: entry } : entry);
  const graph = build(decklist, idx);
  const metrics = graph.metrics || {};
  return {
    id: deck.id,
    name: deck.name,
    url: deck.url,
    sourcePages: deck.sourcePages || [],
    numDecks: deck.numDecks ?? null,
    sourceCards: (deck.decklist || []).length,
    scoredCards: decklist.length,
    cards: graph.nodes.filter(node => node.role !== 'zone').length,
    win: metrics.winTuningScore,
    winBand: metrics.winTuningBand,
    cohesion: metrics.cohesionScore,
    cohesionBand: metrics.cohesionBand,
    self: metrics.selfSufficiencyScore,
    bracket: metrics.commanderBracket?.bracket || null,
    edges: graph.edges.length,
    islands: metrics.islandCount,
    interactivePct: metrics.pctInteractive,
    hasCombo: metrics.hasCombo,
    comboPairs: (metrics.comboCriticalPairs || []).length,
    comboTriples: (metrics.comboCriticalTriples || []).length,
    proofPackages: (graph.interactionProofs || []).length,
    topFamilies: topFamilies(graph),
  };
}

function topRows(rows, key, limit = 12, ascending = false) {
  return rows
    .slice()
    .sort((a, b) => {
      const diff = Number(a[key] || 0) - Number(b[key] || 0);
      return (ascending ? diff : -diff) || String(a.name || a.id).localeCompare(String(b.name || b.id));
    })
    .slice(0, limit)
    .map(row => ({
      name: row.name,
      [key]: row[key],
      win: row.win,
      cohesion: row.cohesion,
      comboPairs: row.comboPairs,
      bracket: row.bracket,
    }));
}

function summarize(rows, cacheMeta, failures = []) {
  const familyTotals = new Map();
  const familyDeckHits = new Map();
  for (const row of rows) {
    const seen = new Set();
    for (const entry of row.topFamilies || []) {
      familyTotals.set(entry.family, (familyTotals.get(entry.family) || 0) + entry.count);
      seen.add(entry.family);
    }
    for (const family of seen) familyDeckHits.set(family, (familyDeckHits.get(family) || 0) + 1);
  }
  return {
    generatedAt: new Date().toISOString(),
    cacheGeneratedAt: cacheMeta.generatedAt || null,
    evaluatedDecks: rows.length,
    failedDecks: failures.length,
    win: stats(rows.map(row => row.win)),
    cohesion: stats(rows.map(row => row.cohesion)),
    self: stats(rows.map(row => row.self)),
    edges: stats(rows.map(row => row.edges)),
    islands: stats(rows.map(row => row.islands)),
    winBands: counts(rows.map(row => row.winBand || 'unknown')),
    cohesionBands: counts(rows.map(row => row.cohesionBand || 'unknown')),
    brackets: counts(rows.map(row => `B${row.bracket || '?'}`)),
    comboDeckCount: rows.filter(row => row.hasCombo).length,
    comboPairCount: rows.reduce((sum, row) => sum + Number(row.comboPairs || 0), 0),
    topComboPairs: topRows(rows, 'comboPairs'),
    topCohesion: topRows(rows, 'cohesion'),
    lowestCohesion: topRows(rows, 'cohesion', 12, true),
    noComboDetected: rows
      .filter(row => !row.hasCombo)
      .slice(0, 30)
      .map(row => ({ name: row.name, win: row.win, cohesion: row.cohesion, bracket: row.bracket, edges: row.edges, islands: row.islands })),
    topFamilies: [...familyTotals.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 20)
      .map(([family, count]) => ({ family, count, deckHits: familyDeckHits.get(family) || 0 })),
  };
}

function evaluateComboTagDecks(opts) {
  const cache = readJson(opts.cache);
  const decks = (cache.decks || []).slice(0, opts.max);
  const rows = [];
  const failures = [];
  const progress = createProgress('edhrec-combo-tag-score', decks.length, { every: opts.progressEvery });
  progress.start(`cache=${opts.cache}`);
  for (let i = 0; i < decks.length; i++) {
    const deck = decks[i];
    const result = scoreDeckInWorker(opts.cache, i, opts.timeoutMs, opts.deckCardLimit);
    if (result.ok) rows.push(result.row);
    else failures.push({
      index: i,
      id: deck.id,
      name: deck.name,
      error: result.error,
      timedOut: result.timedOut,
    });
    progress.tick(i + 1, `rows=${rows.length} failures=${failures.length} last="${deck.name}"`);
  }
  progress.done(`rows=${rows.length} failures=${failures.length}`);
  return {
    meta: {
      cache: opts.cache,
      cacheDeckCount: cache.meta?.deckCount ?? (cache.decks || []).length,
      max: opts.max === Infinity ? 'all' : opts.max,
      timeoutMs: opts.timeoutMs,
      deckCardLimit: opts.deckCardLimit === Infinity ? 'all' : opts.deckCardLimit,
      generatedAt: new Date().toISOString(),
      corpusNote: 'EDHREC /tags/combo aggregate commander average lists, not exact public decklists.',
    },
    summary: summarize(rows, cache.meta || {}, failures),
    failures,
    rows,
  };
}

function scoreDeckInWorker(cacheFile, index, timeoutMs, deckCardLimit) {
  const child = spawnSync(process.execPath, [
    __filename,
    '--score-one',
    String(index),
    '--cache',
    cacheFile,
    '--deck-card-limit',
    deckCardLimit === Infinity ? 'all' : String(deckCardLimit),
  ], {
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 1024 * 1024 * 4,
  });
  if (child.error) {
    const childError = /** @type {NodeJS.ErrnoException} */ (child.error);
    return { ok: false, timedOut: childError.code === 'ETIMEDOUT', error: childError.message };
  }
  if (child.status !== 0) {
    return { ok: false, timedOut: false, error: (child.stderr || child.stdout || `exit ${child.status}`).trim() };
  }
  try {
    return { ok: true, row: JSON.parse(child.stdout) };
  } catch (error) {
    return { ok: false, timedOut: false, error: `invalid worker JSON: ${error.message}` };
  }
}

function scoreOne(opts) {
  const cache = readJson(opts.cache);
  const deck = (cache.decks || [])[opts.scoreOne];
  if (!deck) throw new Error(`No deck at index ${opts.scoreOne}`);
  const idx = loadCards();
  process.stdout.write(JSON.stringify(scoreDeck(deck, idx, opts.deckCardLimit)) + '\n');
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.scoreOne !== null) {
    scoreOne(opts);
    return;
  }
  const payload = evaluateComboTagDecks(opts);
  writeJson(opts.jsonOut, payload);
  process.stdout.write(`✓ evaluated ${payload.summary.evaluatedDecks} EDHREC combo-tag average decks\n`);
  process.stdout.write(`  combo decks ${payload.summary.comboDeckCount}; combo pairs ${payload.summary.comboPairCount}; cohesion median ${payload.summary.cohesion.median}; win median ${payload.summary.win.median}\n`);
  process.stdout.write(`  wrote ${opts.jsonOut}\n`);
}

if (require.main === module) main();
else module.exports = {
  parseArgs,
  scoreDeck,
  summarize,
  evaluateComboTagDecks,
};
