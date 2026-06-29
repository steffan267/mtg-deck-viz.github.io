#!/usr/bin/env node
/*
 * validate-proof-poc.js — read-only POC validator for proof-review artifacts.
 *
 * This deliberately validates lifecycle/store invariants around the existing
 * deterministic proof pipeline. It does not try to become another MTG rules
 * proof engine.
 */
const fs = require('fs');
const path = require('path');
const STORE = require('../src/proof-review-store');
const PIPELINE = require('../src/proof-review-pipeline');

const VALID_ATTEMPT_STATUSES = new Set(Object.values(PIPELINE.Status));
const VALID_DRAFT_STATUSES = new Set([
  PIPELINE.Status.Generated,
  PIPELINE.Status.Rejected,
  PIPELINE.Status.CriticRejected,
  PIPELINE.Status.ReviewReady,
]);
const PROVEN_STATUSES = new Set([
  PIPELINE.Status.DeterministicallyProven,
  PIPELINE.Status.PromotedToTest,
]);

function parseArgs(argv) {
  const args = { storeDir: STORE.DEFAULT_PROOF_REVIEW_DIR, format: 'text', check: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--store-dir') args.storeDir = path.resolve(argv[++i]);
    else if (arg === '--json') args.format = 'json';
    else if (arg === '--check') args.check = true;
    else if (arg === '-h' || arg === '--help') args.help = true;
    else throw new Error('Unknown option: ' + arg);
  }
  return args;
}

function usage() {
  return `Usage: node ./scripts/validate-proof-poc.js [--store-dir dir] [--json] [--check]\n\nValidates proof-review JSONL artifacts without mutating the store. --check exits non-zero on failures.\n`;
}

function countBy(rows, key) {
  const counts = {};
  for (const row of rows) counts[row[key] || 'UNKNOWN'] = (counts[row[key] || 'UNKNOWN'] || 0) + 1;
  return counts;
}

function sameStringSet(a, b) {
  const left = [...new Set(a || [])].sort();
  const right = [...new Set(b || [])].sort();
  return JSON.stringify(left) === JSON.stringify(right);
}

function proofKey(row) {
  return [row.interaction_family || row.expected_interaction_family || '', ...((row.involved_cards || row.cards || []).slice().sort())].join('\u0000');
}

function readAll(storeDir, addFailure) {
  const out = {};
  for (const key of Object.keys(STORE.REVIEW_FILES)) {
    try {
      out[key] = STORE.readRecords(storeDir, key);
    } catch (error) {
      addFailure('jsonl.parse', key, error.message);
      out[key] = [];
    }
  }
  return out;
}

function validateProofPoc(storeDir = STORE.DEFAULT_PROOF_REVIEW_DIR) {
  const failures = [];
  const warnings = [];
  const addFailure = (check, id, message) => failures.push({ check, id, message });
  const addWarning = (check, id, message) => warnings.push({ check, id, message });
  const records = readAll(storeDir, addFailure);

  const latestAttempts = STORE.latestById(records.proofAttempts, 'proof_id');
  const attemptById = new Map(latestAttempts.map(row => [row.proof_id, row]));
  const latestCardsByName = new Map(STORE.latestById(records.cards, 'name').map(row => [row.name, row]));
  const packageByProofKey = new Map();
  for (const pkg of records.proofPackages) {
    if (pkg.status === 'proven') packageByProofKey.set(proofKey({ interaction_family: pkg.family, involved_cards: pkg.cards }), pkg);
  }

  if (!latestAttempts.length) addFailure('proofAttempts.present', 'proofAttempts', 'No latest proof attempts found.');

  for (const attempt of latestAttempts) {
    if (!attempt.proof_id) addFailure('proofAttempt.id', '(missing)', 'Proof attempt is missing proof_id.');
    if (!VALID_ATTEMPT_STATUSES.has(attempt.status)) addFailure('proofAttempt.status', attempt.proof_id, 'Invalid attempt status: ' + attempt.status);
    if (!Array.isArray(attempt.involved_cards) || !attempt.involved_cards.length) addFailure('proofAttempt.cards', attempt.proof_id, 'Proof attempt must name involved cards.');
    if (!attempt.interaction_family) addFailure('proofAttempt.family', attempt.proof_id, 'Proof attempt must name an interaction family.');

    if (PROVEN_STATUSES.has(attempt.status)) {
      const check = attempt.deterministic_check_results || {};
      const pkg = attempt.proof_package || packageByProofKey.get(proofKey(attempt));
      if (check.deterministic_package_status !== 'proven') {
        addFailure('proven.deterministicStatus', attempt.proof_id, 'Proven/promoted proof lacks a proven deterministic package status.');
      }
      if (!pkg) {
        addFailure('proven.packagePresent', attempt.proof_id, 'Proven/promoted proof lacks an attached or stored proof package.');
      } else {
        if (pkg.status !== 'proven') addFailure('proven.packageStatus', attempt.proof_id, 'Proof package status is not proven.');
        if (!sameStringSet(pkg.cards, attempt.involved_cards)) addFailure('proven.packageCards', attempt.proof_id, 'Proof package cards do not match attempt cards.');
        if (pkg.family !== attempt.interaction_family) addFailure('proven.packageFamily', attempt.proof_id, 'Proof package family does not match attempt family.');
      }
    }

    if (attempt.status === PIPELINE.Status.NeedsReview) {
      const check = attempt.deterministic_check_results || {};
      if (check.deterministic_proof_package_present === true) {
        addFailure('needsReview.noPackage', attempt.proof_id, 'NEEDS_REVIEW attempt claims a deterministic proof package is present.');
      }
      if (!Array.isArray(attempt.rejection_reasons) || !attempt.rejection_reasons.length) {
        addWarning('needsReview.reason', attempt.proof_id, 'NEEDS_REVIEW attempt has no rejection/review reason.');
      }
    }
  }

  for (const review of records.proofReviews) {
    try {
      const reviewPayload = Object.assign({}, review, { schemaVersion: PIPELINE.REVIEW_EXPORT_SCHEMA_VERSION, verdict: review.verdict || review.review_verdict });
      PIPELINE.validateReviewRow(reviewPayload);
    } catch (error) {
      addFailure('review.schema', review.proof_id || review.review_id || '(missing)', error.message);
    }
    if (review.proof_id && !attemptById.has(review.proof_id)) addFailure('review.knownProof', review.proof_id, 'Review references an unknown latest proof id.');
  }

  for (const draft of records.llmDrafts) {
    if (!draft.source_proof_id || !attemptById.has(draft.source_proof_id)) addWarning('draft.knownProof', draft.draft_id || '(missing)', 'Draft references a proof id that is not in latest attempts.');
    if (!VALID_DRAFT_STATUSES.has(draft.status)) addFailure('draft.status', draft.draft_id || draft.source_proof_id, 'Invalid draft status: ' + draft.status);
    const check = draft.deterministic_check_results || {};
    if (check.accepted_or_promoted !== false) addFailure('draft.noPromotion', draft.draft_id || draft.source_proof_id, 'LLM draft must explicitly avoid accepting or promoting proofs.');
    if (draft.status === PIPELINE.Status.Generated || draft.status === PIPELINE.Status.ReviewReady) {
      try {
        PIPELINE.validateLlmProofDraft(draft.draft);
      } catch (error) {
        addFailure('draft.schema', draft.draft_id || draft.source_proof_id, error.message);
      }
    }
    if (draft.status === PIPELINE.Status.ReviewReady && draft.critic_verdict !== 'PASS') {
      addFailure('draft.reviewReadyVerdict', draft.draft_id || draft.source_proof_id, 'REVIEW_READY draft must have critic_verdict PASS.');
    }
    if (draft.status === PIPELINE.Status.CriticRejected && (!Array.isArray(draft.critic_issues) || !draft.critic_issues.length)) {
      addFailure('draft.criticIssues', draft.draft_id || draft.source_proof_id, 'CRITIC_REJECTED draft must have a non-empty critic_issues array.');
    }
    if (draft.status === PIPELINE.Status.Rejected && !draft.failure_reason) addWarning('draft.failureReason', draft.draft_id || draft.source_proof_id, 'Rejected draft has no failure reason.');
  }

  for (const golden of records.goldenTests) {
    if (!golden.proof_id) addFailure('golden.id', '(missing)', 'Golden test row is missing proof_id.');
    const attempt = golden.proof_id ? attemptById.get(golden.proof_id) : null;
    if (!attempt) {
      addFailure('golden.knownProof', golden.proof_id || '(missing)', 'Golden test references an unknown latest proof id.');
      continue;
    }
    if (!PROVEN_STATUSES.has(attempt.status)) addFailure('golden.provenSource', golden.proof_id, 'Golden test source proof is not currently proven/promoted.');
    if (!sameStringSet(golden.cards, attempt.involved_cards)) addFailure('golden.cards', golden.proof_id, 'Golden test cards do not match latest attempt.');
    if (golden.expected_interaction_family !== attempt.interaction_family) addFailure('golden.family', golden.proof_id, 'Golden test family does not match latest attempt.');
    const snapshot = golden.oracle_text_snapshot || {};
    for (const cardName of golden.cards || []) {
      if (!snapshot[cardName]) addFailure('golden.oracleSnapshot', golden.proof_id, 'Golden test lacks Oracle snapshot for ' + cardName + '.');
      if (!latestCardsByName.has(cardName)) addWarning('golden.currentCard', golden.proof_id, 'No current card record found for ' + cardName + '.');
    }
  }

  const reviewBatchPath = path.join(storeDir, 'review-batches.jsonl');
  let reviewBatchRows = [];
  try {
    reviewBatchRows = STORE.readJsonl(reviewBatchPath, { skipMalformed: false });
  } catch (error) {
    addFailure('reviewBatch.parse', 'review-batches.jsonl', error.message);
  }
  for (const row of reviewBatchRows) {
    if (!row.batch_id) addFailure('reviewBatch.batchId', row.proof_id || '(missing)', 'Review batch row lacks batch_id.');
    if (!row.proof_id || !attemptById.has(row.proof_id)) addFailure('reviewBatch.knownProof', row.proof_id || '(missing)', 'Review batch references an unknown latest proof id.');
    if (!row.review_instructions || !/Do not invent missing Oracle text/.test(row.review_instructions)) {
      addFailure('reviewBatch.instructions', row.proof_id || '(missing)', 'Review batch row lacks the proof review guardrail instructions.');
    }
  }

  return {
    ok: failures.length === 0,
    storeDir,
    summary: {
      latest_attempts: latestAttempts.length,
      latest_attempt_statuses: countBy(latestAttempts, 'status'),
      proof_packages: records.proofPackages.length,
      proof_reviews: records.proofReviews.length,
      llm_drafts: records.llmDrafts.length,
      golden_tests: records.goldenTests.length,
      review_batch_rows: reviewBatchRows.length,
      failures: failures.length,
      warnings: warnings.length,
    },
    failures,
    warnings,
  };
}

function renderText(result) {
  const lines = [];
  lines.push(`${result.ok ? 'PASS' : 'FAIL'} proof POC validation for ${result.storeDir}`);
  lines.push('summary ' + JSON.stringify(result.summary));
  for (const failure of result.failures) lines.push(`FAIL ${failure.check} ${failure.id}: ${failure.message}`);
  for (const warning of result.warnings) lines.push(`WARN ${warning.check} ${warning.id}: ${warning.message}`);
  return lines.join('\n') + '\n';
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(usage());
    return 0;
  }
  const result = validateProofPoc(args.storeDir);
  process.stdout.write(args.format === 'json' ? JSON.stringify(result, null, 2) + '\n' : renderText(result));
  if (args.check && !result.ok) return 1;
  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error.message || error);
    process.exitCode = 1;
  }
} else {
  module.exports = { main, parseArgs, validateProofPoc };
}
