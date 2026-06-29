const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const STORE = require('../src/proof-review-store');
const PIPELINE = require('../src/proof-review-pipeline');
const { validateProofPoc } = require('../scripts/validate-proof-poc');

async function tmpStore() {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mtg-proof-poc-validation-'));
  STORE.initializeStore(dir);
  return dir;
}

function writeJsonl(file, rows) {
  fs.writeFileSync(file, rows.map(row => JSON.stringify(row)).join('\n') + '\n');
}

async function main() {
  const dir = await tmpStore();
  const created_at = '2026-06-29T00:00:00.000Z';
  const proof_id = 'proof_poc_ok';
  const cards = ['Kiki-Jiki, Mirror Breaker', 'Zealous Conscripts'];
  const proofPackage = {
    schemaVersion: 'interaction-proof-package.v1',
    id: 'proof:poc',
    family: 'hasty-copy→etb-untap-loop',
    cards,
    status: 'proven',
    confidence: 'pattern',
    strength: 'combo-critical',
    result: 'tokens 1..∞',
    repeatability: { status: 'repeatable-candidate' },
    sequence: [{ index: 1, action: 'copy the untapper' }],
    contributions: [],
    evidence: [],
  };
  STORE.appendRecord(dir, 'cards', { name: cards[0], oracle_text: 'Create a token copy with haste.', updated_at: created_at });
  STORE.appendRecord(dir, 'cards', { name: cards[1], oracle_text: 'When this enters, untap target permanent.', updated_at: created_at });
  STORE.appendRecord(dir, 'proofPackages', proofPackage);
  STORE.appendRecord(dir, 'proofAttempts', {
    schemaVersion: PIPELINE.PROOF_REVIEW_SCHEMA_VERSION,
    proof_id,
    run_id: 'run_poc',
    involved_cards: cards,
    interaction_family: proofPackage.family,
    synergy_class: PIPELINE.SynergyClass.InfiniteCombo,
    action_sequence: proofPackage.sequence,
    game_objects: [],
    rules_concepts: ['ETB', 'COPYING_PERMANENT', 'LOOP'],
    resulting_advantage: ['TOKENS'],
    assumptions: [],
    limiting_clauses: [],
    rejection_reasons: [],
    deterministic_source: 'poc-test',
    confidence_or_routing_score: 'pattern',
    status: PIPELINE.Status.DeterministicallyProven,
    deterministic_check_results: { deterministic_package_status: 'proven', package_id: proofPackage.id },
    proof_package: proofPackage,
    created_at,
    updated_at: created_at,
  });
  STORE.appendRecord(dir, 'goldenTests', {
    schemaVersion: 'proof-review-golden.v1',
    proof_id,
    cards,
    oracle_text_snapshot: Object.fromEntries(cards.map(card => [card, card + ' oracle text'])),
    expected_interaction_family: proofPackage.family,
    expected_synergy_class: PIPELINE.SynergyClass.InfiniteCombo,
    expected_rules_concepts: ['ETB'],
    expected_resulting_advantage: ['TOKENS'],
    expected_minimal_action_sequence: proofPackage.sequence,
    source_status: PIPELINE.Status.DeterministicallyProven,
    status: PIPELINE.Status.PromotedToTest,
    created_at,
    updated_at: created_at,
  });
  STORE.appendRecord(dir, 'llmDrafts', {
    schemaVersion: PIPELINE.LLM_DRAFT_SCHEMA_VERSION,
    draft_id: 'draft_rejected',
    source_proof_id: proof_id,
    status: PIPELINE.Status.Rejected,
    deterministic_check_results: { deterministic_validation_bypassed: false, accepted_or_promoted: false },
    failure_reason: 'not needed for proven POC',
    created_at,
    updated_at: created_at,
  });
  writeJsonl(path.join(dir, 'review-batches.jsonl'), [{
    batch_id: 'batch_poc',
    schemaVersion: PIPELINE.REVIEW_EXPORT_SCHEMA_VERSION,
    proof_id,
    cards,
    oracle_text: Object.fromEntries(cards.map(card => [card, card + ' oracle text'])),
    proof: { proof_id },
    review_instructions: PIPELINE.reviewInstructions(),
  }]);

  const passing = validateProofPoc(dir);
  assert.equal(passing.ok, true, JSON.stringify(passing, null, 2));
  assert.equal(passing.summary.latest_attempts, 1);
  assert.equal(passing.summary.golden_tests, 1);

  STORE.appendRecord(dir, 'proofAttempts', {
    proof_id,
    involved_cards: cards,
    interaction_family: proofPackage.family,
    status: PIPELINE.Status.PromotedToTest,
    deterministic_check_results: { deterministic_package_status: 'missing' },
    created_at,
    updated_at: created_at,
  });
  const failing = validateProofPoc(dir);
  assert.equal(failing.ok, false, 'broken proven status should fail validation');
  assert.ok(failing.failures.some(failure => failure.check === 'proven.deterministicStatus'));

  process.stdout.write('Proof POC validation tests passed\n');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
