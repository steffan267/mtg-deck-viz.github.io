const assert = require('node:assert/strict');
const corpus = require('../analysis/interaction-validation/corpus.json');
const { evaluateCorpus, renderMarkdown } = require('../scripts/report-interaction-validation');

const report = evaluateCorpus(corpus);

assert.equal(corpus.schemaVersion, 'interaction-validation-corpus.v1');
assert.equal(report.schemaVersion, 'interaction-validation-report.v1');
assert.equal(report.summary.caseCount, 11);
assert.equal(report.summary.positiveCount, 7);
assert.equal(report.summary.negativeCount, 4);
assert.equal(report.summary.truePositives, 6);
assert.equal(report.summary.falseNegatives, 1);
assert.equal(report.summary.falsePositives, 0);
assert.equal(report.summary.recall, 0.857);
assert.equal(report.summary.twoCardRecall, 0.667);
assert.equal(report.summary.threeCardRecall, 1);
assert.equal(report.summary.sampledPrecision, 1);
assert.equal(report.summary.falsePositiveHubRate, 0);
assert.equal(report.summary.unexplainedRate, 0.091);
assert.equal(report.summary.averageProofConfidence, 0.75);

const rowsById = new Map(report.rows.map(row => [row.id, row]));
assert.equal(rowsById.get('known-gap-library-exile-win').pass, false, 'known library-exile gap should stay visible');
assert.equal(rowsById.get('negative-one-shot-blink').actualStatus, 'not-repeatable');
assert.deepEqual(rowsById.get('negative-unreplenished-aristocrats').rejectionReasons, ['body is not replenished by the package']);

const coverageById = new Map(report.sourceCoverage.map(source => [source.id, source]));
assert.equal(coverageById.get('commander-spellbook-seeds').caseCount, 4);
assert.equal(coverageById.get('known-combo-seeds').caseCount, 3);
assert.equal(coverageById.get('negative-near-misses').caseCount, 4);
assert.equal(coverageById.get('precon-sample-100').deckCount, 100);
assert.equal(coverageById.get('precon-sample-100').comboDeckCount, 1);
assert.equal(coverageById.get('precon-sample-100').comboPairCount, 4);
assert.equal(coverageById.get('moxfield-bracket-464').deckCount, 464);
assert.deepEqual(coverageById.get('moxfield-bracket-464').brackets, [1, 2, 3, 4, 5]);
assert.equal(coverageById.get('casual-synergy-audit-96').evaluationCount, 96);

assert.deepEqual(report.manualAudit.topMissedCombos, ['known-gap-library-exile-win']);
assert.deepEqual(report.manualAudit.topFalsePositives, []);
assert.deepEqual(report.manualAudit.lowConfidenceProofs, []);
assert.ok(report.manualAudit.suspiciousHubs.some(hub => hub.family === 'draw' && hub.count === 42));
assert.ok(report.manualAudit.suspiciousHubs.some(hub => hub.family === 'ramp→sink' && hub.count === 42));

assert.equal(report.deckSmoke[0].status, 'ok');
assert.equal(report.deckSmoke[0].edgeCount, 148);
assert.equal(report.deckSmoke[0].weakInteractionShare, 0.937);

const markdown = renderMarkdown(report);
assert.match(markdown, /## Source coverage/);
assert.match(markdown, /`moxfield-bracket-464`/);
assert.match(markdown, /Missed combos: known-gap-library-exile-win/);
assert.match(markdown, /False positives: none/);

process.stdout.write('Interaction validation tests passed\n');
