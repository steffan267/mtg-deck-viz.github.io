/*
 * proof-review-pipeline.js — local proof review lifecycle around the existing
 * deterministic MTG interaction engine.
 *
 * The functions here consume existing graph/proof-package output and persist
 * routing/review records. They do not implement another proof search engine.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { build, loadCards } = require('./build-deck-viz');
const STORE = require('./proof-review-store');
const { LocalLlmClient } = require('./local-llm-client');

const PROOF_REVIEW_SCHEMA_VERSION = 'proof-review.v1';
const REVIEW_EXPORT_SCHEMA_VERSION = 'proof-review-export.v1';

const Status = Object.freeze({
  New: 'NEW',
  Generated: 'GENERATED',
  DeterministicallyProven: 'DETERMINISTICALLY_PROVEN',
  NeedsReview: 'NEEDS_REVIEW',
  ChatgptReviewed: 'CHATGPT_REVIEWED',
  Accepted: 'ACCEPTED',
  Rejected: 'REJECTED',
  PromotedToTest: 'PROMOTED_TO_TEST',
});

const SynergyClass = Object.freeze({
  CoincidentalSynergy: 'COINCIDENTAL_SYNERGY',
  OneWayEnablement: 'ONE_WAY_ENABLEMENT',
  StrongSynergy: 'STRONG_SYNERGY',
  Engine: 'ENGINE',
  SoftCombo: 'SOFT_COMBO',
  DeterministicCombo: 'DETERMINISTIC_COMBO',
  InfiniteCombo: 'INFINITE_COMBO',
});

const REVIEW_VERDICTS = new Set(['ACCEPTED', 'REJECTED', 'NEEDS_CORRECTION']);
const SYNERGY_CLASSES = new Set(Object.values(SynergyClass));
const LIFECYCLE_STATUSES_TO_PRESERVE = new Set([
  Status.Accepted,
  Status.Rejected,
  Status.PromotedToTest,
]);

const LLM_DRAFT_SCHEMA_VERSION = 'proof-review-llm-draft.v1';
const LLM_PROOF_DRAFT_SCHEMA = Object.freeze({
  required: [
    'cards',
    'interaction_family',
    'synergy_class',
    'action_sequence',
    'game_objects',
    'rules_concepts',
    'resulting_advantage',
    'assumptions',
    'failure_modes',
    'confidence',
    'explanation',
    'why_this_is_not_stronger_classification',
  ],
  note: 'This is an untrusted draft. It cannot accept, verify, promote, or replace deterministic proof output.',
});

const DEFAULT_SAMPLE_NAMES = [
  'Panharmonicon',
  'Eternal Witness',
  'Ephemerate',
  'Sol Ring',
  "Ashnod's Altar",
  'Blood Artist',
  'Reassembling Skeleton',
  'Doubling Season',
  'Impact Tremors',
  'Kiki-Jiki, Mirror Breaker',
  'Zealous Conscripts',
];

function now() {
  return new Date().toISOString();
}

function hashId(prefix, value) {
  return prefix + '_' + crypto.createHash('sha1').update(JSON.stringify(value)).digest('hex').slice(0, 16);
}

function normalizeName(name) {
  return String(name || '').trim().toLowerCase();
}

function cardRecord(card, runId) {
  return {
    schemaVersion: PROOF_REVIEW_SCHEMA_VERSION,
    card_id: hashId('card', [card.name || card.id, card.cardKey || card.oracle_id || card.text]),
    run_id: runId,
    name: card.name || card.id,
    oracle_text: card.oracle_text || card.text || '',
    type_line: card.type_line || card.type || '',
    mana_cost: card.mana_cost || card.mana || '',
    color_identity: card.color_identity || card.ci || [],
    source_metadata: {
      cardKey: card.cardKey,
      canonicalName: card.canonicalName,
      layout: card.layout,
      edhrec_rank: card.edhrec_rank || card.edh || null,
    },
    created_at: now(),
    updated_at: now(),
  };
}

function graphCardRecord(node, runId) {
  return cardRecord({
    name: node.id,
    oracle_text: node.text,
    type_line: node.type,
    mana_cost: node.mana,
    color_identity: node.ci,
    cardKey: node.cardKey,
    canonicalName: node.canonicalName,
    layout: node.layout,
    edhrec_rank: node.edh,
  }, runId);
}


function createSample(storeDir = STORE.DEFAULT_PROOF_REVIEW_DIR, options = {}) {
  STORE.initializeStore(storeDir);
  const runId = options.runId || hashId('run', ['sample', now()]);
  const deckId = options.deckId || 'sample';
  const created = now();
  const names = options.names || DEFAULT_SAMPLE_NAMES;
  const idx = options.cardsByName || loadCards();
  const decklist = names.map(name => ({ qty: 1, name }));
  const resolved = [];
  const unresolved = [];
  for (const entry of decklist) {
    const key = normalizeName(entry.name);
    const card = idx[key] || Object.values(idx).find(candidate => normalizeName(candidate.name) === key || (candidate.aliases || []).includes(key));
    if (card) resolved.push({ qty: entry.qty, name: entry.name, resolved: card });
    else unresolved.push(entry.name);
  }

  const deck = {
    schemaVersion: PROOF_REVIEW_SCHEMA_VERSION,
    deck_id: deckId,
    run_id: runId,
    name: 'proof-review-sample',
    source: 'built-in sample',
    cards: decklist,
    unresolved_names: unresolved,
    created_at: created,
    updated_at: created,
  };
  STORE.appendRecord(storeDir, 'decks', deck);
  for (const entry of resolved) STORE.appendRecord(storeDir, 'cards', cardRecord(entry.resolved, runId));
  STORE.appendRecord(storeDir, 'engineRuns', {
    schemaVersion: PROOF_REVIEW_SCHEMA_VERSION,
    run_id: runId,
    command: 'sample',
    status: Status.Generated,
    deck_id: deckId,
    generated_by: 'mtg-proofs sample',
    summary: { requested_cards: decklist.length, resolved_cards: resolved.length, unresolved_cards: unresolved.length },
    created_at: created,
    updated_at: created,
  });
  return { run_id: runId, deck_id: deckId, deck, resolved_count: resolved.length, unresolved };
}

function latestDeck(storeDir, deckId = 'sample') {
  const decks = STORE.readRecords(storeDir, 'decks');
  return [...decks].reverse().find(deck => deck.deck_id === deckId) || null;
}

function loadDeckCards(deck) {
  if (!deck) throw new Error('Deck not found. Run sample first or pass a known deck id.');
  return (deck.cards || []).map(card => ({ qty: card.qty || 1, name: card.name }));
}

function synergyClassForPackage(pkg) {
  const result = JSON.stringify(pkg.result || {}).toLowerCase();
  const repeat = JSON.stringify(pkg.repeatability || {}).toLowerCase();
  if (/infinite/.test(result) || /repeatable/.test(repeat)) return SynergyClass.InfiniteCombo;
  if (pkg.status === 'proven' && pkg.strength === 'combo-critical') return SynergyClass.DeterministicCombo;
  if (pkg.cardCount >= 3) return SynergyClass.Engine;
  return SynergyClass.StrongSynergy;
}

function rulesConceptsForPackage(pkg) {
  const text = JSON.stringify([pkg.family, pkg.sequence, pkg.result]).toLowerCase();
  const concepts = [];
  if (/etb|enter/.test(text)) concepts.push('ETB');
  if (/ltb|leave/.test(text)) concepts.push('LTB');
  if (/trigger/.test(text)) concepts.push('TRIGGERED_ABILITY');
  if (/activate|activated|\{t\}/.test(text)) concepts.push('ACTIVATED_ABILITY');
  if (/mana/.test(text)) concepts.push('MANA_PRODUCTION');
  if (/token/.test(text)) concepts.push('TOKEN_CREATION');
  if (/copy/.test(text)) concepts.push('COPYING_PERMANENT');
  if (/sacrifice|sac/.test(text)) concepts.push('SACRIFICE');
  if (/graveyard|recursion/.test(text)) concepts.push('GRAVEYARD_RECURSION');
  if (/blink|exile.*return|flicker/.test(text)) concepts.push('EXILE_RETURN');
  if (/loop|repeatable|infinite/.test(text)) concepts.push('LOOP');
  return concepts.length ? [...new Set(concepts)] : ['UNKNOWN'];
}

function advantageForPackage(pkg) {
  const text = JSON.stringify(pkg.result || {}).toLowerCase();
  const out = [];
  if (/mana/.test(text)) out.push('MANA');
  if (/draw|card/.test(text)) out.push('CARDS');
  if (/damage|loss|drain/.test(text)) out.push('DAMAGE');
  if (/token/.test(text)) out.push('TOKENS');
  if (/lock/.test(text)) out.push('LOCK');
  if (/infinite/.test(text)) out.push('INFINITE_LOOP');
  if (/turn|win/.test(text)) out.push('WIN_CONDITION');
  return out.length ? [...new Set(out)] : ['VALUE_ENGINE'];
}

function attemptFromPackage(pkg, runId) {
  const created = now();
  return {
    schemaVersion: PROOF_REVIEW_SCHEMA_VERSION,
    proof_id: hashId('proof', ['package', pkg.id, pkg.family, pkg.cards]),
    run_id: runId,
    involved_cards: pkg.cards || [],
    interaction_family: pkg.family,
    synergy_class: synergyClassForPackage(pkg),
    action_sequence: pkg.sequence || [],
    game_objects: pkg.contributions || [],
    rules_concepts: rulesConceptsForPackage(pkg),
    resulting_advantage: advantageForPackage(pkg),
    assumptions: pkg.assumptions || [],
    limiting_clauses: pkg.limitingClauses || [],
    rejection_reasons: [],
    deterministic_source: 'src/interaction-proof-packages.js:buildInteractionProofPackages',
    confidence_or_routing_score: pkg.confidence || 'pattern',
    status: Status.DeterministicallyProven,
    generated_by: 'deterministic-proof-engine',
    reviewed_by: null,
    deterministic_check_results: { deterministic_package_status: pkg.status, package_id: pkg.id, hyperedgeIds: pkg.hyperedgeIds || [] },
    proof_package: pkg,
    created_at: created,
    updated_at: created,
  };
}

function packageKey(cards, family) {
  return (cards || []).slice().sort().join('\u0000') + '\u0000' + String(family || 'UNKNOWN');
}

function packageCoverageKeys(pkg) {
  const cards = pkg.cards || [];
  const families = new Set([pkg.family, ...(pkg.hyperedgeIds || [])]);
  for (const item of pkg.evidence || []) if (item && item.family) families.add(item.family);
  return [...families].filter(Boolean).map(family => packageKey(cards, family));
}

function edgeFamilies(edge) {
  return [...new Set((edge.interactions || []).map(item => item.family || item.event || 'UNKNOWN'))].sort();
}

function candidateFromEdgeFamily(edge, family, runId, provenPackageKeys) {
  const cards = [edge.source, edge.target].sort();
  const id = hashId('cand', ['edge-family', cards, family]);
  const hasPackage = provenPackageKeys.has(packageKey(cards, family));
  const created = now();
  const interactions = (edge.interactions || []).filter(item => (item.family || item.event || 'UNKNOWN') === family);
  return {
    schemaVersion: PROOF_REVIEW_SCHEMA_VERSION,
    candidate_id: id,
    run_id: runId,
    cards,
    suspected_interaction_family: family || 'UNKNOWN',
    suspected_synergy_class: hasPackage ? SynergyClass.DeterministicCombo : SynergyClass.OneWayEnablement,
    short_reason: hasPackage ? 'Covered by a deterministic proof package for this family.' : 'Existing graph edge family has no deterministic proof package yet.',
    confidence: hasPackage ? 'deterministic' : 'needs-review',
    source: 'src/build-deck-viz.js graph edge family',
    interactions,
    created_at: created,
    updated_at: created,
  };
}

function attemptFromUncoveredCandidate(candidate, graph, runId) {
  const created = now();
  return {
    schemaVersion: PROOF_REVIEW_SCHEMA_VERSION,
    proof_id: hashId('proof', ['uncovered', candidate.candidate_id]),
    run_id: runId,
    involved_cards: candidate.cards || [],
    interaction_family: candidate.suspected_interaction_family || 'UNKNOWN',
    synergy_class: candidate.suspected_synergy_class || SynergyClass.OneWayEnablement,
    action_sequence: [],
    game_objects: (candidate.cards || []).map(name => ({ card: name, text: cardText(graph, name) })),
    rules_concepts: ['UNKNOWN'],
    resulting_advantage: ['UNKNOWN'],
    assumptions: [],
    limiting_clauses: ['No deterministic proof package currently explains this graph interaction.'],
    rejection_reasons: ['Candidate requires manual review or a future deterministic proof family.'],
    deterministic_source: 'src/build-deck-viz.js:build + src/interaction-model.js:interactionsBetween',
    confidence_or_routing_score: 'needs-review',
    status: Status.NeedsReview,
    generated_by: 'deterministic-graph-router',
    reviewed_by: null,
    deterministic_check_results: { graph_edge_present: true, deterministic_proof_package_present: false },
    created_at: created,
    updated_at: created,
  };
}

function cardText(graph, name) {
  const node = (graph.nodes || []).find(item => item.id === name);
  return node ? node.text || '' : '';
}

function runDeterministic(storeDir = STORE.DEFAULT_PROOF_REVIEW_DIR, options = {}) {
  STORE.initializeStore(storeDir);
  const created = now();
  const runId = options.runId || hashId('run', ['deterministic', created]);
  const deckId = options.deckId || 'sample';
  const idx = options.cardsByName || loadCards();
  let deck = options.deck || latestDeck(storeDir, deckId);
  if (!deck && deckId === 'sample') deck = createSample(storeDir, { cardsByName: idx, deckId }).deck;
  if (!deck) throw new Error('Deck not found: ' + deckId + '. Run sample first or pass a known deck id.');
  const priorAttempts = new Map(latestAttempts(storeDir).map(attempt => [attempt.proof_id, attempt]));
  const decklist = options.decklist || loadDeckCards(deck);
  const graph = build(decklist, idx, { includeInteractionProofs: true });
  const cardNodes = (graph.nodes || []).filter(node => node.role !== 'zone');
  for (const node of cardNodes) STORE.appendRecord(storeDir, 'cards', graphCardRecord(node, runId));

  const packages = graph.interactionProofs || [];
  const provenPackageKeys = new Set();
  for (const pkg of packages) {
    for (const key of packageCoverageKeys(pkg)) provenPackageKeys.add(key);
    STORE.appendRecord(storeDir, 'proofPackages', Object.assign({ schemaVersion: PROOF_REVIEW_SCHEMA_VERSION, run_id: runId, status: Status.DeterministicallyProven, created_at: created, updated_at: created }, pkg));
    appendGeneratedAttempt(storeDir, attemptFromPackage(pkg, runId), priorAttempts);
  }

  const candidates = [];
  for (const edge of graph.edges || []) {
    for (const family of edgeFamilies(edge)) {
      const candidate = candidateFromEdgeFamily(edge, family, runId, provenPackageKeys);
      candidates.push(candidate);
      STORE.appendRecord(storeDir, 'interactionCandidates', candidate);
      if (candidate.confidence === 'needs-review') appendGeneratedAttempt(storeDir, attemptFromUncoveredCandidate(candidate, graph, runId), priorAttempts);
    }
  }

  const run = {
    schemaVersion: PROOF_REVIEW_SCHEMA_VERSION,
    run_id: runId,
    command: 'run',
    status: Status.Generated,
    deck_id: deck.deck_id || deckId,
    generated_by: 'mtg-proofs run',
    summary: {
      cards: cardNodes.length,
      graph_edges: (graph.edges || []).length,
      proof_packages: packages.length,
      candidates: candidates.length,
      needs_review: candidates.filter(candidate => candidate.confidence === 'needs-review').length,
    },
    created_at: created,
    updated_at: created,
  };
  STORE.appendRecord(storeDir, 'engineRuns', run);
  return { run_id: runId, deck_id: deck.deck_id || deckId, graph, packages, candidates, run };
}

function latestAttempts(storeDir) {
  return STORE.latestById(STORE.readRecords(storeDir, 'proofAttempts'), 'proof_id');
}

function shouldPreserveLifecycle(attempt) {
  return attempt && (LIFECYCLE_STATUSES_TO_PRESERVE.has(attempt.status) || attempt.review_verdict === 'NEEDS_CORRECTION');
}

function appendGeneratedAttempt(storeDir, generatedAttempt, priorAttempts) {
  const prior = priorAttempts.get(generatedAttempt.proof_id);
  if (!shouldPreserveLifecycle(prior)) {
    STORE.appendRecord(storeDir, 'proofAttempts', generatedAttempt);
    priorAttempts.set(generatedAttempt.proof_id, generatedAttempt);
    return generatedAttempt;
  }
  const preserved = Object.assign({}, generatedAttempt, {
    status: prior.status,
    reviewed_by: prior.reviewed_by || generatedAttempt.reviewed_by,
    confidence_or_routing_score: prior.confidence_or_routing_score,
    synergy_class: prior.synergy_class || generatedAttempt.synergy_class,
    review_verdict: prior.review_verdict,
    correction_required: prior.correction_required,
    review_issues: prior.review_issues,
    corrected_proof: prior.corrected_proof,
    test_case_recommendation: prior.test_case_recommendation,
    lifecycle_preserved_from_run_id: prior.run_id,
    updated_at: now(),
  });
  STORE.appendRecord(storeDir, 'proofAttempts', preserved);
  priorAttempts.set(preserved.proof_id, preserved);
  return preserved;
}

function latestCardsByName(storeDir) {
  const map = new Map();
  for (const card of STORE.readRecords(storeDir, 'cards')) map.set(card.name, card);
  return map;
}

function reviewInstructions() {
  return 'You are reviewing Magic: The Gathering interaction proofs.\n\n'
    + 'Do not invent missing Oracle text.\n'
    + 'Use only the provided Oracle text and proof data.\n'
    + 'Check timing, zones, object identity, costs, replacement effects, triggered abilities, activated abilities, mana abilities, state-based actions, priority, loop validity, and whether the synergy class is overstated.\n\n'
    + 'Return JSONL only. Each line must include: proof_id, verdict (ACCEPTED, REJECTED, or NEEDS_CORRECTION), corrected_confidence, corrected_synergy_class, issues, corrected_proof, test_case_recommendation.';
}

function exportReview(storeDir = STORE.DEFAULT_PROOF_REVIEW_DIR, options = {}) {
  STORE.initializeStore(storeDir);
  const limit = Number(options.limit || 20);
  const exportDir = options.exportDir || storeDir;
  fs.mkdirSync(exportDir, { recursive: true });
  const attempts = latestAttempts(storeDir).filter(attempt => attempt.status === Status.NeedsReview).slice(0, limit);
  const cards = latestCardsByName(storeDir);
  const batchId = options.batchId || hashId('review_batch', [now(), attempts.map(item => item.proof_id)]);
  const jsonlPath = path.join(exportDir, batchId + '.jsonl');
  const mdPath = path.join(exportDir, batchId + '.md');
  const rows = attempts.map(attempt => ({
    schemaVersion: REVIEW_EXPORT_SCHEMA_VERSION,
    proof_id: attempt.proof_id,
    cards: attempt.involved_cards,
    oracle_text: Object.fromEntries((attempt.involved_cards || []).map(name => [name, cards.get(name)?.oracle_text || ''])),
    proof: attempt,
    review_instructions: reviewInstructions(),
  }));
  fs.writeFileSync(jsonlPath, rows.map(row => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : ''));
  fs.writeFileSync(mdPath, renderReviewMarkdown(batchId, rows));
  return { batch_id: batchId, markdown_path: mdPath, jsonl_path: jsonlPath, count: rows.length };
}

function renderReviewMarkdown(batchId, rows) {
  const parts = ['# MTG proof review batch ' + batchId, '', reviewInstructions(), ''];
  for (const row of rows) {
    parts.push('## Proof ' + row.proof_id, '');
    parts.push('Cards: ' + row.cards.join(', '), '');
    parts.push('Oracle text:');
    for (const [name, text] of Object.entries(row.oracle_text)) parts.push('- **' + name + '**: ' + (text || '(missing)'));
    parts.push('', 'Current deterministic proof/package output:', '```json', JSON.stringify(row.proof, null, 2), '```', '');
  }
  parts.push('Return JSONL only.');
  return parts.join('\n');
}

function validateReviewRow(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('Review row must be an object');
  if (row.schemaVersion && row.schemaVersion !== REVIEW_EXPORT_SCHEMA_VERSION) throw new Error('Review row has unsupported schemaVersion for ' + (row.proof_id || '(missing proof_id)'));
  if (!row.proof_id || typeof row.proof_id !== 'string') throw new Error('Review row missing proof_id');
  if (!REVIEW_VERDICTS.has(row.verdict)) throw new Error('Review row has invalid verdict for ' + row.proof_id);
  if (!Number.isFinite(row.corrected_confidence) || row.corrected_confidence < 0 || row.corrected_confidence > 1) throw new Error('Review row corrected_confidence must be a number from 0 to 1 for ' + row.proof_id);
  if (!SYNERGY_CLASSES.has(row.corrected_synergy_class)) throw new Error('Review row corrected_synergy_class is invalid for ' + row.proof_id);
  if (!Array.isArray(row.issues) || row.issues.some(issue => typeof issue !== 'string')) throw new Error('Review row issues must be an array of strings for ' + row.proof_id);
  if (!row.corrected_proof || typeof row.corrected_proof !== 'object' || Array.isArray(row.corrected_proof)) throw new Error('Review row corrected_proof must be an object for ' + row.proof_id);
  if (typeof row.test_case_recommendation !== 'string') throw new Error('Review row test_case_recommendation must be a string for ' + row.proof_id);
  return row;
}

function importReview(storeDir = STORE.DEFAULT_PROOF_REVIEW_DIR, reviewPath, options = {}) {
  if (!reviewPath) throw new Error('import-review requires a JSONL path');
  const rows = STORE.readJsonl(reviewPath).map(validateReviewRow);
  const attemptsById = new Map(latestAttempts(storeDir).map(attempt => [attempt.proof_id, attempt]));
  for (const row of rows) {
    if (!attemptsById.has(row.proof_id)) throw new Error('Review row references unknown proof_id: ' + row.proof_id);
  }

  const imported = [];
  const reviewer = options.reviewedBy || 'manual-chatgpt-jsonl';
  for (const row of rows) {
    const created = now();
    const review = Object.assign({}, row, {
      schemaVersion: PROOF_REVIEW_SCHEMA_VERSION,
      review_id: hashId('review', [row.proof_id, row.verdict, created]),
      reviewed_by: reviewer,
      status: Status.ChatgptReviewed,
      review_verdict: row.verdict,
      created_at: created,
      updated_at: created,
    });
    const status = row.verdict === 'ACCEPTED' ? Status.Accepted : (row.verdict === 'REJECTED' ? Status.Rejected : Status.NeedsReview);
    STORE.appendRecord(storeDir, 'proofReviews', review);
    STORE.appendStatusUpdate(storeDir, 'proofAttempts', 'proof_id', row.proof_id, {
      status,
      reviewed_by: reviewer,
      confidence_or_routing_score: row.corrected_confidence,
      synergy_class: row.corrected_synergy_class,
      review_verdict: row.verdict,
      correction_required: row.verdict === 'NEEDS_CORRECTION',
      review_issues: row.issues,
      corrected_proof: row.corrected_proof,
      test_case_recommendation: row.test_case_recommendation,
    });
    imported.push(review);
  }
  return { imported: imported.length, reviews: imported };
}

function llmDraftPrompt(attempt, cardsByName) {
  const oracle = Object.fromEntries((attempt.involved_cards || []).map(name => [name, cardsByName.get(name)?.oracle_text || '']));
  return [
    'You are drafting a Magic: The Gathering interaction proof for local review.',
    'Use only the provided Oracle text and current proof-review record.',
    'Do not claim deterministic correctness. Do not invent missing Oracle text.',
    'Return strict JSON only. The JSON is an untrusted draft and will be routed through deterministic/manual review later.',
    '',
    'Required fields: ' + LLM_PROOF_DRAFT_SCHEMA.required.join(', '),
    '',
    'Current proof-review record:',
    JSON.stringify(attempt, null, 2),
    '',
    'Oracle text:',
    JSON.stringify(oracle, null, 2),
  ].join('\n');
}

function validateLlmProofDraft(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('LLM proof draft must be an object');
  for (const field of LLM_PROOF_DRAFT_SCHEMA.required) {
    if (!(field in row)) throw new Error('LLM proof draft missing required field: ' + field);
  }
  if (!Array.isArray(row.cards) || row.cards.some(item => typeof item !== 'string')) throw new Error('LLM proof draft cards must be an array of strings');
  if (typeof row.interaction_family !== 'string' || !row.interaction_family) throw new Error('LLM proof draft interaction_family must be a string');
  if (!SYNERGY_CLASSES.has(row.synergy_class)) throw new Error('LLM proof draft synergy_class is invalid');
  if (!Array.isArray(row.action_sequence)) throw new Error('LLM proof draft action_sequence must be an array');
  if (!Array.isArray(row.game_objects)) throw new Error('LLM proof draft game_objects must be an array');
  if (!Array.isArray(row.rules_concepts) || row.rules_concepts.some(item => typeof item !== 'string')) throw new Error('LLM proof draft rules_concepts must be an array of strings');
  if (!Array.isArray(row.resulting_advantage) || row.resulting_advantage.some(item => typeof item !== 'string')) throw new Error('LLM proof draft resulting_advantage must be an array of strings');
  if (!Array.isArray(row.assumptions) || row.assumptions.some(item => typeof item !== 'string')) throw new Error('LLM proof draft assumptions must be an array of strings');
  if (!Array.isArray(row.failure_modes) || row.failure_modes.some(item => typeof item !== 'string')) throw new Error('LLM proof draft failure_modes must be an array of strings');
  if (!Number.isFinite(row.confidence) || row.confidence < 0 || row.confidence > 1) throw new Error('LLM proof draft confidence must be a number from 0 to 1');
  if (typeof row.explanation !== 'string') throw new Error('LLM proof draft explanation must be a string');
  if (typeof row.why_this_is_not_stronger_classification !== 'string') throw new Error('LLM proof draft why_this_is_not_stronger_classification must be a string');
  return row;
}

async function draftProofs(storeDir = STORE.DEFAULT_PROOF_REVIEW_DIR, options = {}) {
  STORE.initializeStore(storeDir);
  const limit = Number(options.limit || 10);
  const client = options.client || new LocalLlmClient(options.llm || {});
  const cardsByName = latestCardsByName(storeDir);
  const attempts = latestAttempts(storeDir).filter(attempt => attempt.status === Status.NeedsReview).slice(0, limit);
  const drafts = [];
  for (const attempt of attempts) {
    const created = now();
    const draftId = hashId('llm_draft', [attempt.proof_id, created]);
    const base = {
      schemaVersion: LLM_DRAFT_SCHEMA_VERSION,
      draft_id: draftId,
      source_proof_id: attempt.proof_id,
      run_id: attempt.run_id,
      involved_cards: attempt.involved_cards || [],
      interaction_family: attempt.interaction_family,
      generated_by: 'ollama-local-draft',
      reviewed_by: null,
      deterministic_check_results: { deterministic_validation_bypassed: false, accepted_or_promoted: false },
      created_at: created,
      updated_at: created,
    };
    try {
      const draft = validateLlmProofDraft(await client.generateJson(llmDraftPrompt(attempt, cardsByName), LLM_PROOF_DRAFT_SCHEMA, { model: options.model }));
      const record = Object.assign({}, base, {
        status: Status.Generated,
        draft,
        confidence_or_routing_score: draft.confidence,
        failure_reason: null,
      });
      STORE.appendRecord(storeDir, 'llmDrafts', record);
      drafts.push(record);
    } catch (error) {
      const record = Object.assign({}, base, {
        status: Status.Rejected,
        draft: null,
        raw_output: error && error.rawResponse ? error.rawResponse : null,
        failure_reason: error.message || String(error),
      });
      STORE.appendRecord(storeDir, 'llmDrafts', record);
      drafts.push(record);
    }
  }
  STORE.appendRecord(storeDir, 'engineRuns', {
    schemaVersion: PROOF_REVIEW_SCHEMA_VERSION,
    run_id: hashId('run', ['draft-proofs', now(), attempts.map(item => item.proof_id)]),
    command: 'draft-proofs',
    status: Status.Generated,
    generated_by: 'mtg-proofs draft-proofs',
    summary: { requested: attempts.length, generated: drafts.filter(item => item.status === Status.Generated).length, rejected: drafts.filter(item => item.status === Status.Rejected).length },
    created_at: now(),
    updated_at: now(),
  });
  return {
    drafted: drafts.length,
    generated: drafts.filter(item => item.status === Status.Generated).length,
    rejected: drafts.filter(item => item.status === Status.Rejected).length,
    failure_reasons: drafts.filter(item => item.status === Status.Rejected).map(item => item.failure_reason),
    drafts,
  };
}

function promoteTests(storeDir = STORE.DEFAULT_PROOF_REVIEW_DIR, options = {}) {
  STORE.initializeStore(storeDir);
  const outDir = options.fixtureDir || path.resolve(__dirname, '..', 'test', 'fixtures', 'proof-review');
  fs.mkdirSync(outDir, { recursive: true });
  const cards = latestCardsByName(storeDir);
  const promotable = latestAttempts(storeDir).filter(attempt => [Status.Accepted, Status.DeterministicallyProven].includes(attempt.status));
  const promoted = [];
  for (const attempt of promotable) {
    const fixture = {
      schemaVersion: 'proof-review-golden.v1',
      proof_id: attempt.proof_id,
      cards: attempt.involved_cards || [],
      oracle_text_snapshot: Object.fromEntries((attempt.involved_cards || []).map(name => [name, cards.get(name)?.oracle_text || ''])),
      expected_interaction_family: attempt.interaction_family,
      expected_synergy_class: attempt.synergy_class,
      expected_rules_concepts: attempt.rules_concepts || [],
      expected_resulting_advantage: attempt.resulting_advantage || [],
      expected_minimal_action_sequence: attempt.action_sequence || [],
      source_status: attempt.status,
    };
    const file = path.join(outDir, attempt.proof_id + '.json');
    fs.writeFileSync(file, JSON.stringify(fixture, null, 2) + '\n');
    STORE.appendRecord(storeDir, 'goldenTests', Object.assign({ fixture_path: file, status: Status.PromotedToTest, created_at: now(), updated_at: now() }, fixture));
    STORE.appendStatusUpdate(storeDir, 'proofAttempts', 'proof_id', attempt.proof_id, { status: Status.PromotedToTest });
    promoted.push(file);
  }
  return { promoted: promoted.length, files: promoted };
}

module.exports = {
  DEFAULT_SAMPLE_NAMES,
  PROOF_REVIEW_SCHEMA_VERSION,
  REVIEW_EXPORT_SCHEMA_VERSION,
  LLM_DRAFT_SCHEMA_VERSION,
  LLM_PROOF_DRAFT_SCHEMA,
  Status,
  SynergyClass,
  createSample,
  draftProofs,
  exportReview,
  importReview,
  promoteTests,
  reviewInstructions,
  runDeterministic,
  validateLlmProofDraft,
  validateReviewRow,
};
