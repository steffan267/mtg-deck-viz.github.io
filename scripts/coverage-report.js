#!/usr/bin/env node
/*
 * coverage-report.js — read-only coverage report over REVIEW_READY LLM drafts.
 *
 * This ranks interaction families that local LLM drafting has flagged as
 * review-ready so a HUMAN can prioritize writing deterministic rules in
 * src/interaction-proof-packages.js. The drafts remain untrusted LLM output;
 * nothing here accepts, verifies, or promotes a proof. It only reads the store.
 */
const path = require('path');
const STORE = require('../src/proof-review-store');
const PIPELINE = require('../src/proof-review-pipeline');

const DISCLAIMER = 'This report ranks untrusted local LLM draft output to inform HUMAN-written deterministic rules in src/interaction-proof-packages.js. It is not a proof, must not be auto-promoted, and carries no deterministic guarantee.';

function buildCoverageReport(storeDir = STORE.DEFAULT_PROOF_REVIEW_DIR) {
  const drafts = STORE.readRecords(storeDir, 'llmDrafts', { skipMalformed: true });
  const latestDrafts = STORE.latestById(drafts, 'source_proof_id');
  const reviewReady = latestDrafts.filter(draft => draft.status === PIPELINE.Status.ReviewReady);

  const attempts = STORE.latestById(STORE.readRecords(storeDir, 'proofAttempts', { skipMalformed: true }), 'proof_id');
  const attemptById = new Map(attempts.map(attempt => [attempt.proof_id, attempt]));

  const families = new Map();
  for (const draft of reviewReady) {
    const attempt = attemptById.get(draft.source_proof_id) || {};
    const family = attempt.interaction_family || draft.interaction_family || 'UNKNOWN';
    const cards = attempt.involved_cards || draft.involved_cards || [];
    if (!families.has(family)) {
      families.set(family, { interaction_family: family, draft_ids: [], cards: new Set(), confidences: [], synergy_classes: new Set() });
    }
    const entry = families.get(family);
    entry.draft_ids.push(draft.draft_id);
    for (const card of cards) entry.cards.add(card);
    if (Number.isFinite(draft.critic_confidence)) entry.confidences.push(draft.critic_confidence);
    if (attempt.synergy_class) entry.synergy_classes.add(attempt.synergy_class);
  }

  const ranked = [...families.values()].map(entry => {
    const avg = entry.confidences.length
      ? entry.confidences.reduce((sum, value) => sum + value, 0) / entry.confidences.length
      : 0;
    return {
      interaction_family: entry.interaction_family,
      exemplar_cards: [...entry.cards].sort(),
      draft_ids: entry.draft_ids.slice(),
      attempt_count: entry.draft_ids.length,
      avg_critic_confidence: avg,
      synergy_classes: [...entry.synergy_classes].sort(),
    };
  });

  ranked.sort((a, b) =>
    (b.attempt_count - a.attempt_count) ||
    (b.avg_critic_confidence - a.avg_critic_confidence) ||
    (b.exemplar_cards.length - a.exemplar_cards.length) ||
    a.interaction_family.localeCompare(b.interaction_family));

  return {
    ok: true,
    generatedAt: null,
    ranked,
    summary: {
      review_ready_total: reviewReady.length,
      families: ranked.length,
      disclaimer: DISCLAIMER,
    },
  };
}

function parseArgs(argv) {
  const args = { storeDir: STORE.DEFAULT_PROOF_REVIEW_DIR, format: 'json' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--store-dir') args.storeDir = path.resolve(argv[++i]);
    else if (arg === '--json') args.format = 'json';
    else if (arg === '-h' || arg === '--help') args.help = true;
    else throw new Error('Unknown option: ' + arg);
  }
  return args;
}

function usage() {
  return `Usage: node ./scripts/coverage-report.js [--store-dir dir] [--json]\n\nRanks REVIEW_READY LLM drafts by interaction family. Read-only; never mutates the store.\n`;
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(usage());
    return 0;
  }
  const result = Object.assign({}, buildCoverageReport(args.storeDir), { generatedAt: new Date().toISOString() });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
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
  module.exports = { buildCoverageReport, main, parseArgs, DISCLAIMER };
}
