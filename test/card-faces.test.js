const assert = require('node:assert/strict');
const {
  FACE_AVAILABILITY,
  cardAliases,
  cardAvailability,
  cardKey,
  canonicalCardName,
  displayManaCost,
  extractCardFaces,
  faceDataScore,
  mergedOracleText,
  mergedTypeLine,
  normalizeCardNameKey,
  physicalCardKey,
  toFaceAwareResolvedCard,
} = require('../src/card-faces');

const urabrask = {
  id: 'print-urabrask',
  oracle_id: 'oracle-urabrask',
  name: 'Urabrask // The Great Work',
  layout: 'transform',
  type_line: 'Legendary Creature — Phyrexian Praetor // Enchantment — Saga',
  color_identity: ['R'],
  card_faces: [
    {
      name: 'Urabrask',
      mana_cost: '{2}{R}{R}',
      type_line: 'Legendary Creature — Phyrexian Praetor',
      oracle_text: 'First strike\nWhenever you cast an instant or sorcery spell, Urabrask deals 1 damage to target opponent.',
    },
    {
      name: 'The Great Work',
      mana_cost: '',
      type_line: 'Enchantment — Saga',
      oracle_text: 'I — This Saga deals 3 damage to target opponent and each creature they control.',
    },
  ],
};

const zof = {
  id: 'print-zof',
  name: 'Zof Consumption // Zof Bloodbog',
  layout: 'modal_dfc',
  type_line: 'Sorcery // Land',
  card_faces: [
    {
      name: 'Zof Consumption',
      mana_cost: '{4}{B}{B}',
      type_line: 'Sorcery',
      oracle_text: 'Each opponent loses 4 life and you gain 4 life.',
    },
    {
      name: 'Zof Bloodbog',
      mana_cost: '',
      type_line: 'Land',
      oracle_text: 'This land enters tapped. {T}: Add {B}.',
    },
  ],
};

assert.equal(normalizeCardNameKey('  Urabrask  //   The Great Work  '), 'urabrask // the great work');
assert.equal(normalizeCardNameKey('Urabrask — The Great Work'), 'urabrask - the great work');

assert.equal(canonicalCardName(urabrask), 'Urabrask // The Great Work');
assert.equal(cardKey(urabrask), 'oracle-urabrask');
assert.equal(physicalCardKey(urabrask), 'oracle-urabrask');
assert.deepEqual(cardAliases(urabrask), ['the great work', 'urabrask', 'urabrask // the great work']);

const urabraskFaces = extractCardFaces(urabrask);
assert.equal(urabraskFaces.length, 2);
assert.equal(urabraskFaces[0].name, 'Urabrask');
assert.equal(urabraskFaces[0].availability, FACE_AVAILABILITY.TRANSFORMS);
assert.equal(urabraskFaces[1].name, 'The Great Work');
assert.equal(mergedTypeLine(urabraskFaces), 'Legendary Creature — Phyrexian Praetor // Enchantment — Saga');
assert.match(mergedOracleText(urabraskFaces), /First strike.*\/\/.*This Saga/);
assert.equal(displayManaCost(urabraskFaces), '{2}{R}{R}');

const zofFaces = extractCardFaces(zof);
assert.equal(zofFaces[0].availability, FACE_AVAILABILITY.EITHER_FACE);
assert.equal(zofFaces[1].type_line, 'Land');
assert.equal(displayManaCost(zofFaces), '{4}{B}{B}');
assert.ok(cardAliases(zof).includes('zof bloodbog'));

const solRing = {
  name: 'Sol Ring',
  layout: 'normal',
  type_line: 'Artifact',
  oracle_text: '{T}: Add {C}{C}.',
  mana_cost: '{1}',
};
const solFaces = extractCardFaces(solRing);
assert.deepEqual(solFaces, [{
  index: 0,
  name: 'Sol Ring',
  type_line: 'Artifact',
  oracle_text: '{T}: Add {C}{C}.',
  mana_cost: '{1}',
  colors: undefined,
  oracle_id: undefined,
  layout: 'normal',
  availability: FACE_AVAILABILITY.SINGLE,
}]);

assert.equal(cardAvailability('reversible_card', true), FACE_AVAILABILITY.SEPARATE_OBJECTS);
assert.equal(cardAvailability('flip', true), FACE_AVAILABILITY.SAME_OBJECT_PARTS);

const resolved = toFaceAwareResolvedCard(zof);
assert.equal(resolved.name, 'Zof Consumption // Zof Bloodbog');
assert.equal(resolved.canonicalName, 'Zof Consumption // Zof Bloodbog');
assert.equal(resolved.cardKey, 'print-zof');
assert.equal(resolved.oracle_text, 'Each opponent loses 4 life and you gain 4 life. // This land enters tapped. {T}: Add {B}.');
assert.equal(resolved.mana_cost, '{4}{B}{B}');
assert.equal(resolved.faces.length, 2);
assert.equal(resolved.card_faces[1].name, 'Zof Bloodbog');
assert.ok(faceDataScore(resolved) > faceDataScore(solRing));

process.stdout.write('Card face helper tests passed\n');
