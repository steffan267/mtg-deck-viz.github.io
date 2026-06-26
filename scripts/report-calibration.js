#!/usr/bin/env node
/*
 * report-calibration.js - benchmark calibration report for interaction-model
 * changes. This is intentionally separate from report-score-corpus.js: it is a
 * benchmark dashboard, not just a compact score snapshot.
 */
const fs = require('node:fs');
const path = require('node:path');

const { build, loadCards } = require('../src/build-deck-viz');

const ROOT = path.resolve(__dirname, '..');

const WATCHLIST_FILE = 'analysis/interaction-inflation-watchlist.json';
const AUDIT_FILE = 'data/AUDIT-100-decks-round5-FINAL.json';
const PRECON_CACHE_FILE = 'analysis/bracket/precon-reference-decks.json';
const PRECON_BASELINE_FILE = 'data/wintuning-corpus.json';
const MOXFIELD_CACHE_FILE = 'analysis/bracket/moxfield-reference-decks.json';
const MOXFIELD_BASELINE_FILE = 'analysis/bracket/moxfield-bracket-corpus.json';
const MOXFIELD_BRACKET_REPORT_FILE = 'analysis/bracket/moxfield-bracket-report.json';

const ENGINE_FAMILIES = [
  'tap-free-cast→untap-engine',
  'convoke-fodder→payoff',
  'convoke-spell→payoff',
  'opponent-draw→punisher',
  'lifegain-source→drain-payoff',
  'attachment-source→payoff',
  'graveyard-fuel→recursion',
  'land-recursion→landfall',
  'combat-resource→extra-combat-loop',
  'artifact-token→extra-turn-loop',
  'draw-damage-feedback-loop',
];

function usage() {
  return [
    'Usage: node scripts/report-calibration.js [--out file] [--quiet]',
    '',
    'Produces a JSON calibration report from local corpus/cache artifacts.',
  ].join('\n');
}

function parseArgs(argv) {
  const args = { out: null, quiet: false };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--out') args.out = argv[++i];
    else if (arg === '--quiet') args.quiet = true;
    else if (arg === '--help' || arg === '-h') {
      process.stdout.write(usage() + '\n');
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}\n${usage()}`);
    }
  }
  return args;
}

function abs(relativePath) {
  return path.join(ROOT, relativePath);
}

function exists(relativePath) {
  return fs.existsSync(abs(relativePath));
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(abs(relativePath), 'utf8'));
}

function writeJson(file, value) {
  const target = path.isAbsolute(file) ? file : abs(file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(value, null, 2) + '\n');
}

function rowsFromCorpus(source) {
  if (!source) return [];
  if (Array.isArray(source)) return source;
  return source.results || source.decks || [];
}

function round(value, digits = 2) {
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
    mean: round(nums.reduce((sum, value) => sum + value, 0) / (nums.length || 1), 1),
    max: nums[nums.length - 1] || 0,
  };
}

function counts(values) {
  const map = new Map();
  for (const value of values) map.set(value, (map.get(value) || 0) + 1);
  return Object.fromEntries([...map.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
}

function normalizeName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function topRows(rows, key, limit = 8) {
  return rows
    .slice()
    .sort((a, b) => Number(b[key] || 0) - Number(a[key] || 0) || String(a.name || a.id).localeCompare(String(b.name || b.id)))
    .slice(0, limit);
}

function familyCounts(graph) {
  const out = new Map();
  for (const edge of graph.edges || []) {
    for (const interaction of edge.interactions || []) {
      out.set(interaction.family, (out.get(interaction.family) || 0) + 1);
    }
  }
  return out;
}

function buildRows(cacheFile, baselineFile) {
  if (!exists(cacheFile)) return { source: cacheFile, available: false, rows: [] };
  const cache = readJson(cacheFile);
  const decks = Array.isArray(cache) ? cache : (cache.decks || []);
  const baselineRows = exists(baselineFile) ? rowsFromCorpus(readJson(baselineFile)) : [];
  const baselineById = new Map(baselineRows.filter(row => row.id).map(row => [row.id, row]));
  const baselineByName = new Map(baselineRows.map(row => [normalizeName(row.name || row.title), row]));
  const idx = loadCards();
  const rows = decks.map(deck => {
    const graph = build(deck.decklist || [], idx);
    const metrics = graph.metrics || {};
    const baseline = baselineById.get(deck.id) || baselineByName.get(normalizeName(deck.name || deck.title));
    const families = familyCounts(graph);
    return {
      id: deck.id,
      name: deck.name || deck.title || deck.id,
      sourceBracket: baseline?.sourceBracket || deck.sourceBracket || null,
      current: {
        win: metrics.winTuningScore,
        cohesion: metrics.cohesionScore,
        self: metrics.selfSufficiencyScore,
        band: metrics.winTuningBand,
        cohesionBand: metrics.cohesionBand,
        bracket: metrics.commanderBracket?.bracket || null,
        edges: graph.edges.length,
        islands: metrics.islandCount,
        interactivePct: metrics.pctInteractive,
        hasCombo: metrics.hasCombo,
        comboPairs: (metrics.comboCriticalPairs || []).length,
      },
      baseline: baseline ? {
        win: baseline.win,
        cohesion: baseline.cohesion,
        self: baseline.self,
        band: baseline.band,
        bracket: baseline.bracket,
        edges: baseline.edges,
        islands: baseline.islands,
        interactivePct: baseline.pctInteractive,
      } : null,
      families,
    };
  });
  return { source: cacheFile, baseline: baselineFile, available: true, rows };
}

function deltaValue(current, baseline) {
  if (!Number.isFinite(Number(current)) || !Number.isFinite(Number(baseline))) return null;
  return Number(current) - Number(baseline);
}

function deltaRows(rows) {
  return rows
    .filter(row => row.baseline)
    .map(row => ({
      id: row.id,
      name: row.name,
      sourceBracket: row.sourceBracket,
      winDelta: deltaValue(row.current.win, row.baseline.win),
      cohesionDelta: deltaValue(row.current.cohesion, row.baseline.cohesion),
      selfDelta: deltaValue(row.current.self, row.baseline.self),
      bracketDelta: deltaValue(row.current.bracket, row.baseline.bracket),
      edgeDelta: deltaValue(row.current.edges, row.baseline.edges),
      islandDelta: deltaValue(row.current.islands, row.baseline.islands),
      before: row.baseline,
      after: row.current,
    }));
}

function summarizeDeltas(rows) {
  const deltas = deltaRows(rows);
  const numeric = key => deltas.map(row => row[key]).filter(Number.isFinite);
  return {
    matchedDecks: deltas.length,
    win: stats(numeric('winDelta')),
    cohesion: stats(numeric('cohesionDelta')),
    self: stats(numeric('selfDelta')),
    bracket: stats(numeric('bracketDelta')),
    edges: stats(numeric('edgeDelta')),
    islands: stats(numeric('islandDelta')),
    largestCohesionGains: topRows(deltas, 'cohesionDelta').slice(0, 8),
    largestCohesionDrops: deltas
      .slice()
      .sort((a, b) => Number(a.cohesionDelta || 0) - Number(b.cohesionDelta || 0) || a.name.localeCompare(b.name))
      .slice(0, 8),
  };
}

function summarizeBracketAccuracy(rows, reportFile) {
  const withSource = rows.filter(row => Number.isFinite(Number(row.sourceBracket)) && Number.isFinite(Number(row.current.bracket)));
  const exact = withSource.filter(row => Number(row.sourceBracket) === Number(row.current.bracket)).length;
  const withinOne = withSource.filter(row => Math.abs(Number(row.sourceBracket) - Number(row.current.bracket)) <= 1).length;
  const coarse = withSource.filter(row => coarseBucket(row.sourceBracket) === coarseBucket(row.current.bracket)).length;
  const report = exists(reportFile) ? readJson(reportFile) : null;
  return {
    source: reportFile,
    evaluatedDecks: withSource.length,
    exactSourceBracket: pct(exact, withSource.length),
    withinOneSourceBracket: pct(withinOne, withSource.length),
    coarseBuckets: pct(coarse, withSource.length),
    sourceBracketDistribution: counts(withSource.map(row => `B${row.sourceBracket}`)),
    modelBracketDistribution: counts(withSource.map(row => `B${row.current.bracket}`)),
    checkedInReport: report ? {
      exactSourceBracket: round((report.exactSourceBracket?.accuracy || 0) * 100, 2),
      withinOneSourceBracket: round((report.withinOneSourceBracket?.accuracy || 0) * 100, 2),
      coarseBuckets: round((report.coarseBuckets?.accuracy || 0) * 100, 2),
    } : null,
  };
}

function coarseBucket(bracket) {
  const value = Number(bracket);
  if (value <= 2) return 'low';
  if (value === 3) return 'mid';
  return 'high';
}

function pct(count, total) {
  return total ? round((count / total) * 100, 2) : 0;
}

function summarizePreconBands(rows) {
  return {
    deckCount: rows.length,
    winBands: counts(rows.map(row => row.current.band || 'unknown')),
    cohesionBands: counts(rows.map(row => row.current.cohesionBand || 'unknown')),
    brackets: counts(rows.map(row => `B${row.current.bracket || '?'}`)),
    cohesion: stats(rows.map(row => row.current.cohesion)),
    win: stats(rows.map(row => row.current.win)),
    self: stats(rows.map(row => row.current.self)),
  };
}

function loadWatchlist() {
  if (!exists(WATCHLIST_FILE)) return [];
  const source = readJson(WATCHLIST_FILE);
  return (source.families || []).map(entry => ({
    family: entry.family,
    severity: entry.severity || 'watch',
    reason: entry.reason || '',
  })).filter(entry => entry.family);
}

function summarizeFamilies(rows, familyEntries) {
  return familyEntries.map(entry => {
    let total = 0;
    let deckHits = 0;
    const examples = [];
    for (const row of rows) {
      const count = row.families.get(entry.family) || 0;
      if (!count) continue;
      total += count;
      deckHits += 1;
      if (examples.length < 5) {
        examples.push({
          name: row.name,
          count,
          cohesion: row.current.cohesion,
          bracket: row.current.bracket,
        });
      }
    }
    return { ...entry, count: total, deckHits, examples };
  }).sort((a, b) => b.count - a.count || a.family.localeCompare(b.family));
}

function summarizeEngineCoverage(preconRows, moxfieldRows) {
  const families = ENGINE_FAMILIES.map(family => ({ family }));
  return {
    families: ENGINE_FAMILIES,
    precon: summarizeFamilies(preconRows, families),
    moxfieldBracket: summarizeFamilies(moxfieldRows, families),
  };
}

function loadAuditEntries() {
  if (!exists(AUDIT_FILE)) return [];
  const audit = readJson(AUDIT_FILE);
  return audit.rawEvals || audit.evaluations || audit.decks || rowsFromCorpus(audit);
}

function summarizeAuditTracking(preconRows) {
  const auditRows = loadAuditEntries();
  const byName = new Map(preconRows.map(row => [normalizeName(row.name), row]));
  const matched = auditRows.map(entry => {
    const current = byName.get(normalizeName(entry.name));
    return {
      name: entry.name,
      verdict: entry.verdict || 'unknown',
      auditedCohesion: entry.cohesion,
      currentCohesion: current?.current.cohesion ?? null,
      cohesionDeltaFromAudit: current ? deltaValue(current.current.cohesion, entry.cohesion) : null,
      currentBand: current?.current.cohesionBand || null,
      hasCurrentDeck: Boolean(current),
    };
  });
  const byVerdict = {};
  for (const verdict of ['too-low', 'too-high', 'accurate', 'unknown']) {
    const rows = matched.filter(row => row.verdict === verdict);
    if (!rows.length) continue;
    byVerdict[verdict] = {
      count: rows.length,
      matchedDecks: rows.filter(row => row.hasCurrentDeck).length,
      currentCohesion: stats(rows.map(row => row.currentCohesion)),
      cohesionDeltaFromAudit: stats(rows.map(row => row.cohesionDeltaFromAudit)),
      largestCurrentGains: topRows(rows.filter(row => Number.isFinite(row.cohesionDeltaFromAudit)), 'cohesionDeltaFromAudit', 5),
      largestCurrentDrops: rows
        .filter(row => Number.isFinite(row.cohesionDeltaFromAudit))
        .slice()
        .sort((a, b) => a.cohesionDeltaFromAudit - b.cohesionDeltaFromAudit || a.name.localeCompare(b.name))
        .slice(0, 5),
    };
  }
  return {
    source: AUDIT_FILE,
    auditDecks: auditRows.length,
    verdictCounts: counts(matched.map(row => row.verdict)),
    byVerdict,
  };
}

function main() {
  const args = parseArgs(process.argv);
  const precon = buildRows(PRECON_CACHE_FILE, PRECON_BASELINE_FILE);
  const moxfield = buildRows(MOXFIELD_CACHE_FILE, MOXFIELD_BASELINE_FILE);
  const watchlist = loadWatchlist();
  const report = {
    schemaVersion: 'calibration-report.v1',
    generatedBy: 'scripts/report-calibration.js',
    generatedAt: new Date().toISOString(),
    inputs: {
      preconReferenceDecks: precon.source,
      preconBaseline: precon.baseline,
      moxfieldReferenceDecks: moxfield.source,
      moxfieldBaseline: moxfield.baseline,
      moxfieldBracketReport: MOXFIELD_BRACKET_REPORT_FILE,
      audit: AUDIT_FILE,
      inflationWatchlist: WATCHLIST_FILE,
    },
    bracketAccuracy: summarizeBracketAccuracy(moxfield.rows, MOXFIELD_BRACKET_REPORT_FILE),
    preconBandDistribution: summarizePreconBands(precon.rows),
    auditTracking: summarizeAuditTracking(precon.rows),
    watchedInflationFamilies: {
      source: WATCHLIST_FILE,
      precon: summarizeFamilies(precon.rows, watchlist),
      moxfieldBracket: summarizeFamilies(moxfield.rows, watchlist),
    },
    realEngineFamilyCoverage: summarizeEngineCoverage(precon.rows, moxfield.rows),
    deltas: {
      precon: summarizeDeltas(precon.rows),
      moxfieldBracket: summarizeDeltas(moxfield.rows),
    },
  };
  if (args.out) writeJson(args.out, report);
  if (!args.quiet) process.stdout.write(JSON.stringify(report, null, 2) + '\n');
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(String(error && error.stack || error) + '\n');
    process.exit(1);
  }
}
