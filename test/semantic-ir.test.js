const assert = require('node:assert/strict');
const MODEL = require('../src/interaction-model');

function classify(id, type, text, cmc = 0) {
  const classified = MODEL.classify({ type_line: type, oracle_text: text, cmc });
  classified.id = id;
  return classified;
}

function facts(card, kind, selector = {}) {
  return card.ir.facts.filter(fact => {
    if (fact.kind !== kind) return false;
    for (const [key, value] of Object.entries(selector)) {
      if (fact[key] !== value) return false;
    }
    return true;
  });
}

function assertFact(card, kind, selector) {
  const hits = facts(card, kind, selector);
  assert.ok(hits.length, `${card.id} should have ${kind} fact ${JSON.stringify(selector)}; facts=${card.ir.facts.map(f => f.id).join(', ')}`);
  return hits[0];
}

function assertEvidence(fact) {
  assert.ok(['exact', 'pattern', 'heuristic', 'unknown'].includes(fact.confidence), `invalid confidence ${fact.confidence}`);
  assert.ok(Array.isArray(fact.evidence), 'fact evidence should be an array');
  assert.ok(fact.evidence.length > 0, `expected evidence for ${fact.id}`);
  assert.ok(fact.evidence.every(ev => ev.source && ev.snippet !== undefined), `malformed evidence for ${fact.id}`);
}

assert.deepEqual(Object.keys(MODEL.ONTOLOGY.factKinds).sort(), [
  'ability',
  'capability',
  'classification.fallback',
  'event.consumes',
  'event.produces',
  'role',
  'type.creature-subtype',
  'type.tribal-reference',
  'zone.reference',
].sort());
assert.ok(MODEL.ONTOLOGY.familyKinds.enablement);
assert.ok(MODEL.ONTOLOGY.confidence.exact);

const solRing = classify('Sol Ring', 'Artifact', '{T}: Add {C}{C}.', 1);
assert.equal(solRing.ir.version, 'semantic-ir.v1');
assert.equal(Object.keys(solRing).includes('ir'), false, 'semantic IR should be lazy/non-enumerable for graph compatibility');
assert.equal(solRing.ir.abilities[0].kind, 'activated');
assert.equal(solRing.ir.abilities[0].confidence, 'exact');
assertEvidence(assertFact(solRing, 'event.produces', { event: 'mana' }));
assert.equal(assertFact(solRing, 'capability', { predicate: 'taps-for-mana' }).confidence, 'exact');
assert.equal(assertFact(solRing, 'capability', { predicate: 'mana-produced' }).value, '2');

const soulWarden = classify(
  'Soul Warden',
  'Creature — Human Cleric',
  'Whenever another creature enters, you gain 1 life.',
);
assert.ok(soulWarden.ir.abilities.some(ability => ability.kind === 'etb'));
assertEvidence(assertFact(soulWarden, 'event.produces', { event: 'lifegain' }));
assert.equal(assertFact(soulWarden, 'capability', { predicate: 'has-trigger' }).confidence, 'exact');

const anointedProcession = classify(
  'Anointed Procession',
  'Enchantment',
  'If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead.',
);
assert.equal(anointedProcession.ir.abilities[0].kind, 'static');
assertEvidence(assertFact(anointedProcession, 'capability', { predicate: 'is-token-doubler' }));
assertEvidence(assertFact(anointedProcession, 'event.consumes', { event: 'tokens' }));

const raiseTheAlarm = classify(
  'Raise the Alarm',
  'Instant',
  'Create two 1/1 white Soldier creature tokens.',
);
assertEvidence(assertFact(raiseTheAlarm, 'event.produces', { event: 'tokens' }));
assertEvidence(assertFact(raiseTheAlarm, 'capability', { predicate: 'is-creature-token-producer' }));

const heartstone = classify(
  'Heartstone',
  'Artifact',
  "Activated abilities of creatures cost {1} less to activate. This effect can't reduce the mana in that cost to less than one mana.",
);
assertEvidence(assertFact(heartstone, 'capability', { predicate: 'is-creature-ability-cost-reducer' }));

const deadeye = classify(
  'Deadeye Navigator',
  'Creature — Spirit',
  '{1}{U}: Exile another target creature you control, then return it to the battlefield under your control.',
);
assert.equal(deadeye.ir.abilities[0].kind, 'activated');
assert.equal(assertFact(deadeye, 'capability', { predicate: 'blink-cost' }).value, '2');
assertEvidence(assertFact(deadeye, 'capability', { predicate: 'is-repeatable-blink' }));
assertEvidence(assertFact(deadeye, 'event.produces', { event: 'blink' }));

const peregrine = classify(
  'Peregrine Drake',
  'Creature — Drake',
  'Flying When this creature enters, untap up to five lands.',
);
assert.ok(peregrine.ir.abilities.some(ability => ability.kind === 'etb'));
assert.equal(assertFact(peregrine, 'capability', { raw: 'etb-untaps-land:5' }).value, '5');
assertEvidence(assertFact(peregrine, 'event.produces', { event: 'untap' }));

const enablementCaps = new Set();
for (const rule of MODEL.ENABLEMENT) {
  for (const cap of [rule.from, rule.to, rule.manaLoop].filter(Boolean)) enablementCaps.add(cap);
}
for (const cap of [...enablementCaps].sort()) {
  const ir = MODEL.semanticIR({ type_line: 'Artifact', oracle_text: '' }, {
    produces: {},
    consumes: {},
    caps: [cap],
    zones: [],
    myTypes: [],
    tribalRefs: [],
    role: 'utility',
    segments: [],
  });
  assert.ok(ir.facts.some(fact => fact.kind === 'capability' && fact.raw === cap), `ENABLEMENT cap ${cap} should map to a typed capability fact`);
  assert.ok(MODEL.typedPredicateForCap(cap).predicate, `ENABLEMENT cap ${cap} should map to a typed predicate`);
}

process.stdout.write('Semantic IR tests passed\n');
