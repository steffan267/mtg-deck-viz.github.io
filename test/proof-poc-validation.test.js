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

  // v2-only review-batches: a batch_header + a slim proof row whose proof_id resolves.
  {
    const v2dir = await tmpStore();
    STORE.appendRecord(v2dir, 'cards', { name: cards[0], oracle_text: 'oracle a', updated_at: created_at });
    STORE.appendRecord(v2dir, 'proofAttempts', {
      schemaVersion: PIPELINE.PROOF_REVIEW_SCHEMA_VERSION,
      proof_id,
      run_id: 'run_poc',
      involved_cards: cards,
      interaction_family: proofPackage.family,
      synergy_class: PIPELINE.SynergyClass.OneWayEnablement,
      action_sequence: [],
      game_objects: [],
      rules_concepts: ['UNKNOWN'],
      resulting_advantage: ['UNKNOWN'],
      assumptions: [],
      limiting_clauses: [],
      rejection_reasons: ['needs review'],
      deterministic_source: 'poc-test',
      confidence_or_routing_score: 'needs-review',
      status: PIPELINE.Status.NeedsReview,
      deterministic_check_results: { graph_edge_present: true, deterministic_proof_package_present: false },
      created_at,
      updated_at: created_at,
    });
    writeJsonl(path.join(v2dir, 'review-batches.jsonl'), [
      {
        type: 'batch_header',
        schemaVersion: PIPELINE.REVIEW_EXPORT_SCHEMA_VERSION_V2,
        batch_id: 'batch_v2',
        review_instructions: PIPELINE.reviewInstructions(),
        return_contract: { format: 'JSONL' },
        oracle_text: Object.fromEntries(cards.map(card => [card, card + ' oracle text'])),
      },
      {
        schemaVersion: PIPELINE.REVIEW_EXPORT_SCHEMA_VERSION_V2,
        batch_id: 'batch_v2',
        proof_id,
        cards,
        interaction_family: proofPackage.family,
        synergy_class: PIPELINE.SynergyClass.OneWayEnablement,
        deterministic_summary: { status: 'NEEDS_REVIEW', package_id: null },
        proof_package_ref: { stream: 'proofPackages', package_id: null },
      },
    ]);
    const v2result = validateProofPoc(v2dir);
    assert.equal(v2result.ok, true, JSON.stringify(v2result.failures, null, 2));
  }

  // MIXED review-batches: a v1 row + a v2 header + a v2 proof row coexist (append-only).
  {
    const mixedDir = await tmpStore();
    STORE.appendRecord(mixedDir, 'cards', { name: cards[0], oracle_text: 'oracle a', updated_at: created_at });
    STORE.appendRecord(mixedDir, 'proofAttempts', {
      schemaVersion: PIPELINE.PROOF_REVIEW_SCHEMA_VERSION,
      proof_id,
      run_id: 'run_poc',
      involved_cards: cards,
      interaction_family: proofPackage.family,
      synergy_class: PIPELINE.SynergyClass.OneWayEnablement,
      action_sequence: [],
      game_objects: [],
      rules_concepts: ['UNKNOWN'],
      resulting_advantage: ['UNKNOWN'],
      assumptions: [],
      limiting_clauses: [],
      rejection_reasons: ['needs review'],
      deterministic_source: 'poc-test',
      confidence_or_routing_score: 'needs-review',
      status: PIPELINE.Status.NeedsReview,
      deterministic_check_results: { graph_edge_present: true, deterministic_proof_package_present: false },
      created_at,
      updated_at: created_at,
    });
    writeJsonl(path.join(mixedDir, 'review-batches.jsonl'), [
      {
        batch_id: 'batch_v1',
        schemaVersion: PIPELINE.REVIEW_EXPORT_SCHEMA_VERSION,
        proof_id,
        cards,
        oracle_text: Object.fromEntries(cards.map(card => [card, card + ' oracle text'])),
        proof: { proof_id },
        review_instructions: PIPELINE.reviewInstructions(),
      },
      {
        type: 'batch_header',
        schemaVersion: PIPELINE.REVIEW_EXPORT_SCHEMA_VERSION_V2,
        batch_id: 'batch_v2',
        review_instructions: PIPELINE.reviewInstructions(),
        return_contract: { format: 'JSONL' },
        oracle_text: Object.fromEntries(cards.map(card => [card, card + ' oracle text'])),
      },
      {
        schemaVersion: PIPELINE.REVIEW_EXPORT_SCHEMA_VERSION_V2,
        batch_id: 'batch_v2',
        proof_id,
        cards,
        interaction_family: proofPackage.family,
        synergy_class: PIPELINE.SynergyClass.OneWayEnablement,
        deterministic_summary: { status: 'NEEDS_REVIEW', package_id: null },
        proof_package_ref: { stream: 'proofPackages', package_id: null },
      },
    ]);
    const mixedResult = validateProofPoc(mixedDir);
    assert.equal(mixedResult.ok, true, JSON.stringify(mixedResult.failures, null, 2));
  }

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

  await draftStatusValidationTests();

  process.stdout.write('Proof POC validation tests passed\n');
}

const validGeneratedDraft = {
  cards: ['Kiki-Jiki, Mirror Breaker', 'Zealous Conscripts'],
  interaction_family: 'copy→trigger',
  synergy_class: PIPELINE.SynergyClass.OneWayEnablement,
  action_sequence: [{ step_number: 1, action: 'draft only' }],
  game_objects: [],
  rules_concepts: ['UNKNOWN'],
  resulting_advantage: ['UNKNOWN'],
  assumptions: ['needs verification'],
  failure_modes: ['may overstate'],
  confidence: 0.5,
  explanation: 'untrusted draft',
  why_this_is_not_stronger_classification: 'no package yet',
};

function seedReviewBaseStore(dir) {
  const created_at = '2026-06-29T00:00:00.000Z';
  const proof_id = 'proof_draft_status';
  const cards = ['Kiki-Jiki, Mirror Breaker', 'Zealous Conscripts'];
  STORE.appendRecord(dir, 'proofAttempts', {
    schemaVersion: PIPELINE.PROOF_REVIEW_SCHEMA_VERSION,
    proof_id,
    run_id: 'run_poc',
    involved_cards: cards,
    interaction_family: 'copy→trigger',
    synergy_class: PIPELINE.SynergyClass.OneWayEnablement,
    action_sequence: [],
    game_objects: [],
    rules_concepts: ['UNKNOWN'],
    resulting_advantage: ['UNKNOWN'],
    assumptions: [],
    limiting_clauses: [],
    rejection_reasons: ['needs review'],
    deterministic_source: 'poc-test',
    confidence_or_routing_score: 'needs-review',
    status: PIPELINE.Status.NeedsReview,
    deterministic_check_results: { graph_edge_present: true, deterministic_proof_package_present: false },
    created_at,
    updated_at: created_at,
  });
  return { proof_id, created_at };
}

function draftRecord(proof_id, created_at, overrides) {
  return Object.assign({
    schemaVersion: PIPELINE.LLM_DRAFT_SCHEMA_VERSION,
    draft_id: 'draft_' + Math.random().toString(16).slice(2),
    source_proof_id: proof_id,
    deterministic_check_results: { deterministic_validation_bypassed: false, accepted_or_promoted: false },
    created_at,
    updated_at: created_at,
  }, overrides);
}

async function draftStatusValidationTests() {
  // REVIEW_READY without critic_verdict PASS -> failure.
  {
    const dir = await tmpStore();
    const { proof_id, created_at } = seedReviewBaseStore(dir);
    STORE.appendRecord(dir, 'llmDrafts', draftRecord(proof_id, created_at, {
      status: PIPELINE.Status.ReviewReady,
      draft: validGeneratedDraft,
      critic_verdict: 'FAIL',
      critic_issues: [],
      critic_confidence: 0.3,
    }));
    const result = validateProofPoc(dir);
    assert.equal(result.ok, false, 'REVIEW_READY without PASS verdict must fail');
    assert.ok(result.failures.some(failure => failure.check === 'draft.reviewReadyVerdict'));
  }

  // Properly vetted REVIEW_READY + CRITIC_REJECTED with issues -> ok.
  {
    const dir = await tmpStore();
    const { proof_id, created_at } = seedReviewBaseStore(dir);
    STORE.appendRecord(dir, 'llmDrafts', draftRecord(proof_id, created_at, {
      status: PIPELINE.Status.ReviewReady,
      draft: validGeneratedDraft,
      critic_verdict: 'PASS',
      critic_issues: [],
      critic_confidence: 0.8,
    }));
    STORE.appendRecord(dir, 'llmDrafts', draftRecord(proof_id, created_at, {
      status: PIPELINE.Status.CriticRejected,
      draft: validGeneratedDraft,
      critic_verdict: 'FAIL',
      critic_issues: ['bad timing'],
      critic_confidence: 0.9,
    }));
    const result = validateProofPoc(dir);
    assert.equal(result.ok, true, JSON.stringify(result.failures, null, 2));
  }

  // CRITIC_REJECTED with empty issues -> failure.
  {
    const dir = await tmpStore();
    const { proof_id, created_at } = seedReviewBaseStore(dir);
    STORE.appendRecord(dir, 'llmDrafts', draftRecord(proof_id, created_at, {
      status: PIPELINE.Status.CriticRejected,
      draft: validGeneratedDraft,
      critic_verdict: 'FAIL',
      critic_issues: [],
      critic_confidence: 0.9,
    }));
    const result = validateProofPoc(dir);
    assert.equal(result.ok, false, 'CRITIC_REJECTED with no issues must fail');
    assert.ok(result.failures.some(failure => failure.check === 'draft.criticIssues'));
  }

  // Draft asserting accepted_or_promoted:true -> failure.
  {
    const dir = await tmpStore();
    const { proof_id, created_at } = seedReviewBaseStore(dir);
    STORE.appendRecord(dir, 'llmDrafts', draftRecord(proof_id, created_at, {
      status: PIPELINE.Status.ReviewReady,
      draft: validGeneratedDraft,
      critic_verdict: 'PASS',
      critic_issues: [],
      critic_confidence: 0.8,
      deterministic_check_results: { deterministic_validation_bypassed: false, accepted_or_promoted: true },
    }));
    const result = validateProofPoc(dir);
    assert.equal(result.ok, false, 'draft claiming acceptance/promotion must fail');
    assert.ok(result.failures.some(failure => failure.check === 'draft.noPromotion'));
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
