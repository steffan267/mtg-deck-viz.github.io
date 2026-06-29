const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const STORE = require('../src/proof-review-store');
const PIPELINE = require('../src/proof-review-pipeline');
const { main: cliMain } = require('../bin/mtg-proofs');

function sampleCard(name, type_line, oracle_text, extra = {}) {
  return Object.assign({ name, type_line, oracle_text, mana_cost: extra.mana_cost || '', cmc: extra.cmc || 0, color_identity: extra.color_identity || [] }, extra);
}

const sampleCards = [
  sampleCard('Panharmonicon', 'Artifact', 'If an artifact or creature entering the battlefield causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time.', { mana_cost: '{4}', cmc: 4 }),
  sampleCard('Eternal Witness', 'Creature — Human Shaman', 'When Eternal Witness enters the battlefield, you may return target card from your graveyard to your hand.', { mana_cost: '{1}{G}{G}', cmc: 3, color_identity: ['G'] }),
  sampleCard('Ephemerate', 'Instant', 'Exile target creature you control, then return it to the battlefield under its owner’s control.', { mana_cost: '{W}', cmc: 1, color_identity: ['W'] }),
  sampleCard('Sol Ring', 'Artifact', '{T}: Add {C}{C}.', { mana_cost: '{1}', cmc: 1 }),
  sampleCard("Ashnod's Altar", 'Artifact', 'Sacrifice a creature: Add {C}{C}.', { mana_cost: '{3}', cmc: 3 }),
  sampleCard('Blood Artist', 'Creature — Vampire', 'Whenever Blood Artist or another creature dies, target player loses 1 life and you gain 1 life.', { mana_cost: '{1}{B}', cmc: 2, color_identity: ['B'] }),
  sampleCard('Reassembling Skeleton', 'Creature — Skeleton Warrior', '{1}{B}: Return Reassembling Skeleton from your graveyard to the battlefield tapped.', { mana_cost: '{1}{B}', cmc: 2, color_identity: ['B'] }),
  sampleCard('Doubling Season', 'Enchantment', 'If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead.', { mana_cost: '{4}{G}', cmc: 5, color_identity: ['G'] }),
  sampleCard('Impact Tremors', 'Enchantment', 'Whenever a creature enters the battlefield under your control, Impact Tremors deals 1 damage to each opponent.', { mana_cost: '{1}{R}', cmc: 2, color_identity: ['R'] }),
  sampleCard('Kiki-Jiki, Mirror Breaker', 'Legendary Creature — Goblin Shaman', "{T}: Create a token that's a copy of target nonlegendary creature you control, except it has haste. Sacrifice it at the beginning of the next end step.", { mana_cost: '{2}{R}{R}{R}', cmc: 5, color_identity: ['R'] }),
  sampleCard('Zealous Conscripts', 'Creature — Human Warrior', 'Haste When Zealous Conscripts enters the battlefield, gain control of target permanent until end of turn. Untap that permanent. It gains haste until end of turn.', { mana_cost: '{4}{R}', cmc: 5, color_identity: ['R'] }),
];
const cardsByName = Object.fromEntries(sampleCards.map(card => [card.name.toLowerCase(), card]));

async function main() {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mtg-proof-review-'));
  STORE.initializeStore(tmpDir);

  STORE.appendRecord(tmpDir, 'engineRuns', { run_id: 'append-test', status: 'NEW' });
  STORE.appendRecord(tmpDir, 'engineRuns', { run_id: 'append-test-2', status: 'GENERATED' });
  assert.equal(STORE.readRecords(tmpDir, 'engineRuns').length, 2, 'JSONL writes should be append-only');

  const malformed = path.join(tmpDir, 'malformed.jsonl');
  fs.writeFileSync(malformed, '{"ok":true}\nnot-json\n');
  assert.throws(() => STORE.readJsonl(malformed), /Malformed JSONL/, 'malformed JSONL should reject loudly');

  assert.throws(() => PIPELINE.runDeterministic(tmpDir, { cardsByName, deckId: 'typo-deck' }), /Deck not found: typo-deck/, 'missing non-sample decks should fail instead of silently using sample');

  const sample = PIPELINE.createSample(tmpDir, { cardsByName });
  assert.equal(sample.deck_id, 'sample');
  assert.equal(sample.unresolved.length, 0);
  assert.equal(STORE.readRecords(tmpDir, 'decks').length >= 1, true);
  assert.equal(STORE.readRecords(tmpDir, 'cards').length >= sampleCards.length, true);

  const run = PIPELINE.runDeterministic(tmpDir, { cardsByName });
  assert.equal(run.run.summary.cards, sampleCards.length);
  assert.equal(run.packages.length > 0, true, 'sample should produce at least one deterministic proof package');
  assert.equal(run.candidates.length > 0, true, 'sample should produce graph candidates');
  assert.ok(run.candidates.some(candidate => candidate.cards.join('|') === 'Kiki-Jiki, Mirror Breaker|Zealous Conscripts' && candidate.suspected_interaction_family === 'copy→trigger' && candidate.confidence === 'needs-review'), 'unproved families on a proven card pair should still route to review');

  const attempts = STORE.latestById(STORE.readRecords(tmpDir, 'proofAttempts'), 'proof_id');
  assert.ok(attempts.some(attempt => attempt.status === PIPELINE.Status.DeterministicallyProven), 'deterministic proof output should persist');
  assert.ok(attempts.some(attempt => attempt.status === PIPELINE.Status.NeedsReview), 'uncovered graph interactions should route to review');

  const exported = PIPELINE.exportReview(tmpDir, { limit: 2 });
  assert.equal(exported.count > 0, true);
  assert.equal(fs.existsSync(exported.markdown_path), true);
  assert.equal(fs.existsSync(exported.jsonl_path), true);
  assert.match(fs.readFileSync(exported.markdown_path, 'utf8'), /Do not invent missing Oracle text/);
  assert.match(fs.readFileSync(exported.jsonl_path, 'utf8'), /proof_id/);
  assert.equal(path.basename(exported.jsonl_path), 'review-batches.jsonl', 'review exports should append to one JSONL stream');
  assert.equal(path.basename(exported.markdown_path), 'review-batches.md', 'review markdown should append to one Markdown stream');
  assert.deepEqual(fs.readdirSync(tmpDir).filter(name => /^review_batch_.*\.(jsonl|md)$/.test(name)), [], 'review exports should not create per-loop batch files');
  const exportedAgain = PIPELINE.exportReview(tmpDir, { limit: 2 });
  assert.equal(exportedAgain.skipped_unchanged, true, 'unchanged review exports should reuse the previous batch');
  assert.equal(exportedAgain.batch_id, exported.batch_id);

  const reviewTarget = attempts.find(attempt => attempt.status === PIPELINE.Status.NeedsReview);
  const reviewPath = path.join(tmpDir, 'reviewed.jsonl');
  fs.writeFileSync(reviewPath, JSON.stringify({
    proof_id: reviewTarget.proof_id,
    verdict: 'ACCEPTED',
    corrected_confidence: 0.91,
    corrected_synergy_class: 'STRONG_SYNERGY',
    issues: [],
    corrected_proof: { note: 'Manual review accepted this as a non-combo interaction candidate.' },
    test_case_recommendation: 'Keep as a review lifecycle fixture.',
  }) + '\n');
  const imported = PIPELINE.importReview(tmpDir, reviewPath);
  assert.equal(imported.imported, 1);
  assert.equal(STORE.readRecords(tmpDir, 'proofReviews').length, 1);
  assert.equal(STORE.readRecords(tmpDir, 'proofReviews')[0].schemaVersion, PIPELINE.PROOF_REVIEW_SCHEMA_VERSION);
  const updated = STORE.latestById(STORE.readRecords(tmpDir, 'proofAttempts'), 'proof_id').find(attempt => attempt.proof_id === reviewTarget.proof_id);
  assert.equal(updated.status, PIPELINE.Status.Accepted);

  PIPELINE.runDeterministic(tmpDir, { cardsByName });
  const preservedAccepted = STORE.latestById(STORE.readRecords(tmpDir, 'proofAttempts'), 'proof_id').find(attempt => attempt.proof_id === reviewTarget.proof_id);
  assert.equal(preservedAccepted.status, PIPELINE.Status.Accepted, 'deterministic reruns must not regress reviewed accepted proofs');
  assert.equal(preservedAccepted.review_verdict, 'ACCEPTED');

  const badReview = path.join(tmpDir, 'bad-review.jsonl');
  fs.writeFileSync(badReview, JSON.stringify({ proof_id: 'x', verdict: 'MAYBE' }) + '\n');
  assert.throws(() => PIPELINE.importReview(tmpDir, badReview), /invalid verdict|missing/, 'malformed review rows must not auto-promote');
  const badConfidenceReview = path.join(tmpDir, 'bad-confidence-review.jsonl');
  fs.writeFileSync(badConfidenceReview, JSON.stringify({ proof_id: reviewTarget.proof_id, verdict: 'ACCEPTED', corrected_confidence: 'high', corrected_synergy_class: 'STRONG_SYNERGY', issues: [], corrected_proof: {}, test_case_recommendation: 'none' }) + '\n');
  assert.throws(() => PIPELINE.importReview(tmpDir, badConfidenceReview), /corrected_confidence/, 'review confidence must be numeric');
  const badSynergyReview = path.join(tmpDir, 'bad-synergy-review.jsonl');
  fs.writeFileSync(badSynergyReview, JSON.stringify({ proof_id: reviewTarget.proof_id, verdict: 'ACCEPTED', corrected_confidence: 0.9, corrected_synergy_class: 'BEST_COMBO', issues: [], corrected_proof: {}, test_case_recommendation: 'none' }) + '\n');
  assert.throws(() => PIPELINE.importReview(tmpDir, badSynergyReview), /corrected_synergy_class/, 'review synergy class must be from the local enum');
  const badSchemaReview = path.join(tmpDir, 'bad-schema-review.jsonl');
  fs.writeFileSync(badSchemaReview, JSON.stringify({ schemaVersion: 'proof-review-export.v0', proof_id: reviewTarget.proof_id, verdict: 'ACCEPTED', corrected_confidence: 0.9, corrected_synergy_class: 'STRONG_SYNERGY', issues: [], corrected_proof: {}, test_case_recommendation: 'none' }) + '\n');
  assert.throws(() => PIPELINE.importReview(tmpDir, badSchemaReview), /schemaVersion/, 'known schemaVersion values must match the current review export contract');
  const orphanReview = path.join(tmpDir, 'orphan-review.jsonl');
  fs.writeFileSync(orphanReview, JSON.stringify({ proof_id: 'proof_missing', verdict: 'ACCEPTED', corrected_confidence: 1, corrected_synergy_class: 'STRONG_SYNERGY', issues: [], corrected_proof: {}, test_case_recommendation: 'none' }) + '\n');
  assert.throws(() => PIPELINE.importReview(tmpDir, orphanReview), /unknown proof_id/, 'unknown proof ids must be rejected before any append');
  assert.equal(STORE.readRecords(tmpDir, 'proofReviews').length, 1, 'failed imports must not append orphan reviews');

  const correctionTarget = STORE.latestById(STORE.readRecords(tmpDir, 'proofAttempts'), 'proof_id').find(attempt => attempt.status === PIPELINE.Status.NeedsReview && attempt.proof_id !== reviewTarget.proof_id);
  const correctionReview = path.join(tmpDir, 'correction-review.jsonl');
  fs.writeFileSync(correctionReview, JSON.stringify({ proof_id: correctionTarget.proof_id, verdict: 'NEEDS_CORRECTION', corrected_confidence: 0.4, corrected_synergy_class: 'ONE_WAY_ENABLEMENT', issues: ['missing step'], corrected_proof: {}, test_case_recommendation: 'add deterministic validator' }) + '\n');
  PIPELINE.importReview(tmpDir, correctionReview);
  const correction = STORE.latestById(STORE.readRecords(tmpDir, 'proofAttempts'), 'proof_id').find(attempt => attempt.proof_id === correctionTarget.proof_id);
  assert.equal(correction.status, PIPELINE.Status.NeedsReview);
  assert.equal(correction.review_verdict, 'NEEDS_CORRECTION');
  assert.equal(correction.correction_required, true);
  PIPELINE.runDeterministic(tmpDir, { cardsByName });
  const preservedCorrection = STORE.latestById(STORE.readRecords(tmpDir, 'proofAttempts'), 'proof_id').find(attempt => attempt.proof_id === correctionTarget.proof_id);
  assert.equal(preservedCorrection.review_verdict, 'NEEDS_CORRECTION', 'deterministic reruns should preserve correction metadata');

  let draftCalls = 0;
  const mockDraftClient = {
    async generateJson() {
      draftCalls += 1;
      if (draftCalls === 2) throw new Error('mock malformed draft');
      return {
        cards: ['Kiki-Jiki, Mirror Breaker', 'Zealous Conscripts'],
        interaction_family: 'copy→trigger',
        synergy_class: 'ONE_WAY_ENABLEMENT',
        action_sequence: [{ step_number: 1, action: 'draft only' }],
        game_objects: [],
        rules_concepts: ['UNKNOWN'],
        resulting_advantage: ['UNKNOWN'],
        assumptions: ['LLM draft requires deterministic verification.'],
        failure_modes: ['Draft may overstate timing or object identity.'],
        confidence: 0.42,
        explanation: 'Untrusted local draft for reviewer triage.',
        why_this_is_not_stronger_classification: 'No deterministic proof package supports this family yet.',
      };
    },
  };
  const drafted = await PIPELINE.draftProofs(tmpDir, { client: mockDraftClient, limit: 2 });
  assert.equal(drafted.drafted, 2);
  assert.equal(drafted.generated, 1);
  assert.equal(drafted.rejected, 1);
  const draftRecords = STORE.readRecords(tmpDir, 'llmDrafts');
  assert.equal(draftRecords.length, 2);
  assert.equal(draftRecords.some(record => record.status === PIPELINE.Status.Generated), true, 'valid LLM drafts should persist as GENERATED drafts');
  assert.equal(draftRecords.some(record => record.status === PIPELINE.Status.Rejected && /mock malformed draft/.test(record.failure_reason)), true, 'malformed LLM drafts should persist as rejected drafts');
  const afterDraftStatuses = STORE.latestById(STORE.readRecords(tmpDir, 'proofAttempts'), 'proof_id').map(attempt => attempt.status);
  assert.equal(afterDraftStatuses.includes(PIPELINE.Status.PromotedToTest), false, 'drafting must not promote proofs');
  assert.equal(afterDraftStatuses.filter(status => status === PIPELINE.Status.Accepted).length, 1, 'drafting must not accept additional proofs');

  const fixtureDir = path.join(tmpDir, 'fixtures');
  const promoted = PIPELINE.promoteTests(tmpDir, { fixtureDir });
  assert.equal(promoted.promoted > 0, true);
  assert.equal(promoted.files.every(file => fs.existsSync(file)), true);
  const fixture = JSON.parse(fs.readFileSync(promoted.files[0], 'utf8'));
  assert.equal(fixture.schemaVersion, 'proof-review-golden.v1');
  assert.ok(Array.isArray(fixture.cards));

  const cliDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mtg-proof-review-cli-'));
  const originalWrite = process.stdout.write;
  let cliOutput = '';
  process.stdout.write = (chunk, ...rest) => { cliOutput += String(chunk); return true; };
  try {
    await cliMain(['sample', '--store-dir', cliDir]);
  } finally {
    process.stdout.write = originalWrite;
  }
  assert.equal(fs.existsSync(path.join(cliDir, 'decks.jsonl')), true);
  assert.match(cliOutput, /proof-review-sample/);

  process.stdout.write('Proof review pipeline tests passed\n');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
