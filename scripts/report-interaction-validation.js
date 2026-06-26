#!/usr/bin/env node
/*
 * report-interaction-validation.js — deterministic validation report for the
 * local interaction proof-search corpus. Runtime is printed to stdout but not
 * embedded in artifacts so checked reports remain reproducible.
 */
const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { getComboFamily } = require('../src/combo-family-library');
const { ProofStatus } = require('../src/domain/interaction-constants');
const { provePackage } = require('../src/interaction-proof-search');
const { createProgress } = require('../lib/progress');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_CORPUS = path.join(ROOT, 'analysis/interaction-validation/corpus.json');
const DEFAULT_JSON_OUT = path.join(ROOT, 'analysis/interaction-validation/report.json');
const DEFAULT_MD_OUT = path.join(ROOT, 'analysis/interaction-validation/report.md');

const CONFIDENCE_SCORE = { exact: 1, pattern: 0.75, heuristic: 0.45, unknown: 0.2 };

function parseArgs(argv) {
  const args = { corpus: DEFAULT_CORPUS, jsonOut: DEFAULT_JSON_OUT, mdOut: DEFAULT_MD_OUT, mode: 'print' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--corpus') { args.corpus = path.resolve(argv[++i]); continue; }
    if (a === '--json-out') { args.jsonOut = path.resolve(argv[++i]); continue; }
    if (a === '--md-out') { args.mdOut = path.resolve(argv[++i]); continue; }
    if (a === '--write') { args.mode = 'write'; continue; }
    if (a === '--check') { args.mode = 'check'; continue; }
    if (a === '--help' || a === '-h') {
      process.stdout.write('Usage: node scripts/report-interaction-validation.js [--write|--check] [--corpus file]\n');
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

function stableJson(value) {
  return JSON.stringify(value, null, 2) + '\n';
}

function round(value, digits = 3) {
  if (!Number.isFinite(value)) return 0;
  return +value.toFixed(digits);
}

function pct(numerator, denominator) {
  return denominator ? round(numerator / denominator, 3) : 0;
}

function proofFamilies(result) {
  return (result.proofs || []).map(proof => proof.family).sort();
}

function expectedPositive(testCase) {
  return testCase.expect && testCase.expect.status === ProofStatus.Proven;
}

function casePassed(testCase, result) {
  const actualProven = result.status === ProofStatus.Proven;
  if (!expectedPositive(testCase)) return !actualProven;
  const expectedFamilies = (testCase.expect.families || []).slice().sort();
  return actualProven && expectedFamilies.every(family => proofFamilies(result).includes(family));
}

function confidenceForResult(result) {
  const scores = [];
  for (const family of proofFamilies(result)) {
    const def = getComboFamily(family);
    scores.push(CONFIDENCE_SCORE[(def && def.confidenceGate) || 'unknown'] || CONFIDENCE_SCORE.unknown);
  }
  return scores.length ? scores.reduce((sum, n) => sum + n, 0) / scores.length : 0;
}

function loadDeckSmoke(corpus) {
  const out = [];
  for (const smoke of corpus.deckSmoke || []) {
    const sourcePath = path.join(ROOT, smoke.source);
    if (!fs.existsSync(sourcePath)) {
      out.push({ id: smoke.id, status: 'missing-source', source: smoke.source });
      continue;
    }
    const baseline = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
    const deck = (baseline.decks || []).find(d => d.id === smoke.baselineDeckId);
    if (!deck) {
      out.push({ id: smoke.id, status: 'missing-deck', source: smoke.source, baselineDeckId: smoke.baselineDeckId });
      continue;
    }
    out.push({
      id: smoke.id,
      status: 'ok',
      source: smoke.source,
      baselineDeckId: smoke.baselineDeckId,
      edgeCount: deck.edgeCount,
      comboCriticalPairCount: deck.combos.comboCriticalPairCount,
      comboCriticalTripleCount: deck.combos.comboCriticalTripleCount,
      highFanoutFamilies: deck.reviewWarnings.highFamilyFanout,
      weakInteractionShare: deck.reviewWarnings.weakInteractionShare,
    });
  }
  return out;
}

function readJsonIfPresent(relativePath) {
  if (!relativePath) return null;
  const sourcePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(sourcePath)) return null;
  return JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
}

function summarizeTopFamilies(rows) {
  const counts = new Map();
  for (const row of rows || []) {
    for (const entry of row.topFamilies || []) {
      const [family, rawCount] = String(entry).split(':');
      counts.set(family, (counts.get(family) || 0) + Number(rawCount || 0));
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([family, count]) => ({ family, count }));
}

function summarizeSourceCoverage(corpus) {
  return (corpus.sourceCoverage || []).map(source => {
    const summary = {
      id: source.id,
      type: source.type,
      status: source.status,
      purpose: source.purpose,
    };

    if (source.caseSourceType) {
      summary.caseSourceType = source.caseSourceType;
      summary.caseCount = (corpus.cases || []).filter(testCase => testCase.sourceType === source.caseSourceType).length;
      return summary;
    }

    const json = readJsonIfPresent(source.source);
    summary.source = source.source;
    summary.sourceStatus = json ? 'ok' : 'missing';
    if (!json) return summary;

    if (Array.isArray(json)) {
      summary.deckCount = json.length;
      summary.comboDeckCount = json.filter(row => row.hasCombo).length;
      summary.comboPairCount = json.reduce((sum, row) => sum + Number(row.comboPairs || 0), 0);
      summary.topFamilies = summarizeTopFamilies(json);
      return summary;
    }

    if (json.meta && json.results) {
      summary.deckCount = Number(json.meta.analyzedDecks || json.results.length || 0);
      summary.failedDeckCount = Number(json.meta.failedDecks || 0);
      summary.complete = Boolean(json.meta.complete);
      summary.brackets = [...new Set(json.results.map(row => row.sourceBracket).filter(Boolean))].sort((a, b) => a - b);
      return summary;
    }

    if (json.evaluationCount != null || json.verdictCounts) {
      summary.evaluationCount = Number(json.evaluationCount || 0);
      summary.verdictCounts = json.verdictCounts || {};
      summary.topFalsePositivePatterns = (json.synthesis && json.synthesis.topFalsePositivePatterns || [])
        .slice(0, 3)
        .map(pattern => pattern.pattern || pattern);
    }

    return summary;
  });
}

function evaluateCorpus(corpus) {
  const rows = [];
  const cases = corpus.cases || [];
  const progress = createProgress('interaction-validation-cases', cases.length);
  progress.start();
  for (let index = 0; index < cases.length; index++) {
    const testCase = cases[index];
    const result = provePackage(testCase.cards);
    const positive = expectedPositive(testCase);
    const pass = casePassed(testCase, result);
    const rejectionReasons = pass && result.status === ProofStatus.Proven
      ? []
      : (result.rejections || []).map(rejection => rejection.reason).sort();
    rows.push({
      id: testCase.id,
      sourceType: testCase.sourceType,
      cardCount: testCase.cards.length,
      expectedStatus: positive ? ProofStatus.Proven : 'not-proven',
      expectedFamilies: (testCase.expect && testCase.expect.families) || [],
      actualStatus: result.status,
      actualFamilies: proofFamilies(result),
      pass,
      confidence: round(confidenceForResult(result), 3),
      rejectionReasons,
    });
    progress.tick(index + 1, `last=${testCase.id}`);
  }
  progress.done(`rows=${rows.length}`);

  const positives = rows.filter(row => row.expectedStatus === ProofStatus.Proven);
  const negatives = rows.filter(row => row.expectedStatus !== ProofStatus.Proven);
  const truePositives = positives.filter(row => row.pass).length;
  const falseNegatives = positives.length - truePositives;
  const falsePositives = negatives.filter(row => !row.pass).length;
  const twoCardPositives = positives.filter(row => row.cardCount === 2);
  const threeCardPositives = positives.filter(row => row.cardCount === 3);
  const unexplained = rows.filter(row => row.actualStatus === ProofStatus.NoProof && row.expectedStatus === ProofStatus.Proven);
  const confidenceRows = rows.filter(row => row.actualStatus === ProofStatus.Proven);
  const deckSmoke = loadDeckSmoke(corpus);

  return {
    schemaVersion: 'interaction-validation-report.v1',
    corpusVersion: corpus.schemaVersion,
    runtime: { measuredSeparately: true, budgetMs: 250 },
    summary: {
      caseCount: rows.length,
      positiveCount: positives.length,
      negativeCount: negatives.length,
      truePositives,
      falseNegatives,
      falsePositives,
      recall: pct(truePositives, positives.length),
      twoCardRecall: pct(twoCardPositives.filter(row => row.pass).length, twoCardPositives.length),
      threeCardRecall: pct(threeCardPositives.filter(row => row.pass).length, threeCardPositives.length),
      sampledPrecision: pct(truePositives, truePositives + falsePositives),
      falsePositiveHubRate: pct(falsePositives, negatives.length),
      unexplainedRate: pct(unexplained.length, rows.length),
      averageProofConfidence: round(confidenceRows.reduce((sum, row) => sum + row.confidence, 0) / (confidenceRows.length || 1), 3),
    },
    rows: rows.sort((a, b) => a.id.localeCompare(b.id)),
    sourceCoverage: summarizeSourceCoverage(corpus),
    deckSmoke,
    manualAudit: {
      topMissedCombos: rows.filter(row => row.expectedStatus === ProofStatus.Proven && !row.pass).map(row => row.id),
      topFalsePositives: rows.filter(row => row.expectedStatus !== ProofStatus.Proven && !row.pass).map(row => row.id),
      suspiciousHubs: deckSmoke.flatMap(deck => (deck.highFanoutFamilies || []).map(family => ({ deckId: deck.id, family: family.family, count: family.count }))),
      lowConfidenceProofs: rows.filter(row => row.actualStatus === ProofStatus.Proven && row.confidence < 0.6).map(row => row.id),
      cardsWithUnknownClauses: [],
    },
  };
}

function renderMarkdown(report) {
  const lines = [];
  lines.push('# Interaction validation report');
  lines.push('');
  lines.push(`Schema: \`${report.schemaVersion}\``);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  for (const [key, value] of Object.entries(report.summary)) lines.push(`- ${key}: ${Array.isArray(value) ? value.join(', ') : value}`);
  lines.push('');
  lines.push('Runtime is measured by the CLI and intentionally kept out of checked artifacts.');
  lines.push('');
  lines.push('## Source coverage');
  lines.push('');
  for (const source of report.sourceCoverage || []) {
    const facts = [];
    if (source.caseCount != null) facts.push(`${source.caseCount} cases`);
    if (source.deckCount != null) facts.push(`${source.deckCount} decks`);
    if (source.comboDeckCount != null) facts.push(`${source.comboDeckCount} combo decks`);
    if (source.evaluationCount != null) facts.push(`${source.evaluationCount} evaluations`);
    if (source.failedDeckCount != null) facts.push(`${source.failedDeckCount} failed decks`);
    lines.push(`- \`${source.id}\` (${source.type}, ${source.status}): ${facts.join('; ') || source.sourceStatus || 'tracked'}`);
  }
  lines.push('');
  lines.push('## Cases');
  lines.push('');
  for (const row of report.rows) {
    lines.push(`- ${row.pass ? 'PASS' : 'FAIL'} \`${row.id}\`: expected ${row.expectedStatus}${row.expectedFamilies.length ? ` (${row.expectedFamilies.join(', ')})` : ''}; actual ${row.actualStatus}${row.actualFamilies.length ? ` (${row.actualFamilies.join(', ')})` : ''}`);
  }
  lines.push('');
  lines.push('## Manual audit queues');
  lines.push('');
  lines.push(`- Missed combos: ${report.manualAudit.topMissedCombos.join(', ') || 'none'}`);
  lines.push(`- False positives: ${report.manualAudit.topFalsePositives.join(', ') || 'none'}`);
  lines.push(`- Low-confidence proofs: ${report.manualAudit.lowConfidenceProofs.join(', ') || 'none'}`);
  lines.push(`- Suspicious hubs: ${report.manualAudit.suspiciousHubs.map(h => `${h.deckId}:${h.family}=${h.count}`).join(', ') || 'none'}`);
  return lines.join('\n') + '\n';
}

function writeArtifacts(report, args) {
  fs.mkdirSync(path.dirname(args.jsonOut), { recursive: true });
  fs.writeFileSync(args.jsonOut, stableJson(report));
  fs.writeFileSync(args.mdOut, renderMarkdown(report));
}

function checkArtifacts(report, args) {
  const expectedJson = stableJson(report);
  const expectedMd = renderMarkdown(report);
  const mismatches = [];
  if (!fs.existsSync(args.jsonOut) || fs.readFileSync(args.jsonOut, 'utf8') !== expectedJson) mismatches.push(path.relative(ROOT, args.jsonOut));
  if (!fs.existsSync(args.mdOut) || fs.readFileSync(args.mdOut, 'utf8') !== expectedMd) mismatches.push(path.relative(ROOT, args.mdOut));
  return mismatches;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const corpus = JSON.parse(fs.readFileSync(args.corpus, 'utf8'));
  const start = performance.now();
  const report = evaluateCorpus(corpus);
  const runtimeMs = round(performance.now() - start, 1);
  if (args.mode === 'write') {
    writeArtifacts(report, args);
    process.stdout.write(`Wrote ${path.relative(ROOT, args.jsonOut)} and ${path.relative(ROOT, args.mdOut)}; runtime ${runtimeMs}ms\n`);
    return;
  }
  if (args.mode === 'check') {
    const mismatches = checkArtifacts(report, args);
    if (mismatches.length) {
      process.stderr.write(`Interaction validation report drift detected in: ${mismatches.join(', ')}\n`);
      process.stderr.write('Run `node scripts/report-interaction-validation.js --write` after reviewing metric movement.\n');
      process.exitCode = 1;
      return;
    }
    process.stdout.write(`Interaction validation artifacts are current; runtime ${runtimeMs}ms\n`);
    return;
  }
  process.stdout.write(stableJson(Object.assign({}, report, { runtimeMeasuredMs: runtimeMs })));
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.stack || error);
    process.exit(1);
  }
} else {
  module.exports = {
    evaluateCorpus,
    renderMarkdown,
  };
}
