#!/usr/bin/env node
/*
 * report-score-corpus.js - compact score summary for whatever local sample
 * corpora are available. During model work, sample data may be checked in under
 * data/ or exist only as ignored caches under analysis/ or work/.
 */
const fs = require('node:fs');
const path = require('node:path');

const { build, loadCards } = require('../src/build-deck-viz');
const { evaluateCorpus } = require('./report-interaction-validation');

const ROOT = path.resolve(__dirname, '..');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

function exists(relativePath) {
  return fs.existsSync(path.join(ROOT, relativePath));
}

function firstExisting(paths) {
  return paths.find(exists) || null;
}

function rowsFromCorpus(source) {
  if (Array.isArray(source)) return source;
  return source.results || source.decks || [];
}

function loadInflationWatchlist() {
  const file = 'analysis/interaction-inflation-watchlist.json';
  if (!exists(file)) return null;
  const source = readJson(file);
  const families = Array.isArray(source.families) ? source.families : [];
  return {
    source: file,
    families: families.map(entry => ({
      family: entry.family,
      severity: entry.severity || 'watch',
      reason: entry.reason || '',
    })).filter(entry => entry.family),
  };
}

function round(value, digits = 1) {
  return Number.isFinite(value) ? +value.toFixed(digits) : 0;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function stats(rows, key) {
  const values = rows.map(row => Number(row[key])).filter(Number.isFinite).sort((a, b) => a - b);
  return {
    min: values[0] || 0,
    median: median(values),
    mean: round(values.reduce((sum, value) => sum + value, 0) / (values.length || 1)),
    max: values[values.length - 1] || 0,
  };
}

function counts(values) {
  return Object.fromEntries([...values.reduce((map, value) => map.set(value, (map.get(value) || 0) + 1), new Map()).entries()]
    .sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
}

function topRows(rows, key, limit = 5) {
  return rows
    .slice()
    .sort((a, b) => Number(b[key] || 0) - Number(a[key] || 0) || String(a.name || a.id).localeCompare(String(b.name || b.id)))
    .slice(0, limit)
    .map(row => ({ name: row.name || row.id, [key]: row[key] }));
}

function bottomRows(rows, key, limit = 5) {
  return rows
    .slice()
    .sort((a, b) => Number(a[key] || 0) - Number(b[key] || 0) || String(a.name || a.id).localeCompare(String(b.name || b.id)))
    .slice(0, limit)
    .map(row => ({ name: row.name || row.id, [key]: row[key] }));
}

function summarizeWinTuningCorpus() {
  const file = firstExisting(['data/wintuning-corpus.json', 'work/wintuning-corpus.json']);
  if (!file) return null;
  const source = readJson(file);
  const rows = rowsFromCorpus(source);
  return {
    source: file,
    deckCount: rows.length,
    failures: Array.isArray(source.failures) ? source.failures.length : 0,
    complete: Array.isArray(source) ? true : Boolean(source.meta && source.meta.complete),
    win: stats(rows, 'win'),
    cohesion: stats(rows, 'cohesion'),
    self: stats(rows, 'self'),
    gameChangers: stats(rows, 'gc'),
    bands: counts(rows.map(row => row.band || 'unknown')),
    brackets: counts(rows.map(row => `B${row.bracket || '?'}`)),
    topWin: topRows(rows, 'win'),
    bottomWin: bottomRows(rows, 'win'),
  };
}

function summarizePreconInteractionCorpus() {
  const cacheFile = firstExisting([
    'analysis/bracket/precon-reference-decks.json',
    'work/precon-reference-decks.json',
  ]);
  const fallbackFile = firstExisting(['data/precon-results.json', 'work/precon-results.json']);
  const fromCache = cacheFile
    ? preconInteractionRowsFromCache(cacheFile)
    : null;
  const rows = fromCache || (fallbackFile ? readJson(fallbackFile) : []);
  return {
    source: fromCache ? cacheFile : fallbackFile,
    deckCount: rows.length,
    cohesion: stats(rows, 'cohesion'),
    interactivePct: stats(rows, 'pctInteractive'),
    edges: stats(rows, 'edges'),
    islands: stats(rows, 'islands'),
    comboDeckCount: rows.filter(row => row.hasCombo).length,
    comboPairCount: rows.reduce((sum, row) => sum + Number(row.comboPairs || 0), 0),
    bands: counts(rows.map(row => row.band || 'unknown')),
    topCohesion: topRows(rows, 'cohesion'),
    bottomCohesion: bottomRows(rows, 'cohesion'),
    inflationWatch: summarizeInflationWatch(rows),
  };
}

function summarizeMoxfieldBracketCorpus() {
  const corpusFile = firstExisting([
    'analysis/bracket/moxfield-bracket-corpus.json',
    'work/moxfield-bracket-corpus.json',
    'data/moxfield-bracket-corpus.json',
  ]);
  if (!corpusFile) return null;
  const source = readJson(corpusFile);
  const rows = rowsFromCorpus(source);
  const sampleFile = firstExisting([
    'analysis/bracket/moxfield-bracket-sample-500.json',
    'work/moxfield-bracket-sample-500.json',
    'data/moxfield-bracket-sample-500.json',
  ]);
  const reportFile = firstExisting([
    'analysis/bracket/moxfield-bracket-report.json',
    'work/moxfield-bracket-report.json',
  ]);
  const report = reportFile ? readJson(reportFile) : null;
  const sample = sampleFile ? readJson(sampleFile) : null;
  const sampleRows = sample ? rowsFromCorpus(sample) : [];
  const interactionCacheFile = firstExisting([
    'analysis/bracket/moxfield-reference-decks.json',
    'work/moxfield-reference-decks.json',
  ]);
  const interactionRows = interactionCacheFile ? interactionRowsFromCache(interactionCacheFile) : null;
  return {
    source: corpusFile,
    sample: sampleFile,
    deckCount: rows.length,
    failures: Array.isArray(source.failures) ? source.failures.length : 0,
    complete: Array.isArray(source) ? true : Boolean(source.meta && source.meta.complete),
    sampleCounts: sampleRows.length ? counts(sampleRows.map(row => String(row.bracket || row.sourceBracket || '?'))) : {},
    sourceBrackets: counts(rows.map(row => `B${row.sourceBracket || '?'}`)),
    modelBrackets: counts(rows.map(row => `B${row.bracket || '?'}`)),
    win: stats(rows, 'win'),
    cohesion: stats(rows, 'cohesion'),
    self: stats(rows, 'self'),
    gameChangers: stats(rows, 'gc'),
    bands: counts(rows.map(row => row.band || 'unknown')),
    topWin: topRows(rows, 'win'),
    bottomWin: bottomRows(rows, 'win'),
    accuracy: report ? {
      source: reportFile,
      exactSourceBracket: round((report.exactSourceBracket?.accuracy || 0) * 100, 2),
      withinOneSourceBracket: round((report.withinOneSourceBracket?.accuracy || 0) * 100, 2),
      coarseBuckets: round((report.coarseBuckets?.accuracy || 0) * 100, 2),
    } : null,
    inflationWatch: interactionRows
      ? {
        interactionSource: interactionCacheFile,
        ...summarizeInflationWatch(interactionRows),
      }
      : {
        source: 'analysis/interaction-inflation-watchlist.json',
        note: 'No reference-deck cache found; rebuild graph rows to summarize inflation-prone families for this corpus.',
      },
  };
}

function preconInteractionRowsFromCache(relativePath) {
  return interactionRowsFromCache(relativePath);
}

function interactionRowsFromCache(relativePath) {
  const cache = readJson(relativePath);
  const decks = Array.isArray(cache) ? cache : (cache.decks || []);
  if (!decks.length) return null;
  const idx = loadCards();
  return decks.map(deck => {
    const graph = build(deck.decklist || [], idx);
    const metrics = graph.metrics || {};
    return {
      id: deck.id,
      name: deck.name || deck.title || deck.id,
      cards: graph.nodes.filter(node => node.role !== 'zone').length,
      cohesion: metrics.cohesionScore,
      band: metrics.cohesionBand,
      pctInteractive: metrics.pctInteractive,
      avgDeg: metrics.avgDegree,
      wAvgDeg: metrics.weightedAvgDegree,
      edges: graph.edges.length,
      web: metrics.largestWebShare,
      islands: metrics.islandCount,
      hasCombo: metrics.hasCombo,
      comboPairs: (metrics.comboCriticalPairs || []).length,
      loops: (metrics.combos || []).length,
      topFamilies: topFamilies(graph),
      inflationFamilies: inflationFamilies(graph),
    };
  });
}

function topFamilies(graph) {
  const counts = new Map();
  for (const edge of graph.edges || []) {
    for (const interaction of edge.interactions || []) {
      counts.set(interaction.family, (counts.get(interaction.family) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([family, count]) => `${family}:${count}`);
}

function inflationFamilies(graph) {
  const watchlist = loadInflationWatchlist();
  const watched = new Set((watchlist?.families || []).map(entry => entry.family));
  if (!watched.size) return [];
  const familyCounts = countFamilies(graph);
  return [...familyCounts.entries()]
    .filter(([family]) => watched.has(family))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([family, count]) => `${family}:${count}`);
}

function countFamilies(graph) {
  const familyCounts = new Map();
  for (const edge of graph.edges || []) {
    for (const interaction of edge.interactions || []) {
      familyCounts.set(interaction.family, (familyCounts.get(interaction.family) || 0) + 1);
    }
  }
  return familyCounts;
}

function parseFamilyCount(value) {
  const text = String(value || '');
  const index = text.lastIndexOf(':');
  if (index <= 0) return null;
  const family = text.slice(0, index);
  const count = Number(text.slice(index + 1));
  return family && Number.isFinite(count) ? { family, count } : null;
}

function summarizeInflationWatch(rows) {
  const watchlist = loadInflationWatchlist();
  if (!watchlist) return null;
  const metadata = new Map(watchlist.families.map(entry => [entry.family, entry]));
  const totals = new Map();
  const deckHits = new Map();
  const examples = new Map();

  for (const row of rows) {
    const seenInDeck = new Set();
    for (const value of row.inflationFamilies || []) {
      const parsed = parseFamilyCount(value);
      if (!parsed || !metadata.has(parsed.family)) continue;
      totals.set(parsed.family, (totals.get(parsed.family) || 0) + parsed.count);
      seenInDeck.add(parsed.family);
      if (!examples.has(parsed.family)) examples.set(parsed.family, []);
      const familyExamples = examples.get(parsed.family);
      if (familyExamples.length < 3) {
        familyExamples.push({
          name: row.name || row.id,
          count: parsed.count,
        });
      }
    }
    for (const family of seenInDeck) {
      deckHits.set(family, (deckHits.get(family) || 0) + 1);
    }
  }

  return {
    source: watchlist.source,
    watchedFamilyCount: watchlist.families.length,
    rowsWithFamilyBreakdown: rows.filter(row => Array.isArray(row.inflationFamilies)).length,
    totals: [...metadata.keys()].map(family => ({
      family,
      severity: metadata.get(family).severity,
      count: totals.get(family) || 0,
      deckHits: deckHits.get(family) || 0,
      examples: examples.get(family) || [],
      reason: metadata.get(family).reason,
    })).sort((a, b) => b.count - a.count || a.family.localeCompare(b.family)),
  };
}

function summarizeInteractionValidation() {
  const corpus = readJson('analysis/interaction-validation/corpus.json');
  const report = evaluateCorpus(corpus);
  return {
    cases: report.summary.caseCount,
    positives: report.summary.positiveCount,
    negatives: report.summary.negativeCount,
    recall: report.summary.recall,
    sampledPrecision: report.summary.sampledPrecision,
    falseNegatives: report.summary.falseNegatives,
    falsePositives: report.summary.falsePositives,
    twoCardRecall: report.summary.twoCardRecall,
    threeCardRecall: report.summary.threeCardRecall,
    averageProofConfidence: report.summary.averageProofConfidence,
  };
}

function summarizeBaseline() {
  const report = readJson('analysis/interaction-baseline/interaction-baseline.json');
  return {
    deckCount: report.aggregate.deckCount,
    totalEdges: report.aggregate.totalEdges,
    totalInteractions: report.aggregate.totalInteractions,
    totalComboCriticalPairs: report.aggregate.totalComboCriticalPairs,
    totalComboCriticalTriples: report.aggregate.totalComboCriticalTriples,
    goldenFixtures: report.aggregate.goldenFixtureCount,
    goldenFixtureFailures: report.aggregate.goldenFixtureFailures.length,
    representativeDeckScores: report.decks.map(deck => ({
      id: deck.id,
      cohesion: deck.metricsSnapshot.cohesionScore,
      win: deck.metricsSnapshot.winTuningScore,
      self: deck.metricsSnapshot.selfSufficiencyScore,
      edges: deck.edgeCount,
    })),
  };
}

function summarizeAudit() {
  const audit = readJson('data/AUDIT-100-decks-round5-FINAL.json');
  return {
    evaluationCount: audit.evaluationCount,
    verdictCounts: audit.verdictCounts,
  };
}

function main() {
  const report = {
    generatedBy: 'scripts/report-score-corpus.js',
    note: 'Uses whichever local sample/corpus files exist. Ignored analysis/ and work/ caches are valid inputs for current model evaluation.',
    interactionValidation: summarizeInteractionValidation(),
    baseline: summarizeBaseline(),
    preconWinTuningCorpus: summarizeWinTuningCorpus(),
    preconInteractionCorpus: summarizePreconInteractionCorpus(),
    moxfieldBracketCorpus: summarizeMoxfieldBracketCorpus(),
    auditRound5: summarizeAudit(),
  };
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
}

if (require.main === module) main();
