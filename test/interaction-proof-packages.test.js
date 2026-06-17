const assert = require('node:assert/strict');
const {
  PROOF_PACKAGE_SCHEMA_FIELDS,
  PROOF_PACKAGE_SCHEMA_VERSION,
  buildInteractionProofPackages,
  seedCandidates,
} = require('../src/interaction-proof-packages');
const { buildInteractionIndexes } = require('../src/interaction-indexes');

const fixtures = [
  { id: 'Self Untap Dork', type_line: 'Creature — Elf Druid', oracle_text: '{T}: Add {G}{G}. {0}: Untap this creature.', cmc: 2 },
  { id: 'Deadeye Navigator', type_line: 'Creature — Spirit', oracle_text: '{1}{U}: Exile another target creature you control, then return it to the battlefield under your control.', cmc: 6 },
  { id: 'Peregrine Drake', type_line: 'Creature — Drake', oracle_text: 'Flying When this creature enters, untap up to five lands.', cmc: 5 },
  { id: 'Sanguine Bond', type_line: 'Enchantment', oracle_text: 'Whenever you gain life, target opponent loses that much life.', cmc: 5 },
  { id: 'Exquisite Blood', type_line: 'Enchantment', oracle_text: 'Whenever an opponent loses life, you gain that much life.', cmc: 5 },
  { id: 'Self Top Draw Artifact', type_line: 'Artifact', oracle_text: '{1}: Draw a card, then put this artifact on top of its owner’s library.', cmc: 1 },
  { id: 'Artifact Spell Reducer', type_line: 'Artifact Creature — Vedalken Artificer', oracle_text: 'Artifact spells you cast cost {1} less to cast.', cmc: 2 },
  { id: 'Artifact Top Caster', type_line: 'Artifact', oracle_text: 'You may look at the top card of your library any time. You may cast artifact spells from the top of your library.', cmc: 4 },
  { id: 'Token Source', type_line: 'Creature', oracle_text: 'When this creature enters, create a 1/1 white Soldier creature token.', cmc: 2 },
  { id: 'Token Doubler', type_line: 'Enchantment', oracle_text: 'If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead.', cmc: 4 },
  { id: 'Token Payoff', type_line: 'Creature', oracle_text: 'Whenever one or more tokens you control enter, draw a card.', cmc: 3 },
  { id: 'Ephemerate', type_line: 'Instant', oracle_text: 'Exile target creature you control, then return it to the battlefield under its owner’s control.', cmc: 1 },
];

const indexes = buildInteractionIndexes(fixtures);
const seeded = seedCandidates(indexes, { perCardTripleLimit: 8 });
assert.ok(seeded.some(candidate => candidate.cards.length === 1 && candidate.cards.includes('Self Untap Dork')));
assert.ok(seeded.some(candidate => candidate.cards.join('|') === 'Deadeye Navigator|Peregrine Drake'));
assert.ok(seeded.some(candidate => candidate.cards.includes('Artifact Top Caster') && candidate.cards.includes('Artifact Spell Reducer') && candidate.cards.includes('Self Top Draw Artifact')));

const packages = buildInteractionProofPackages(fixtures);
const byFamily = new Map(packages.map(pkg => [pkg.family, pkg]));

assert.ok(byFamily.has('self-untap-mana-loop'));
assert.ok(byFamily.has('blink-etb-land-untap-loop'));
assert.ok(byFamily.has('lifegain-lifeloss-loop'));
assert.ok(byFamily.has('artifact-top-cost-reduction-loop'));
assert.ok(byFamily.has('token-source-modifier-payoff'));
assert.equal(packages.some(pkg => pkg.cards.includes('Ephemerate')), false, 'one-shot blink should not surface as a proven package');

const artifactLoop = byFamily.get('artifact-top-cost-reduction-loop');
assert.equal(artifactLoop.schemaVersion, PROOF_PACKAGE_SCHEMA_VERSION);
for (const field of PROOF_PACKAGE_SCHEMA_FIELDS) assert.ok(field in artifactLoop, `missing proof package schema field ${field}`);
assert.equal(artifactLoop.cardCount, 3);
assert.equal(artifactLoop.confidence, 'pattern');
assert.equal(artifactLoop.strength, 'combo-critical');
assert.ok(artifactLoop.result.includes('cards') || artifactLoop.result.includes('draw'));
assert.ok(artifactLoop.assumptions.length >= 1);
assert.ok(artifactLoop.limitingClauses.some(clause => /bounded interpreter/.test(clause)));
assert.ok(artifactLoop.sequence.length >= 3);
assert.deepEqual(artifactLoop.cards, ['Artifact Spell Reducer', 'Artifact Top Caster', 'Self Top Draw Artifact']);
assert.ok(artifactLoop.contributions.every(contribution => contribution.card && contribution.role && contribution.facts.length));
assert.ok(artifactLoop.evidence.every(item => item.card && item.text));
assert.ok(artifactLoop.hyperedgeIds[0].startsWith('hyper:artifact-top-cost-reduction-loop'));

const lifeLoop = byFamily.get('lifegain-lifeloss-loop');
assert.equal(lifeLoop.cardCount, 2);
assert.equal(lifeLoop.result.includes('opponentLife'), true);
assert.equal(JSON.stringify(lifeLoop).includes('null'), false, 'proof packages should be JSON-safe and avoid Infinity becoming null');

const limited = buildInteractionProofPackages(fixtures, { maxProofPackages: 2 });
assert.equal(limited.length, 2);

process.stdout.write('Interaction proof package tests passed\n');
