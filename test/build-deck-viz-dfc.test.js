const assert = require('node:assert/strict');
const { build, candidateIndex } = require('../src/build-deck-viz');

const urabrask = {
  id: 'urabrask-print',
  oracle_id: 'urabrask-oracle',
  name: 'Urabrask // The Great Work',
  layout: 'transform',
  type_line: 'Legendary Creature — Phyrexian Praetor // Enchantment — Saga',
  cmc: 4,
  edhrec_rank: 100,
  color_identity: ['R'],
  legalities: { commander: 'legal' },
  card_faces: [
    {
      name: 'Urabrask',
      mana_cost: '{2}{R}{R}',
      type_line: 'Legendary Creature — Phyrexian Praetor',
      oracle_text: 'First strike. Whenever you cast an instant or sorcery spell, add {R}.',
    },
    {
      name: 'The Great Work',
      mana_cost: '',
      type_line: 'Enchantment — Saga',
      oracle_text: 'III — Exile the top cards of your library. You may play them this turn.',
    },
  ],
};

const graph = build([{ qty: 2, name: 'The Great Work' }], {
  'urabrask // the great work': urabrask,
});

const node = graph.nodes.find(item => item.id === 'Urabrask // The Great Work');
assert.ok(node, 'back-face decklist alias resolves to canonical physical card');
assert.equal(node.qty, 2);
assert.equal(node.layout, 'transform');
assert.deepEqual(node.aliases, ['the great work', 'urabrask', 'urabrask // the great work']);
assert.equal(node.faces.length, 2);
assert.equal(node.faceFacts.length, 2);
assert.equal(node.faceFacts[0].name, 'Urabrask');
assert.equal(node.factSources.caps['is-enchantment'][0].faceName, 'The Great Work');
assert.ok(node.faceCompatibilityWarnings.some(warning => warning.kind === 'exclusive-face-aggregate'));
assert.match(node.text, /First strike.*\/\/.*Exile the top cards/);
assert.equal(node.mana, '{2}{R}{R}');
assert.deepEqual(graph.missing, []);

const aliasGraph = build([
  { qty: 1, name: 'Urabrask' },
  { qty: 2, name: 'The Great Work' },
], {
  'urabrask // the great work': urabrask,
});
const aliasNodes = aliasGraph.nodes.filter(item => item.id === 'Urabrask // The Great Work');
assert.equal(aliasNodes.length, 1, 'front/back aliases merge into one physical graph node');
assert.equal(aliasNodes[0].qty, 3, 'alias quantities are summed onto the physical card');
assert.equal(aliasGraph.edges.some(edge => edge.source === edge.target), false, 'alias merging must not create self-edges');

const candidates = candidateIndex({ urabrask });
assert.equal(candidates.length, 1);
assert.equal(candidates[0].name, 'Urabrask // The Great Work');
assert.equal(candidates[0].layout, 'transform');
assert.equal(candidates[0].faces.length, 2);
assert.match(candidates[0].text, /First strike.*\/\/.*Exile the top cards/);
assert.equal(candidates[0].mana, '{2}{R}{R}');

const tokenDfc = {
  name: 'Call the Squad // Quiet Barracks',
  layout: 'modal_dfc',
  type_line: 'Sorcery // Land',
  cmc: 3,
  color_identity: ['W'],
  card_faces: [
    {
      name: 'Call the Squad',
      mana_cost: '{2}{W}',
      type_line: 'Sorcery',
      oracle_text: 'Create two 1/1 white Soldier creature tokens.',
    },
    {
      name: 'Quiet Barracks',
      mana_cost: '',
      type_line: 'Land',
      oracle_text: 'This land enters tapped. {T}: Add {W}.',
    },
  ],
};
const tokenPayoff = {
  name: 'Token Chronicler',
  type_line: 'Creature — Human',
  mana_cost: '{2}{W}',
  oracle_text: 'Whenever one or more tokens you control enter, draw a card.',
  cmc: 3,
  color_identity: ['W'],
};
const tokenGraph = build([
  { qty: 1, name: 'Quiet Barracks' },
  { qty: 1, name: 'Token Chronicler' },
], {
  'call the squad // quiet barracks': tokenDfc,
  'token chronicler': tokenPayoff,
});
const tokenNode = tokenGraph.nodes.find(item => item.id === 'Call the Squad // Quiet Barracks');
assert.ok(tokenNode);
assert.equal(tokenNode.factSources.produces.tokens[0].faceName, 'Call the Squad');
const tokenEdge = tokenGraph.edges.find(edge => edge.source === 'Call the Squad // Quiet Barracks' || edge.target === 'Call the Squad // Quiet Barracks');
assert.ok(tokenEdge);
assert.ok(tokenEdge.interactions.some(interaction => interaction.event === 'tokens' && interaction.sourceFace?.name === 'Call the Squad'));

const blackRecursiveCastBody = {
  name: 'Black Recursive Cast Body',
  type_line: 'Creature — Zombie',
  mana_cost: '{B}',
  oracle_text: 'You may cast this card from your graveyard.',
  cmc: 1,
  color_identity: ['B'],
};
const colorlessSacOutlet = {
  name: 'Colorless One Mana Sac Outlet',
  type_line: 'Artifact',
  mana_cost: '{1}',
  oracle_text: 'Sacrifice a creature: Add {C}.',
  cmc: 1,
  color_identity: [],
};
const recursiveGraph = build([
  { qty: 1, name: 'Black Recursive Cast Body' },
  { qty: 1, name: 'Colorless One Mana Sac Outlet' },
], {
  'black recursive cast body': blackRecursiveCastBody,
  'colorless one mana sac outlet': colorlessSacOutlet,
});
const recursiveNode = recursiveGraph.nodes.find(item => item.id === 'Black Recursive Cast Body');
assert.ok(recursiveNode.caps.includes('recursive-body-color-b:1'), 'face-aware aggregate classification preserves mana_cost colored requirements');
assert.equal(
  recursiveGraph.interactionProofs.some(pkg => pkg.family === 'recursive-body-sacrifice-mana-loop'),
  false,
  'colorless package mana must not prove a black recursive cast-body loop',
);

const faceCrossingRecursiveDfc = {
  name: 'Recursive Front // Graveyard Back',
  layout: 'modal_dfc',
  type_line: 'Creature — Zombie // Sorcery',
  cmc: 1,
  color_identity: ['B'],
  card_faces: [
    {
      name: 'Recursive Front',
      mana_cost: '{B}',
      type_line: 'Creature — Zombie',
      oracle_text: 'A plain creature face with no graveyard permission.',
    },
    {
      name: 'Graveyard Back',
      mana_cost: '{B}',
      type_line: 'Sorcery',
      oracle_text: 'You may cast this card from your graveyard.',
    },
  ],
};
const faceCrossingGraph = build([
  { qty: 1, name: 'Recursive Front' },
  { qty: 1, name: 'Mana Sac Outlet' },
], {
  'recursive front // graveyard back': faceCrossingRecursiveDfc,
  'mana sac outlet': {
    name: 'Mana Sac Outlet',
    type_line: 'Artifact',
    mana_cost: '{3}',
    oracle_text: 'Sacrifice a creature: Add one mana of any color.',
    cmc: 3,
    color_identity: [],
  },
});
const faceCrossingNode = faceCrossingGraph.nodes.find(item => item.id === 'Recursive Front // Graveyard Back');
assert.ok(faceCrossingNode.caps.includes('is-recursive-body'), 'aggregate compatibility cap remains visible for UI/backcompat');
assert.equal(
  faceCrossingGraph.interactionProofs.some(pkg => pkg.family === 'recursive-body-sacrifice-mana-loop'),
  false,
  'merged aggregate facts across mutually exclusive faces must not prove a recursive-body combo',
);

const hastyCopyEngine = {
  name: 'Hasty Copy Engine',
  type_line: 'Legendary Creature — Goblin Shaman',
  oracle_text: "{T}: Create a token that's a copy of target nonlegendary creature you control, except it has haste.",
  cmc: 5,
};
const faceCrossingUntapperDfc = {
  name: 'Artifact Untapper // Vanilla Creature',
  layout: 'modal_dfc',
  type_line: 'Artifact // Creature',
  cmc: 3,
  card_faces: [
    {
      name: 'Artifact Untapper',
      type_line: 'Artifact',
      oracle_text: 'When this artifact enters, gain control of target permanent until end of turn. Untap that permanent. It gains haste until end of turn.',
    },
    {
      name: 'Vanilla Creature',
      type_line: 'Creature — Human',
      oracle_text: 'A plain creature face with no triggered abilities.',
    },
  ],
};
const faceCrossingCopyGraph = build([
  { qty: 1, name: 'Hasty Copy Engine' },
  { qty: 1, name: 'Artifact Untapper' },
], {
  'hasty copy engine': hastyCopyEngine,
  'artifact untapper // vanilla creature': faceCrossingUntapperDfc,
});
assert.equal(
  faceCrossingCopyGraph.edges.some(edge => (edge.interactions || []).some(interaction => interaction.family === 'hasty-copy→etb-untap-loop')),
  false,
  'DFC creature type on one face must not make an artifact-face ETB untapper a legal hasty-copy target',
);
assert.equal(
  faceCrossingCopyGraph.interactionProofs.some(pkg => pkg.family === 'hasty-copy→etb-untap-loop'),
  false,
  'face-crossing DFC copy target legality must not prove hasty-copy ETB untap loops',
);

const hastyCreatureCopySpell = {
  name: 'Hasty Creature Copy Spell',
  type_line: 'Sorcery',
  oracle_text: "Choose target creature you control. Create a token that's a copy of that creature, except it has haste. Exile it at the beginning of the next end step.",
  cmc: 2,
};
const faceCrossingSpellCopierDfc = {
  name: 'Artifact Spell Copier // Vanilla Creature',
  layout: 'modal_dfc',
  type_line: 'Artifact // Creature',
  cmc: 3,
  card_faces: [
    {
      name: 'Artifact Spell Copier',
      type_line: 'Artifact',
      oracle_text: 'When this artifact enters, copy target instant or sorcery spell. You may choose new targets for the copy.',
    },
    {
      name: 'Vanilla Creature',
      type_line: 'Creature — Human',
      oracle_text: 'A plain creature face with no triggered abilities.',
    },
  ],
};
const faceCrossingSpellCopyGraph = build([
  { qty: 1, name: 'Artifact Spell Copier' },
  { qty: 1, name: 'Hasty Creature Copy Spell' },
], {
  'artifact spell copier // vanilla creature': faceCrossingSpellCopierDfc,
  'hasty creature copy spell': hastyCreatureCopySpell,
});
assert.equal(
  faceCrossingSpellCopyGraph.edges.some(edge => (edge.interactions || []).some(interaction => interaction.family === 'spell-copy-etb→creature-copy-spell-loop')),
  false,
  'DFC creature type on one face must not make an artifact-face spell copier a legal creature-copy target',
);
assert.equal(
  faceCrossingSpellCopyGraph.interactionProofs.some(pkg => pkg.family === 'spell-copy-etb→creature-copy-spell-loop'),
  false,
  'face-crossing DFC copy target legality must not prove spell-copy creature-copy loops',
);

const etbCreatureBlinker = {
  name: 'ETB Creature Blinker',
  type_line: 'Creature — Angel',
  oracle_text: 'When this creature enters the battlefield, exile another target creature you control, then return that card to the battlefield under its owner’s control.',
  cmc: 5,
};
const faceCrossingBlinkerDfc = {
  name: 'Artifact Blinker // Vanilla Creature',
  layout: 'modal_dfc',
  type_line: 'Artifact // Creature',
  cmc: 4,
  card_faces: [
    {
      name: 'Artifact Blinker',
      type_line: 'Artifact',
      oracle_text: 'When this artifact enters the battlefield, exile another target creature you control, then return that card to the battlefield under its owner’s control.',
    },
    {
      name: 'Vanilla Creature',
      type_line: 'Creature — Human',
      oracle_text: 'A plain creature face with no triggered abilities.',
    },
  ],
};
const faceCrossingBlinkGraph = build([
  { qty: 1, name: 'ETB Creature Blinker' },
  { qty: 1, name: 'Artifact Blinker' },
], {
  'etb creature blinker': etbCreatureBlinker,
  'artifact blinker // vanilla creature': faceCrossingBlinkerDfc,
});
assert.equal(
  faceCrossingBlinkGraph.edges.some(edge => (edge.interactions || []).some(interaction => interaction.family === 'mutual-etb-blink-reset-loop')),
  false,
  'DFC creature type on one face must not make an artifact-face ETB blinker a legal creature blink target',
);
assert.equal(
  faceCrossingBlinkGraph.interactionProofs.some(pkg => pkg.family === 'mutual-etb-blink-reset-loop'),
  false,
  'face-crossing DFC ETB blink target legality must not prove mutual blink loops',
);

const conditionalRecursiveBody = {
  name: 'Conditional Recursive Body',
  type_line: 'Creature — Zombie',
  mana_cost: '{B}',
  oracle_text: 'You may cast this card from your graveyard as long as you control another creature.',
  cmc: 1,
  color_identity: ['B'],
};
const faceCrossingCreatureOutletDfc = {
  name: 'Artifact Outlet // Vanilla Creature',
  layout: 'modal_dfc',
  type_line: 'Artifact // Creature',
  cmc: 3,
  card_faces: [
    {
      name: 'Artifact Outlet',
      type_line: 'Artifact',
      oracle_text: 'Sacrifice a creature: Add one mana of any color.',
    },
    {
      name: 'Vanilla Creature',
      type_line: 'Creature — Human',
      oracle_text: 'A plain creature face with no sacrifice ability.',
    },
  ],
};
const faceCrossingRecursivePreconditionGraph = build([
  { qty: 1, name: 'Conditional Recursive Body' },
  { qty: 1, name: 'Artifact Outlet' },
], {
  'conditional recursive body': conditionalRecursiveBody,
  'artifact outlet // vanilla creature': faceCrossingCreatureOutletDfc,
});
assert.equal(
  faceCrossingRecursivePreconditionGraph.edges.some(edge => (edge.interactions || []).some(interaction => interaction.family === 'recursive-body-sacrifice-mana-loop')),
  false,
  'DFC creature type on one face must not satisfy another-creature recursion while the artifact outlet face supplies mana',
);
assert.equal(
  faceCrossingRecursivePreconditionGraph.interactionProofs.some(pkg => pkg.family === 'recursive-body-sacrifice-mana-loop'),
  false,
  'face-crossing DFC recursive precondition legality must not prove recursive sacrifice loops',
);
const separateCreatureSupport = {
  name: 'Separate Creature Support',
  type_line: 'Creature — Human',
  oracle_text: 'A separate creature permanent that remains on the battlefield.',
  cmc: 2,
};
const faceCrossingRecursivePreconditionWithSupportGraph = build([
  { qty: 1, name: 'Conditional Recursive Body' },
  { qty: 1, name: 'Artifact Outlet' },
  { qty: 1, name: 'Separate Creature Support' },
], {
  'conditional recursive body': conditionalRecursiveBody,
  'artifact outlet // vanilla creature': faceCrossingCreatureOutletDfc,
  'separate creature support': separateCreatureSupport,
});
assert.equal(
  faceCrossingRecursivePreconditionWithSupportGraph.interactionProofs.some(pkg => pkg.family === 'recursive-body-sacrifice-mana-loop'),
  true,
  'separate creature support should satisfy another-creature recursion even when the DFC outlet cannot borrow its creature face',
);

process.stdout.write('Build DFC integration tests passed\n');
