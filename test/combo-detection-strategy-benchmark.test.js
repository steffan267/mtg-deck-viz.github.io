const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const root = path.join(__dirname, '..');
const output = execFileSync(process.execPath, [path.join(root, 'scripts', 'benchmark-combo-detection-strategies.js')], {
  cwd: root,
  encoding: 'utf8',
});
const result = JSON.parse(output);

assert.equal(result.version, 'combo-strategy-benchmark.v1');
assert.equal(result.generatedAt, '1970-01-01T00:00:00.000Z');
assert.deepEqual(result, JSON.parse(JSON.stringify(result)));
assert.deepEqual(result.cases, [
  {
    caseId: 'resource-loops',
    rows: [
      {
        strategyId: 'brute-force-combinations',
        candidateCount: 63,
        proofCount: 40,
        proofFamilies: [
          'blink-etb-land-untap-loop',
          'draw-damage-feedback-loop',
          'lifegain-lifeloss-loop',
          'self-untap-mana-loop',
        ],
      },
      {
        strategyId: 'graph-resource-search',
        candidateCount: 5,
        proofCount: 3,
        proofFamilies: [
          'draw-damage-feedback-loop',
          'lifegain-lifeloss-loop',
          'self-untap-mana-loop',
        ],
      },
      {
        strategyId: 'rule-template-search',
        candidateCount: 4,
        proofCount: 4,
        proofFamilies: [
          'blink-etb-land-untap-loop',
          'draw-damage-feedback-loop',
          'lifegain-lifeloss-loop',
          'self-untap-mana-loop',
        ],
      },
    ],
  },
]);

process.stdout.write('combo detection strategy benchmark test passed\n');
