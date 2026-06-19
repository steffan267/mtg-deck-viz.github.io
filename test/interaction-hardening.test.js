const assert = require('node:assert/strict');
const { BUDGETS, runHardeningChecks } = require('../scripts/check-interaction-hardening');
const { PROOF_PACKAGE_SCHEMA_VERSION } = require('../src/interaction-proof-packages');

const result = runHardeningChecks();

assert.equal(result.ok, true, result.errors.join('\n'));
assert.equal(BUDGETS.maxProofPackagesPerDeck, 24);
assert.equal(BUDGETS.maxProofPayloadBytes, 50_000);
assert.deepEqual(BUDGETS.allowedMissedCombos, []);
assert.equal(PROOF_PACKAGE_SCHEMA_VERSION, 'interaction-proof-package.v1');

process.stdout.write('Interaction hardening tests passed\n');
