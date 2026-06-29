const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const STORE = require('../src/proof-review-store');
const PIPELINE = require('../src/proof-review-pipeline');
const COMBO_LIB = require('../src/combo-family-library');

function sampleCard(name, type_line, oracle_text, extra = {}) {
  return Object.assign({ name, type_line, oracle_text, mana_cost: extra.mana_cost || '', cmc: extra.cmc || 0, color_identity: extra.color_identity || [] }, extra);
}

// Real card names that resolve through the engine, mirroring the pipeline test.
const sampleCards = [
  sampleCard('Kiki-Jiki, Mirror Breaker', 'Legendary Creature — Goblin Shaman', "{T}: Create a token that's a copy of target nonlegendary creature you control, except it has haste. Sacrifice it at the beginning of the next end step.", { mana_cost: '{2}{R}{R}{R}', cmc: 5, color_identity: ['R'] }),
  sampleCard('Zealous Conscripts', 'Creature — Human Warrior', 'Haste When Zealous Conscripts enters the battlefield, gain control of target permanent until end of turn. Untap that permanent. It gains haste until end of turn.', { mana_cost: '{4}{R}', cmc: 5, color_identity: ['R'] }),
  sampleCard("Ashnod's Altar", 'Artifact', 'Sacrifice a creature: Add {C}{C}.', { mana_cost: '{3}', cmc: 3 }),
  sampleCard('Blood Artist', 'Creature — Vampire', 'Whenever Blood Artist or another creature dies, target player loses 1 life and you gain 1 life.', { mana_cost: '{1}{B}', cmc: 2, color_identity: ['B'] }),
  sampleCard('Reassembling Skeleton', 'Creature — Skeleton Warrior', '{1}{B}: Return Reassembling Skeleton from your graveyard to the battlefield tapped.', { mana_cost: '{1}{B}', cmc: 2, color_identity: ['B'] }),
];
const cardsByName = Object.fromEntries(sampleCards.map(card => [card.name.toLowerCase(), card]));

// Phase 0 readIndex returns latest-line-wins sidecar entries ({id,shard,status,...}).
// For full progress record bodies (combo_id, unresolved_names, ...) read the shards
// and reduce by combo_id.
function progressById(dir) {
  const map = new Map();
  for (const row of STORE.latestById(STORE.readRecords(dir, 'comboSweepProgress'), 'combo_id')) {
    map.set(row.combo_id, row);
  }
  return map;
}

const fakeCombos = [
  { id: 'combo-A', cards: ['Kiki-Jiki, Mirror Breaker', 'Zealous Conscripts'], results: ['Infinite tokens'], metadata: { deckCount: 100 } },
  { id: 'combo-B', cards: ["Ashnod's Altar", 'Blood Artist', 'Reassembling Skeleton'], results: ['Infinite life loss'], metadata: { deckCount: 50 } },
  { id: 'combo-C', cards: ['Kiki-Jiki, Mirror Breaker', 'A Card That Does Not Exist In The Index'], results: ['Infinite'], metadata: { deckCount: 10 } },
];

async function main() {
  // --- Resumability + processing across two limited calls. ---
  {
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mtg-combo-sweep-'));
    const first = PIPELINE.runComboSweep(dir, { combos: fakeCombos, cardsByName, limit: 1 });
    assert.equal(first.processed, 1, 'first limited call processes one runnable combo');
    assert.equal(first.exhausted, false, 'more combos remain after first call');
    assert.ok(first.attempts_created > 0, 'a runnable combo should create proof attempts');

    const progressAfterFirst = progressById(dir);
    assert.equal(progressAfterFirst.size, 1, 'progress recorded for exactly one combo');

    // Second call must skip the already-done combo and pick up the rest.
    const second = PIPELINE.runComboSweep(dir, { combos: fakeCombos, cardsByName, limit: 10 });
    assert.equal(second.exhausted, true, 'no un-processed combos remain after second call');

    const progress = progressById(dir);
    assert.equal(progress.size, 3, 'every combo is recorded exactly once across resumable calls');
    assert.equal(new Set([...progress.values()].map(p => p.combo_id)).size, 3, 'no duplicate combo progress');

    // --- A combo with an unresolvable card is SKIPPED, not crashed. ---
    const skipped = progress.get('combo-C');
    assert.equal(skipped.status, 'SKIPPED', 'combo with unresolved cards is skipped');
    assert.deepEqual(skipped.unresolved_names, ['A Card That Does Not Exist In The Index']);
    assert.equal(skipped.attempts_created, 0, 'skipped combos create no attempts');

    // The runnable combos are PROCESSED.
    assert.equal(progress.get('combo-A').status, 'PROCESSED');
    assert.equal(progress.get('combo-B').status, 'PROCESSED');

    // --- Trust wall: nothing from the sweep is ACCEPTED / PROMOTED. ---
    const attempts = STORE.readRecords(dir, 'proofAttempts');
    assert.ok(attempts.length > 0, 'sweep produced proof attempts');
    for (const attempt of attempts) {
      assert.notEqual(attempt.status, PIPELINE.Status.Accepted, 'sweep must not accept');
      assert.notEqual(attempt.status, PIPELINE.Status.PromotedToTest, 'sweep must not promote');
      assert.ok(
        attempt.status === PIPELINE.Status.NeedsReview || attempt.status === PIPELINE.Status.DeterministicallyProven,
        'sweep attempts are only NEEDS_REVIEW or DETERMINISTICALLY_PROVEN routing records',
      );
    }
    // No drafts, no reviews, no golden tests get created by a sweep.
    assert.equal(STORE.readRecords(dir, 'llmDrafts').length, 0, 'sweep does not draft');
    assert.equal(STORE.readRecords(dir, 'proofReviews').length, 0, 'sweep does not review');
    assert.equal(STORE.readRecords(dir, 'goldenTests').length, 0, 'sweep does not promote tests');

    // A third call is idempotent / still exhausted.
    const third = PIPELINE.runComboSweep(dir, { combos: fakeCombos, cardsByName, limit: 10 });
    assert.equal(third.processed, 0);
    assert.equal(third.exhausted, true);
    assert.equal(progressById(dir).size, 3, 'idempotent re-run adds no new progress');
  }

  // --- Trust wall: sweep does not mutate combo-family-library at runtime. ---
  {
    const before = JSON.stringify(COMBO_LIB.COMBO_FAMILIES);
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mtg-combo-sweep-lib-'));
    PIPELINE.runComboSweep(dir, { combos: fakeCombos, cardsByName, limit: 10 });
    assert.equal(JSON.stringify(COMBO_LIB.COMBO_FAMILIES), before, 'combo-family-library must be untouched');
  }

  // --- O(n^2) avoidance: many combos, prove the priorAttempts scan is scoped. ---
  {
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mtg-combo-sweep-scale-'));
    // Build many distinct runnable combos by reusing the resolving card pair.
    const many = [];
    for (let i = 0; i < 40; i++) many.push({ id: 'scale-' + i, cards: ['Kiki-Jiki, Mirror Breaker', 'Zealous Conscripts'], results: ['Infinite'], metadata: {} });

    // Spy on latestAttempts via the store's proofAttempts read. The sweep path
    // passes skipPriorAttempts, so runDeterministic must NOT full-scan the
    // attempts stream per combo. Count reads of the proof-attempts stream.
    const realReadRecords = STORE.readRecords;
    let proofAttemptReads = 0;
    STORE.readRecords = function (storeDir, key, options) {
      if (key === 'proofAttempts') proofAttemptReads += 1;
      return realReadRecords.call(this, storeDir, key, options);
    };
    let result;
    try {
      result = PIPELINE.runComboSweep(dir, { combos: many, cardsByName, limit: 40 });
    } finally {
      STORE.readRecords = realReadRecords;
    }
    assert.equal(result.processed, 40, 'all 40 scale combos processed');
    // With per-combo full scans this would be >= 40. Scoped/skip means the
    // engine never reads the proof-attempts stream during the sweep loop.
    assert.equal(proofAttemptReads, 0, 'sweep must not full-scan the proof-attempts stream per combo');
  }

  // --- Single-deck runDeterministic still preserves lifecycle (unchanged). ---
  {
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mtg-combo-sweep-lifecycle-'));
    STORE.initializeStore(dir);
    PIPELINE.createSample(dir, { cardsByName });
    const run = PIPELINE.runDeterministic(dir, { cardsByName });
    const reviewTarget = STORE.latestById(STORE.readRecords(dir, 'proofAttempts'), 'proof_id')
      .find(a => a.status === PIPELINE.Status.NeedsReview);
    const reviewPath = path.join(dir, 'reviewed.jsonl');
    fs.writeFileSync(reviewPath, JSON.stringify({
      proof_id: reviewTarget.proof_id,
      verdict: 'ACCEPTED',
      corrected_confidence: 0.9,
      corrected_synergy_class: 'STRONG_SYNERGY',
      issues: [],
      corrected_proof: { note: 'accepted' },
      test_case_recommendation: 'keep',
    }) + '\n');
    PIPELINE.importReview(dir, reviewPath);
    // Default (no skipPriorAttempts) single-deck rerun must preserve ACCEPTED.
    PIPELINE.runDeterministic(dir, { cardsByName });
    const preserved = STORE.latestById(STORE.readRecords(dir, 'proofAttempts'), 'proof_id')
      .find(a => a.proof_id === reviewTarget.proof_id);
    assert.equal(preserved.status, PIPELINE.Status.Accepted, 'single-deck rerun must not regress accepted proofs');
  }

  process.stdout.write('Combo sweep tests passed\n');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
