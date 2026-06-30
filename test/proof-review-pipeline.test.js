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

  // Compact v2 export. Use a fresh store so the v1 review-batches stream above is
  // not in play, and seed >=2 NEEDS_REVIEW proofs that share a card.
  {
    const compactDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mtg-proof-compact-'));
    STORE.initializeStore(compactDir);
    STORE.appendRecord(compactDir, 'cards', { name: 'Shared Card', oracle_text: 'Shared oracle text.', updated_at: '2026-06-29T00:00:00.000Z' });
    STORE.appendRecord(compactDir, 'cards', { name: 'Unique A', oracle_text: 'Unique A text.', updated_at: '2026-06-29T00:00:00.000Z' });
    STORE.appendRecord(compactDir, 'cards', { name: 'Unique B', oracle_text: 'Unique B text.', updated_at: '2026-06-29T00:00:00.000Z' });
    for (const [i, partner] of [['0', 'Unique A'], ['1', 'Unique B']]) {
      STORE.appendRecord(compactDir, 'proofAttempts', {
        schemaVersion: PIPELINE.PROOF_REVIEW_SCHEMA_VERSION,
        proof_id: 'proof_compact_' + i,
        run_id: 'run_compact',
        involved_cards: ['Shared Card', partner],
        interaction_family: 'fam_compact_' + i,
        synergy_class: PIPELINE.SynergyClass.OneWayEnablement,
        action_sequence: [{ step_number: 1, action: 'compact step' }],
        rules_concepts: ['UNKNOWN'],
        resulting_advantage: ['UNKNOWN'],
        assumptions: ['needs verification'],
        limiting_clauses: [],
        rejection_reasons: ['needs review reason'],
        status: PIPELINE.Status.NeedsReview,
        deterministic_check_results: { graph_edge_present: true, deterministic_proof_package_present: false },
        created_at: '2026-06-29T00:00:00.000Z',
        updated_at: '2026-06-29T00:00:00.000Z',
      });
    }
    // Export v1 first for this proof set, then compact for the SAME set: the
    // format-aware skip must NOT treat the compact run as unchanged.
    const v1First = PIPELINE.exportReview(compactDir, { limit: 10 });
    assert.equal(v1First.skipped_unchanged, false);
    assert.notEqual(v1First.compact, true, 'default export is v1, not compact');
    const v1Again = PIPELINE.exportReview(compactDir, { limit: 10 });
    assert.equal(v1Again.skipped_unchanged, true, 'a repeated v1 export of the same proofs should still skip');

    const compactExport = PIPELINE.exportReview(compactDir, { limit: 10, compact: true });
    assert.equal(compactExport.skipped_unchanged, false, 'switching v1 -> compact on the same proofs must re-export, not skip');
    assert.equal(compactExport.compact, true);
    assert.equal(compactExport.count, 2, 'count reflects proofs, not the header row');
    // A second compact export of the same set now DOES skip (same proofs, same format).
    const compactAgain = PIPELINE.exportReview(compactDir, { limit: 10, compact: true });
    assert.equal(compactAgain.skipped_unchanged, true, 'a repeated compact export of the same proofs should skip');
    // The stream now holds the prior v1 batch plus this compact batch; scope the
    // header/proof-row assertions to the compact batch we just wrote.
    const compactRows = STORE.readJsonl(compactExport.jsonl_path, { skipMalformed: true })
      .filter(row => row.batch_id === compactExport.batch_id);
    const headerRows = compactRows.filter(row => row.type === 'batch_header');
    const proofRows = compactRows.filter(row => row.type !== 'batch_header');
    assert.equal(headerRows.length, 1, 'compact batch should have exactly one header row');
    const header = headerRows[0];
    assert.match(header.review_instructions, /Do not invent missing Oracle text/);
    assert.ok(header.return_contract && header.return_contract.required_fields, 'header carries a return_contract');
    assert.ok(header.oracle_text && header.oracle_text['Shared Card'], 'header carries a deduped oracle_text dict');
    // The shared card appears once in the dict despite being in two proofs.
    assert.equal(Object.keys(header.oracle_text).filter(name => name === 'Shared Card').length, 1);
    assert.deepEqual(Object.keys(header.oracle_text).sort(), ['Shared Card', 'Unique A', 'Unique B']);
    assert.equal(proofRows.length, 2);
    for (const row of proofRows) {
      assert.ok(row.proof_id, 'compact proof rows carry proof_id');
      assert.equal(row.review_instructions, undefined, 'compact proof rows omit per-row review_instructions');
      assert.equal(row.oracle_text, undefined, 'compact proof rows omit per-row oracle_text');
      assert.equal(row.proof_package, undefined, 'compact proof rows do not embed the full proof_package');
      assert.equal(row.proof, undefined, 'compact proof rows do not embed the full proof');
      assert.ok(row.proof_package_ref, 'compact proof rows carry a proof_package_ref');
      // Populated optional fields are kept; empty ones are omitted entirely
      // (these test attempts have a non-empty action_sequence/assumptions but an
      // empty limiting_clauses) so empty arrays never burn reviewer tokens.
      assert.ok(Array.isArray(row.action_sequence) && row.action_sequence.length, 'populated action_sequence is kept');
      assert.ok(Array.isArray(row.assumptions) && row.assumptions.length, 'populated assumptions is kept');
      assert.equal(row.limiting_clauses, undefined, 'empty limiting_clauses is omitted');
    }
    assert.match(fs.readFileSync(compactExport.markdown_path, 'utf8'), /Do not invent missing Oracle text/);

    // Oracle-text fallback: a proof can reference a card never persisted to the
    // store `cards` stream (e.g. combo-sweep / EDHREC proofs). The export must
    // resolve its Oracle text from the full card DB instead of emitting '' —
    // without text an LLM reviewer has nothing to review.
    STORE.appendRecord(compactDir, 'proofAttempts', {
      schemaVersion: PIPELINE.PROOF_REVIEW_SCHEMA_VERSION,
      proof_id: 'proof_compact_fallback',
      run_id: 'run_compact',
      involved_cards: ['Shared Card', 'Sol Ring'],
      interaction_family: 'fam_compact_fallback',
      synergy_class: PIPELINE.SynergyClass.OneWayEnablement,
      action_sequence: [],
      rules_concepts: ['UNKNOWN'],
      resulting_advantage: ['UNKNOWN'],
      assumptions: [],
      limiting_clauses: [],
      rejection_reasons: ['needs review reason'],
      status: PIPELINE.Status.NeedsReview,
      deterministic_check_results: { graph_edge_present: true, deterministic_proof_package_present: false },
      created_at: '2026-06-29T00:00:00.000Z',
      updated_at: '2026-06-29T00:00:00.000Z',
    });
    const fallbackExport = PIPELINE.exportReview(compactDir, { limit: 10, compact: true, force: true });
    const fallbackHeader = STORE.readJsonl(fallbackExport.jsonl_path, { skipMalformed: true })
      .filter(row => row.batch_id === fallbackExport.batch_id && row.type === 'batch_header')[0];
    // 'Sol Ring' is not in the store cards stream but is in the full Scryfall DB.
    assert.ok(fallbackHeader.oracle_text['Sol Ring'], 'oracle text resolves from the full card DB when absent from the store stream');
  }

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

  // Generator -> critic drafting. Build a self-contained store with NEEDS_REVIEW attempts.
  const validDraft = {
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

  function seedDraftStore() {
    return seedAttempts(2);
  }

  async function seedAttempts(count) {
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mtg-proof-draft-'));
    STORE.initializeStore(dir);
    for (let i = 0; i < count; i++) {
      STORE.appendRecord(dir, 'proofAttempts', {
        schemaVersion: PIPELINE.PROOF_REVIEW_SCHEMA_VERSION,
        proof_id: 'proof_draft_' + i,
        run_id: 'run_draft',
        involved_cards: ['Card A' + i, 'Card B' + i],
        interaction_family: 'fam_' + (i % 2),
        synergy_class: PIPELINE.SynergyClass.OneWayEnablement,
        status: PIPELINE.Status.NeedsReview,
        rejection_reasons: ['needs review'],
        deterministic_check_results: { graph_edge_present: true, deterministic_proof_package_present: false },
        created_at: '2026-06-29T00:00:00.000Z',
        updated_at: '2026-06-29T00:00:00.000Z',
      });
    }
    return dir;
  }

  function makeClient(handler) {
    return {
      generatorModel: 'gen-model',
      criticModel: 'crit-model',
      calls: { generator: 0, critic: 0 },
      async generateJson(prompt, schema, options) {
        if (options.model === this.generatorModel) {
          this.calls.generator += 1;
          return handler.generator();
        }
        if (options.model === this.criticModel) {
          this.calls.critic += 1;
          return handler.critic();
        }
        throw new Error('unexpected model: ' + options.model);
      },
    };
  }

  // Case: generator valid + critic PASS -> REVIEW_READY.
  {
    const dir = await seedDraftStore();
    const client = makeClient({ generator: () => ({ ...validDraft }), critic: () => ({ verdict: 'PASS', issues: [], confidence: 0.8 }) });
    const result = await PIPELINE.draftProofs(dir, { client, limit: 1 });
    assert.equal(result.drafted, 1);
    assert.equal(result.review_ready, 1);
    assert.equal(result.exhausted, false);
    const rows = STORE.readRecords(dir, 'llmDrafts');
    assert.equal(rows[0].status, PIPELINE.Status.ReviewReady);
    assert.equal(rows[0].critic_verdict, 'PASS');
    assert.equal(rows[0].critic_confidence, 0.8);
    assert.equal(rows[0].generator_model, 'gen-model');
    assert.equal(rows[0].critic_model, 'crit-model');
    assert.equal(rows[0].deterministic_check_results.accepted_or_promoted, false);
  }

  // Case: generator valid + critic FAIL -> CRITIC_REJECTED.
  {
    const dir = await seedDraftStore();
    const client = makeClient({ generator: () => ({ ...validDraft }), critic: () => ({ verdict: 'FAIL', issues: ['bad timing'], confidence: 0.9 }) });
    const result = await PIPELINE.draftProofs(dir, { client, limit: 1 });
    assert.equal(result.critic_rejected, 1);
    const rows = STORE.readRecords(dir, 'llmDrafts');
    assert.equal(rows[0].status, PIPELINE.Status.CriticRejected);
    assert.deepEqual(rows[0].critic_issues, ['bad timing']);
  }

  // Case: generator throws -> REJECTED, critic NOT called.
  {
    const dir = await seedDraftStore();
    const client = makeClient({ generator: () => { throw new Error('mock malformed draft'); }, critic: () => ({ verdict: 'PASS', issues: [], confidence: 1 }) });
    const result = await PIPELINE.draftProofs(dir, { client, limit: 1 });
    assert.equal(result.rejected, 1);
    assert.equal(client.calls.critic, 0, 'critic must not be called when generation fails');
    const rows = STORE.readRecords(dir, 'llmDrafts');
    assert.equal(rows[0].status, PIPELINE.Status.Rejected);
    assert.match(rows[0].failure_reason, /mock malformed draft/);
  }

  // Case: critic throws -> CRITIC_REJECTED fail-closed with non-empty issues.
  {
    const dir = await seedDraftStore();
    const client = makeClient({ generator: () => ({ ...validDraft }), critic: () => { throw new Error('critic offline'); } });
    const result = await PIPELINE.draftProofs(dir, { client, limit: 1 });
    assert.equal(result.critic_rejected, 1);
    const rows = STORE.readRecords(dir, 'llmDrafts');
    assert.equal(rows[0].status, PIPELINE.Status.CriticRejected);
    assert.equal(rows[0].critic_verdict, 'FAIL');
    assert.equal(rows[0].critic_confidence, 0);
    assert.ok(Array.isArray(rows[0].critic_issues) && rows[0].critic_issues.length > 0);
    assert.match(rows[0].critic_issues[0], /critic_error/);
  }

  // Case: resumability — limit:1 drafts #1 then #2, then exhausted.
  {
    const dir = await seedAttempts(2);
    const client = makeClient({ generator: () => ({ ...validDraft }), critic: () => ({ verdict: 'PASS', issues: [], confidence: 0.7 }) });
    const first = await PIPELINE.draftProofs(dir, { client, limit: 1 });
    assert.equal(first.drafted, 1);
    const firstId = first.drafts[0].source_proof_id;
    const second = await PIPELINE.draftProofs(dir, { client, limit: 1 });
    assert.equal(second.drafted, 1);
    const secondId = second.drafts[0].source_proof_id;
    assert.notEqual(secondId, firstId, 'second draft must target a different proof');
    // Both seeded sources should now be covered exactly once (no double-draft).
    const draftedSources = new Set(STORE.readRecords(dir, 'llmDrafts').map(row => row.source_proof_id));
    assert.deepEqual([...draftedSources].sort(), ['proof_draft_0', 'proof_draft_1']);
    const third = await PIPELINE.draftProofs(dir, { client, limit: 1 });
    assert.equal(third.drafted, 0);
    assert.equal(third.exhausted, true);
    // INVARIANT: no draft record ever accepts/promotes.
    for (const row of STORE.readRecords(dir, 'llmDrafts')) {
      assert.notEqual(row.status, PIPELINE.Status.Accepted);
      assert.notEqual(row.status, PIPELINE.Status.PromotedToTest);
      assert.equal(row.deterministic_check_results.accepted_or_promoted, false);
    }
  }

  // Case: local LLM review-assist creates import-compatible candidate files without importing/promoting.
  {
    const dir = await seedAttempts(3);
    const client = makeClient({ generator: () => ({ ...validDraft, confidence: 0.86 }), critic: () => ({ verdict: 'PASS', issues: [], confidence: 0.9 }) });
    await PIPELINE.draftProofs(dir, { client, limit: 2 });
    const beforeStatuses = new Map(STORE.latestById(STORE.readRecords(dir, 'proofAttempts'), 'proof_id').map(row => [row.proof_id, row.status]));
    const prepared = PIPELINE.prepareReviewCandidates(dir, { limit: 10 });
    assert.equal(prepared.count, 2);
    assert.equal(prepared.buckets.likely_accept, 2);
    assert.equal(path.basename(prepared.jsonl_path), 'reviewed.candidates.jsonl');
    assert.equal(path.basename(prepared.markdown_path), 'reviewed.candidates.md');
    assert.equal(fs.existsSync(prepared.jsonl_path), true);
    assert.equal(fs.existsSync(prepared.markdown_path), true);
    assert.match(fs.readFileSync(prepared.markdown_path, 'utf8'), /Human confirmation is required|not trusted proof/);

    const candidateRows = STORE.readJsonl(prepared.jsonl_path).map(PIPELINE.validateReviewRow);
    assert.equal(candidateRows.length, 2);
    assert.ok(candidateRows.every(row => row.verdict === 'ACCEPTED'), 'high-confidence PASS drafts become likely_accept candidates');
    assert.ok(candidateRows.every(row => row.review_assist.requires_human_confirmation === true));
    assert.ok(candidateRows.every(row => row.corrected_proof.source === 'local-llm-review-assist'));

    const afterStatuses = new Map(STORE.latestById(STORE.readRecords(dir, 'proofAttempts'), 'proof_id').map(row => [row.proof_id, row.status]));
    assert.deepEqual(afterStatuses, beforeStatuses, 'prepareReviewCandidates must not import, accept, or promote source proofs');
    assert.equal(STORE.readRecords(dir, 'proofReviews').length, 0, 'prepareReviewCandidates must not append review records');
    assert.equal(STORE.readRecords(dir, 'goldenTests').length, 0, 'prepareReviewCandidates must not promote tests');
  }

  // Case: lower-confidence review-ready drafts are import-compatible NEEDS_CORRECTION candidates.
  {
    const dir = await seedAttempts(1);
    const client = makeClient({ generator: () => ({ ...validDraft, confidence: 0.4 }), critic: () => ({ verdict: 'PASS', issues: [], confidence: 0.55 }) });
    await PIPELINE.draftProofs(dir, { client, limit: 1 });
    const prepared = PIPELINE.prepareReviewCandidates(dir, { limit: 10 });
    assert.equal(prepared.count, 1);
    assert.equal(prepared.buckets.needs_human_rules_check, 1);
    const row = STORE.readJsonl(prepared.jsonl_path).map(PIPELINE.validateReviewRow)[0];
    assert.equal(row.verdict, 'NEEDS_CORRECTION');
    assert.match(row.issues.join(' '), /needs_human_rules_check/);
  }

  // CLI wiring for prepare-review-candidates.
  {
    const dir = await seedAttempts(1);
    const client = makeClient({ generator: () => ({ ...validDraft, confidence: 0.9 }), critic: () => ({ verdict: 'PASS', issues: [], confidence: 0.9 }) });
    await PIPELINE.draftProofs(dir, { client, limit: 1 });
    const originalWrite = process.stdout.write;
    let output = '';
    process.stdout.write = (chunk, ...rest) => { output += String(chunk); return true; };
    try {
      await cliMain(['prepare-review-candidates', '--store-dir', dir, '--limit', '5']);
    } finally {
      process.stdout.write = originalWrite;
    }
    const parsed = JSON.parse(output);
    assert.equal(parsed.command, 'prepare-review-candidates');
    assert.equal(parsed.count, 1);
    assert.equal(fs.existsSync(path.join(dir, 'reviewed.candidates.jsonl')), true);
  }

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
  assert.equal(fs.existsSync(STORE.shardDir(cliDir, 'decks')), true);
  assert.equal(STORE.readRecords(cliDir, 'decks').length >= 1, true);
  assert.match(cliOutput, /proof-review-sample/);

  process.stdout.write('Proof review pipeline tests passed\n');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
