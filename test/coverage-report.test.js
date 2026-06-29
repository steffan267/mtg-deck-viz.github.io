const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const STORE = require('../src/proof-review-store');
const PIPELINE = require('../src/proof-review-pipeline');
const { buildCoverageReport, DISCLAIMER } = require('../scripts/coverage-report');

const created_at = '2026-06-29T00:00:00.000Z';

function streamSnapshot(dir) {
  if (!fs.existsSync(dir)) return {};
  const out = {};
  for (const name of fs.readdirSync(dir).sort()) out[name] = fs.readFileSync(path.join(dir, name), 'utf8');
  return out;
}

function seedAttempt(dir, proof_id, family, cards) {
  STORE.appendRecord(dir, 'proofAttempts', {
    schemaVersion: PIPELINE.PROOF_REVIEW_SCHEMA_VERSION,
    proof_id,
    run_id: 'run_cov',
    involved_cards: cards,
    interaction_family: family,
    synergy_class: PIPELINE.SynergyClass.OneWayEnablement,
    status: PIPELINE.Status.NeedsReview,
    deterministic_check_results: { graph_edge_present: true, deterministic_proof_package_present: false },
    created_at,
    updated_at: created_at,
  });
}

function seedDraft(dir, draft_id, proof_id, family, cards, status, confidence) {
  STORE.appendRecord(dir, 'llmDrafts', {
    schemaVersion: PIPELINE.LLM_DRAFT_SCHEMA_VERSION,
    draft_id,
    source_proof_id: proof_id,
    interaction_family: family,
    involved_cards: cards,
    status,
    draft: { cards },
    critic_verdict: status === PIPELINE.Status.ReviewReady ? 'PASS' : 'FAIL',
    critic_issues: status === PIPELINE.Status.ReviewReady ? [] : ['bad'],
    critic_confidence: confidence,
    deterministic_check_results: { deterministic_validation_bypassed: false, accepted_or_promoted: false },
    created_at,
    updated_at: created_at,
  });
}

async function main() {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mtg-coverage-report-'));
  STORE.initializeStore(dir);

  // Family A: 2 REVIEW_READY drafts. Family B: 1 REVIEW_READY draft. Plus 1 CRITIC_REJECTED.
  seedAttempt(dir, 'p1', 'famA', ['A1', 'A2']);
  seedAttempt(dir, 'p2', 'famA', ['A3', 'A4']);
  seedAttempt(dir, 'p3', 'famB', ['B1', 'B2']);
  seedAttempt(dir, 'p4', 'famB', ['B3', 'B4']);

  seedDraft(dir, 'd1', 'p1', 'famA', ['A1', 'A2'], PIPELINE.Status.ReviewReady, 0.7);
  seedDraft(dir, 'd2', 'p2', 'famA', ['A3', 'A4'], PIPELINE.Status.ReviewReady, 0.9);
  seedDraft(dir, 'd3', 'p3', 'famB', ['B1', 'B2'], PIPELINE.Status.ReviewReady, 0.95);
  seedDraft(dir, 'd4', 'p4', 'famB', ['B3', 'B4'], PIPELINE.Status.CriticRejected, 0.2);

  // Snapshot every file in the sharded llmDrafts stream dir to assert purity.
  const draftDir = STORE.shardDir(dir, 'llmDrafts');
  const snapshot = streamSnapshot(draftDir);

  const report = buildCoverageReport(dir);

  // Purity: the stream files must be byte-identical after the call.
  assert.deepEqual(streamSnapshot(draftDir), snapshot, 'buildCoverageReport must not mutate the store');

  assert.equal(report.ok, true);
  assert.equal(report.generatedAt, null, 'buildCoverageReport must stay timestamp-free for determinism');
  assert.equal(report.summary.review_ready_total, 3, 'CRITIC_REJECTED draft must be excluded');
  assert.equal(report.summary.families, 2);
  assert.equal(report.summary.disclaimer, DISCLAIMER);
  assert.match(report.summary.disclaimer, /must not be auto-promoted/);
  assert.match(report.summary.disclaimer, /interaction-proof-packages\.js/);

  // famA has 2 review-ready drafts, famB has 1 -> famA ranked first by count.
  assert.equal(report.ranked.length, 2);
  assert.equal(report.ranked[0].interaction_family, 'famA');
  assert.equal(report.ranked[0].attempt_count, 2);
  assert.equal(report.ranked[1].interaction_family, 'famB');
  assert.equal(report.ranked[1].attempt_count, 1);
  assert.deepEqual(report.ranked[0].draft_ids.sort(), ['d1', 'd2']);
  assert.equal(Math.abs(report.ranked[0].avg_critic_confidence - 0.8) < 1e-9, true);

  // Tie-break by confidence: equal counts -> higher avg_critic_confidence first.
  {
    const dir2 = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mtg-coverage-report-tie-'));
    STORE.initializeStore(dir2);
    seedAttempt(dir2, 'q1', 'lowConf', ['L1', 'L2']);
    seedAttempt(dir2, 'q2', 'highConf', ['H1', 'H2']);
    seedDraft(dir2, 'e1', 'q1', 'lowConf', ['L1', 'L2'], PIPELINE.Status.ReviewReady, 0.1);
    seedDraft(dir2, 'e2', 'q2', 'highConf', ['H1', 'H2'], PIPELINE.Status.ReviewReady, 0.99);
    const tieReport = buildCoverageReport(dir2);
    assert.equal(tieReport.ranked[0].interaction_family, 'highConf', 'equal counts should rank by confidence desc');
  }

  process.stdout.write('Coverage report tests passed\n');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
