const assert = require('node:assert/strict');
const {
  classifyResultLabels,
  classifyResultLabelsDetailed,
  classesForEdgeFamilies,
  classesForProofDeltas,
  evaluateCombo,
  resultCoverage,
  summarizeEvaluations,
  renderMarkdown,
} = require('../analysis/edhrec-combos/evaluate-edhrec-combos');

function card(name, typeLine, oracleText, cmc = 1, mana_cost = '') {
  return { name, type_line: typeLine, oracle_text: oracleText, cmc, mana_cost, legalities: { commander: 'legal' } };
}

const idx = {
  'gain from loss': card('Gain From Loss', 'Enchantment', 'Whenever an opponent loses life, you gain that much life.', 5),
  'loss from gain': card('Loss From Gain', 'Enchantment', 'Whenever you gain life, target opponent loses that much life.', 5),
  'fixed loss from gain': card('Fixed Loss From Gain', 'Creature — Cleric', 'Whenever you gain life, each opponent loses 1 life.', 3),
  'blank rock': card('Blank Rock', 'Artifact', '{T}: Add {C}.', 2),
  'draw damage engine': card('Draw Damage Engine', 'Legendary Creature — Wizard', 'Whenever you draw a card, this creature deals 1 damage to any target.', 6),
  'damage draw aura': card('Damage Draw Aura', 'Enchantment — Aura', 'Enchant creature\nWhenever enchanted creature deals damage to an opponent, you may draw a card.', 1),
  'paired creature damage draw': card('Paired Creature Damage Draw', 'Creature — Human Scout', 'Soulbond. As long as this creature is paired with another creature, each of those creatures has "Whenever this creature deals damage to an opponent, draw a card."', 3),
  'self-copying targeted spell': card('Self-Copying Targeted Spell', 'Sorcery', 'Target player discards two cards. That player may copy this spell and may choose a new target for that copy.', 2),
  'magecraft drain payoff': card('Magecraft Drain Payoff', 'Creature — Human Druid', 'Magecraft — Whenever you cast or copy an instant or sorcery spell, each opponent loses 1 life and you gain 1 life.', 2),
  'magecraft token payoff': card('Magecraft Token Payoff', 'Creature — Human Wizard', 'Magecraft — Whenever you cast or copy an instant or sorcery spell, create a 1/1 creature token.', 2),
  'lifelink counter engine': card('Lifelink Counter Engine', 'Enchantment Creature — God', 'Whenever you gain life, put a +1/+1 counter on target creature or enchantment you control. {1}{W}: Another target creature gains lifelink until end of turn.', 3),
  'counter damage creature': card('Counter Damage Creature', 'Artifact Creature — Construct', 'This creature enters with X +1/+1 counters on it. Remove a +1/+1 counter from this creature: It deals 1 damage to any target.', 0),
  'life-paid damage source': card('Life-Paid Damage Source', 'Artifact', 'Pay 50 life: This artifact deals 50 damage to any target.', 4),
  'tapped life-paid damage source': card('Tapped Life-Paid Damage Source', 'Artifact', '{T}, Pay 50 life: This artifact deals 50 damage to any target.', 4),
  'opponent loss lifegain payoff': card('Opponent Loss Lifegain Payoff', 'Enchantment', 'Whenever an opponent loses life, you gain that much life.', 5),
  'counter token engine': card('Counter Token Engine', 'Creature — Plant', 'Whenever one or more +1/+1 counters are put on this creature, create a 1/1 green Saproling creature token.', 3),
  'green etb counter granter': card('Green ETB Counter Granter', 'Creature — Elf', 'Whenever another green creature you control enters, put a +1/+1 counter on target creature.', 4),
  'colorless counter token engine': card('Colorless Counter Token Engine', 'Creature — Eldrazi', 'Whenever one or more +1/+1 counters are put on this creature, create a 0/1 colorless Eldrazi Spawn creature token.', 2),
  'minus counter death spreader': card('Minus Counter Death Spreader', 'Enchantment', 'Whenever a creature dies, if it had a -1/-1 counter on it, put a -1/-1 counter on target creature.', 3),
  'minus counter token engine': card('Minus Counter Token Engine', 'Enchantment', 'Whenever you put one or more -1/-1 counters on a creature, create that many 1/1 black Insect creature tokens.', 3),
  'named counter token engine': card('Named Counter Token Engine', 'Creature — Treefolk', 'Whenever one or more +1/+1 counters are put on Named Counter Token Engine, create a 1/1 green Squirrel creature token.', 3),
  'lifegain counter payoff': card('Lifegain Counter Payoff', 'Enchantment Creature — God', 'Whenever you gain life, put a +1/+1 counter on target creature or enchantment you control.', 3),
  'creature etb lifegain payoff': card('Creature ETB Lifegain Payoff', 'Creature — Cleric', 'Whenever another creature enters the battlefield under your control, you gain 1 life.', 1),
  'once-per-turn etb lifegain payoff': card('Once-Per-Turn ETB Lifegain Payoff', 'Creature — Cleric', 'Whenever another creature enters the battlefield under your control, you gain 1 life. This ability triggers only once each turn.', 1),
  'death untap pinger': card('Death Untap Pinger', 'Creature — Goblin', "This creature doesn't untap during your untap step. Whenever a creature dies, untap this creature. {T}: This creature deals 1 damage to any target.", 3),
  'free pinger creature': card('Free Pinger Creature', 'Creature — Goblin', '{T}: This creature deals 1 damage to any target.', 1),
  'death untap creature': card('Death Untap Creature', 'Creature — Spirit', 'Whenever a creature dies, untap this creature.', 2),
  'deathtouch equipment': card('Deathtouch Equipment', 'Artifact — Equipment', 'Equipped creature has deathtouch. Equip {2}', 1),
  'free ping equipment': card('Free Ping Equipment', 'Artifact — Equipment', 'Equipped creature has "{T}: This creature deals 1 damage to any target." Equip {3}', 1),
  'death untap equipment': card('Death Untap Equipment', 'Artifact — Equipment', 'Equipped creature has "Whenever a creature dies, untap this creature." Equip {4}', 2),
  'once-per-turn death untap equipment': card('Once-Per-Turn Death Untap Equipment', 'Artifact — Equipment', 'Equipped creature has "Whenever a creature dies, untap this creature. This ability triggers only once each turn." Equip {4}', 2),
  'costed ping equipment': card('Costed Ping Equipment', 'Artifact — Equipment', 'Equipped creature has "{1}, {T}: This creature deals 1 damage to any target." Equip {2}', 1),
  'recursive body': card('Recursive Body', 'Creature — Zombie', 'You may cast this card from your graveyard.', 1, '{B}'),
  'recursive exile creature': card('Recursive Exile Creature', 'Creature — Elemental', 'You may cast this card from exile.', 3, '{2}{R}'),
  'conditional exile creature': card('Conditional Exile Creature', 'Creature — Elemental', 'You may cast this card from exile if it was foretold.', 3, '{2}{R}'),
  'creature-only exile mana outlet': card('Creature-Only Exile Mana Outlet', 'Enchantment', "Exile a creature you control: Add X mana of any one color, where X is 1 plus the exiled creature's mana value. Spend this mana only to cast creature spells.", 3),
  'mana sac outlet': card('Mana Sac Outlet', 'Artifact', 'Sacrifice a creature: Add one mana of any color.', 3),
  'colored recursive body': card('Colored Recursive Body', 'Creature — Skeleton', '{1}{B}: Return this creature from your graveyard to the battlefield.', 2),
  'colorless mana sac outlet': card('Colorless Mana Sac Outlet', 'Artifact', 'Sacrifice a creature: Add {C}{C}.', 3),
  'death mana payoff': card('Death Mana Payoff', 'Creature — Human Pirate', 'Whenever another creature you control dies, create a Treasure token.', 4),
  'hasty copy engine': card('Hasty Copy Engine', 'Legendary Creature — Goblin Shaman', "{T}: Create a token that's a copy of target nonlegendary creature you control, except it has haste.", 5),
  'permanent untapper': card('Permanent Untapper', 'Creature — Human Warrior', 'When this creature enters, gain control of target permanent until end of turn. Untap that permanent. It gains haste until end of turn.', 5),
  'etb spell copier creature': card('ETB Spell Copier Creature', 'Creature — Human Wizard', 'When this creature enters the battlefield, copy target instant or sorcery spell. You may choose new targets for the copy.', 3),
  'legendary etb spell copier creature': card('Legendary ETB Spell Copier Creature', 'Legendary Creature — Human Wizard', 'When this creature enters the battlefield, copy target instant or sorcery spell. You may choose new targets for the copy.', 3),
  'broad hasty creature copy spell': card('Broad Hasty Creature Copy Spell', 'Sorcery', "Create a token that's a copy of target creature, except it has haste. Exile it at the beginning of the next end step.", 2),
  'death-copy creature spell': card('Death-Copy Creature Spell', 'Instant', 'Destroy target creature. If that creature dies this way, its controller creates two tokens that are copies of that creature.', 3),
  'colorless mana amplifier': card('Colorless Mana Amplifier', 'Artifact', 'Whenever you tap a permanent for {C}, add an additional {C}.', 5),
  'any-type nonland mana amplifier': card('Any-Type Nonland Mana Amplifier', 'Legendary Creature — Druid', 'Whenever you tap a nonland permanent for mana, add one mana of any type that permanent produced.', 2),
  'break-even self untapper with colorless': card('Break-Even Self Untapper With Colorless', 'Artifact', '{T}: Add {C}{C}{C}. {3}: Untap this artifact.', 3),
  'generic tribe count druid': card('Generic Tribe Count Druid', 'Creature — Elf Druid', '{T}: Add {G} for each Elf you control.', 2, '{1}{G}'),
  'generic modal untap engine': card('Generic Modal Untap Engine', 'Artifact', '{1}: Untap this artifact. {3}, {T}: Untap target creature. {4}, {T}: Draw a card. {2}, {T}: You gain 1 life.', 3, '{3}'),
  'untap symbol equipment': card('Untap Symbol Equipment', 'Artifact — Equipment', 'Equipped creature has "{3}, {Q}: This creature gets +2/+2 until end of turn." Equip {0}', 3, '{3}'),
  'artifact ability cost reducer': card('Artifact Ability Cost Reducer', 'Creature — Vedalken Artificer', "Activated abilities of artifacts you control cost {1} less to activate. This effect can't reduce the mana in that cost to less than one mana.", 3),
  'combat copy equipment': card('Combat Copy Equipment', 'Legendary Artifact — Equipment', "At the beginning of combat on your turn, create a token that's a copy of equipped creature, except the token isn't legendary. That token gains haste. Equip {5}", 4),
  'first attack extra combat': card('First Attack Extra Combat', 'Legendary Creature — Angel', 'Haste. Whenever this creature attacks for the first time each turn, untap all creatures you control. After this phase, there is an additional combat phase.', 4),
  'exert extra combat': card('Exert Extra Combat', 'Creature — Human Warrior', "If this creature hasn't been exerted this turn, you may exert it as it attacks. When you do, untap all other creatures you control and after this phase, there is an additional combat phase.", 3),
  'hasty copy source': card('Hasty Copy Source', 'Legendary Creature — Goblin Shaman', "Haste. {T}: Create a token that's a copy of target nonlegendary creature you control, except it has haste. Sacrifice it at the beginning of the next end step.", 5),
  'attached self copy aura': card('Attached Self Copy Aura', 'Enchantment — Aura', 'Enchant creature\nEnchanted creature has "{T}: Create a token that’s a copy of this creature, except it has haste. Exile that token at the beginning of the next end step."', 4),
  'connect extra combat': card('Connect Extra Combat', 'Creature — Orc Pirate', "Whenever this creature deals combat damage to a player, untap each creature you control. After this phase, there is an additional combat phase. This creature can't attack a player it has already attacked this turn.", 5),
  'legendary attack extra combat': card('Legendary Attack Extra Combat', 'Legendary Creature — Angel', 'Haste. Whenever this creature attacks for the first time each turn, untap all creatures you control. After this phase, there is an additional combat phase.', 4),
  'generic precombat copy source': card('Generic Precombat Copy Source', 'Enchantment', "At the beginning of combat on your turn, create a token that's a copy of target creature you control. That token gains haste.", 4),
  'broad hasty copy source': card('Broad Hasty Copy Source', 'Artifact Creature — Shapeshifter', "{T}: Create a token that's a copy of target creature you control, except it has haste.", 5),
  'tapped artifact hasty copy source': card('Tapped Artifact Hasty Copy Source', 'Artifact', "{T}: Create a token that's a copy of target creature you control, except it has haste.", 5),
  'tapped attacking copy source': card('Tapped Attacking Copy Source', 'Artifact — Equipment', "Whenever equipped creature attacks, create a token that's a copy of equipped creature tapped and attacking. Exile it at end of combat. Equip {4}", 4),
  'restricted connect extra combat': card('Restricted Connect Extra Combat', 'Creature — Noble', 'Whenever this creature deals combat damage to a player, untap all lands you control. After this phase, there is an additional combat phase. Only land creatures can attack during that combat phase.', 5),
  'creature damage extra combat': card('Creature Damage Extra Combat', 'Creature — Orc Pirate', 'Whenever this creature deals combat damage to a creature, untap each creature you control. After this phase, there is an additional combat phase.', 5),
  'extra turn cannot attack': card('Extra Turn Cannot Attack', 'Legendary Creature — Sphinx', "Flying Whenever Extra Turn Cannot Attack deals combat damage to a player, take an extra turn after this one. Extra Turn Cannot Attack can't attack during extra turns.", 6),
  'connect extra turn': card('Connect Extra Turn', 'Creature — Sphinx', 'Flying. Whenever this creature deals combat damage to a player, take an extra turn after this one.', 6),
  'attack extra turn': card('Attack Extra Turn', 'Creature — Human Warrior', 'Whenever this creature attacks, take an extra turn after this one.', 4),
  'optional sacrifice extra turn': card('Optional Sacrifice Extra Turn', 'Creature — Merfolk Wizard', 'Whenever this creature deals combat damage to a player, you may sacrifice a Merfolk. If you do, take an extra turn after this one.', 4),
  'vanilla attacker': card('Vanilla Attacker', 'Creature — Human Warrior', 'Haste.', 2),
  'combat sacrifice aura': card('Combat Sacrifice Aura', 'Enchantment — Aura', 'Enchant creature\nWhenever enchanted creature deals combat damage to a player, sacrifice that creature and attach this Aura to another target creature you control. Untap all creatures you control. After this phase, there is an additional combat phase.', 3),
  'breath-shaped aura': card('Breath-Shaped Aura', 'Enchantment — Aura', 'Enchant creature\nWhenever enchanted creature deals combat damage to a player, sacrifice it and attach Breath-Shaped Aura to a creature you control. If you do, untap all creatures you control and after this phase, there is an additional combat phase.', 3),
  'fresh combat carrier source': card('Fresh Combat Carrier Source', 'Creature — Human Warrior', 'At the beginning of combat on your turn, create a 1/1 red Warrior creature token with haste. It attacks this combat if able.', 3),
  'stale carrier source': card('Stale Carrier Source', 'Creature — Human Soldier', 'At the beginning of combat on your turn, create a 1/1 white Soldier creature token.', 2),
  'first combat only carrier source': card('First Combat Only Carrier Source', 'Creature — Human Warrior', 'At the beginning of combat on your turn, if this is the first combat phase this turn, create a 1/1 red Warrior creature token with haste. It attacks this combat if able.', 2),
  'generic extra combat activator': card('Generic Extra Combat Activator', 'Enchantment', '{3}{R}{R}: Untap all creatures you control. After this phase, there is an additional combat phase followed by an additional main phase. Activate only as a sorcery.', 3, '{3}'),
  'combat treasure equipment': card('Combat Treasure Equipment', 'Artifact — Equipment', 'Equipped creature has trample and "Whenever this creature deals combat damage to a player, create that many Treasure tokens." Equip {3}', 3, '{3}'),
  'combat land untap equipment': card('Combat Land Untap Equipment', 'Artifact — Equipment', 'Whenever equipped creature deals combat damage to a player, untap all lands you control.', 3, '{3}'),
  'attack land untap aura': card('Attack Land Untap Aura', 'Enchantment — Aura', 'Enchant creature Whenever enchanted creature attacks, untap all lands you control.', 2, '{2}'),
  'random treasure dragon': card('Random Treasure Dragon', 'Creature — Dragon', 'Whenever this creature deals combat damage to a player, roll a d20. Create a number of Treasure tokens equal to the result.', 6, '{4}{R}{R}'),
  'extra combat without untap': card('Extra Combat Without Untap', 'Enchantment', '{3}{R}{R}: After this phase, there is an additional combat phase. Activate only as a sorcery.', 3, '{3}'),
  'extra combat without main': card('Extra Combat Without Main', 'Enchantment', '{3}{R}{R}: Untap all creatures you control. After this phase, there is an additional combat phase. Activate only as a sorcery.', 3, '{3}'),
  'attack triggered extra combat': card('Attack Triggered Extra Combat', 'Creature — Dragon', 'Whenever this creature attacks, you may pay {5}{R}{R}. If you do, untap all attacking creatures and after this phase, there is an additional combat phase.', 6, '{4}{R}{R}'),
  'tapped artifact extra combat': card('Tapped Artifact Extra Combat', 'Artifact', '{3}{R}{R}, {T}: Untap all creatures you control. After this phase, there is an additional combat phase followed by an additional main phase.', 3, '{3}'),
  'upkeep artifact token engine': card('Upkeep Artifact Token Engine', 'Artifact Creature — Thopter', 'At the beginning of your upkeep, create five 1/1 colorless Thopter artifact creature tokens.', 6, '{6}'),
  'four artifact token engine': card('Four Artifact Token Engine', 'Artifact', 'At the beginning of your upkeep, create four Clue tokens.', 4, '{4}'),
  'once per turn upkeep artifact token engine': card('Once Per Turn Upkeep Artifact Token Engine', 'Artifact Creature — Thopter', 'At the beginning of your upkeep, create five 1/1 colorless Thopter artifact creature tokens. This ability triggers only once each turn.', 6, '{6}'),
  'end step artifact token engine': card('End Step Artifact Token Engine', 'Artifact', 'At the beginning of your end step, create five Treasure tokens.', 5, '{5}'),
  'artifact sacrifice extra-turn engine': card('Artifact Sacrifice Extra-Turn Engine', 'Artifact', '{T}, Sacrifice five artifacts: Take an extra turn after this one.', 2, '{2}'),
  'once per turn artifact sacrifice extra-turn engine': card('Once Per Turn Artifact Sacrifice Extra-Turn Engine', 'Artifact', '{T}, Sacrifice five artifacts: Take an extra turn after this one. Activate only once each turn.', 2, '{2}'),
  'token doubler': card('Token Doubler', 'Enchantment', 'If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead.', 4, '{4}'),
  'mill to life loss payoff': card('Mill To Life Loss Payoff', 'Enchantment', "Whenever a card is put into an opponent's graveyard from anywhere, that player loses 1 life and you gain 1 life.", 1),
  'life loss to mill payoff': card('Life Loss To Mill Payoff', 'Enchantment', 'Whenever an opponent loses life, that player mills that many cards.', 3),
  'opponent half-library draw': card('Opponent Half-Library Draw', 'Sorcery', 'Target opponent draws cards equal to half the number of cards in their library, rounded up.', 7),
  'opponent draw punisher': card('Opponent Draw Punisher', 'Enchantment', 'Whenever an opponent draws a card, that player loses 1 life.', 3),
  'half-library mill': card('Half-Library Mill', 'Sorcery', 'Target player mills half their library, rounded up.', 5),
  'mill multiplier': card('Mill Multiplier', 'Enchantment', 'If an opponent would mill one or more cards, that player mills twice that many cards instead.', 3),
  'delayed mill equalizer': card('Delayed Mill Equalizer', 'Enchantment — Aura Curse', "Enchant player At the beginning of each end step, enchanted player mills X cards, where X is the number of cards put into their graveyard from anywhere this turn.", 3),
  'etb creature blinker': card('ETB Creature Blinker', 'Creature — Angel', 'Flying When this creature enters the battlefield, exile another target creature you control, then return that card to the battlefield under its owner’s control.', 5),
  'etb permanent blinker': card('ETB Permanent Blinker', 'Creature — Cat Beast', 'When this creature enters the battlefield, exile another target permanent you control, then return that card to the battlefield under its owner’s control.', 4),
  'creature-token replacement outlet': card('Creature-Token Replacement Outlet', 'Legendary Creature — Squirrel Warrior', 'If one or more tokens would be created under your control, those tokens plus that many 1/1 green Squirrel creature tokens are created instead.\n{B}, Sacrifice X Squirrels: Target creature gets +X/-X until end of turn.', 3),
  'artifact blinker // vanilla creature': {
    name: 'Artifact Blinker // Vanilla Creature',
    layout: 'modal_dfc',
    type_line: 'Artifact // Creature',
    cmc: 4,
    legalities: { commander: 'legal' },
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
  },
  'conditional recursive body': card('Conditional Recursive Body', 'Creature — Zombie', 'You may cast this card from your graveyard as long as you control another creature.', 1, '{B}'),
  'separate creature support': card('Separate Creature Support', 'Creature — Human', 'A separate creature permanent that remains on the battlefield.', 2),
  'aristocrats token body': card('Aristocrats Token Body', 'Creature', 'When this creature enters the battlefield, create a 1/1 white Soldier creature token.', 2),
  'free creature sac outlet': card('Free Creature Sac Outlet', 'Creature', 'Sacrifice a creature: Scry 1.', 1),
  'death drain payoff': card('Death Drain Payoff', 'Creature', 'Whenever another creature you control dies, each opponent loses 1 life and you gain 1 life.', 2),
  'typed recursive cast body': card('Typed Recursive Cast Body', 'Creature — Zombie', 'You may cast this card from your graveyard as long as you control a Zombie.', 1, '{B}'),
  'life-paid treasure outlet': card('Life-Paid Treasure Outlet', 'Creature — Zombie Advisor', 'Pay 1 life, Sacrifice another creature: Create a Treasure token.', 2),
  'artifact outlet // vanilla creature': {
    name: 'Artifact Outlet // Vanilla Creature',
    layout: 'modal_dfc',
    type_line: 'Artifact // Creature',
    cmc: 3,
    legalities: { commander: 'legal' },
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
  },
};

assert.deepEqual(classifyResultLabels(['Infinite lifegain', 'Win the game', 'Exile your library']), ['empty-library', 'infinite-life', 'win']);
assert.deepEqual(classifyResultLabels(['Each opponent loses the game', 'Target player loses the game', 'Infinite self-mill', 'Infinite commander casts']), ['infinite-cast', 'mill', 'win']);
assert.deepEqual(classifyResultLabels(['Counter all spells opponents cast', "You can't be attacked", 'Opponents skip their untap steps', 'Destroy all creatures opponents control', "Players can't draw cards"]), ['lock']);
assert.deepEqual(classifyResultLabels(['Return all creature cards from your graveyard to the battlefield', 'Return all nonland permanents from your graveyard to the battlefield']), ['mass-reanimate']);
assert.deepEqual(classifyResultLabelsDetailed(['Infinite lifegain', 'Infinite LTB']), {
  classes: ['infinite-life', 'infinite-ltb'],
  unmappedLabels: [],
});
assert.deepEqual(classifyResultLabels(['Infinite landfall triggers', 'Infinite blinking', 'Infinite scry 1', 'Infinite self-discard triggers']), ['infinite-blink', 'infinite-landfall', 'infinite-scry', 'infinite-self-discard']);
assert.deepEqual(resultCoverage(['infinite-life', 'win'], ['infinite-life']).missed, ['win']);
assert.deepEqual(classesForEdgeFamilies(['sac-fodder→outlet', 'landfall', 'unknown-family']), ['infinite-death', 'infinite-etb', 'infinite-landfall', 'infinite-ltb', 'infinite-sacrifice', 'infinite-tokens']);
assert.deepEqual(classesForEdgeFamilies(['graveyard']), ['mill'], 'generic graveyard evidence must not imply self-discard without a discard edge');
assert.deepEqual(classesForEdgeFamilies(['discard']), ['infinite-self-discard']);
assert.deepEqual(classesForEdgeFamilies(['exile-recast-creature-mana-loop']), ['infinite-cast', 'infinite-etb', 'infinite-ltb'], 'exile-recast edge signals must not claim mana without proof deltas');
assert.deepEqual(classesForEdgeFamilies(['combat-resource→extra-combat-loop']), [], 'combat-resource candidates need strict proof before they explain combat results');
assert.deepEqual(classesForEdgeFamilies(['combat-copy-token→extra-combat-loop', 'hasty-copy→attack-extra-combat-loop', 'combat-copy-token→connect-extra-combat-loop', 'hasty-copy→connect-extra-combat-loop']), [], 'fresh-copy combat loops need strict proof before they explain combat results');
assert.deepEqual(classesForEdgeFamilies(['combat-sacrifice-aura→extra-combat-loop']), [], 'combat-sacrifice Aura loops must require strict proof before covering combat results');
assert.deepEqual(classesForProofDeltas([
  { family: 'blink-etb-land-untap-loop', positiveDeltas: [{ resource: 'mana', min: 0, max: 0 }] },
]), []);
assert.deepEqual(classesForProofDeltas([
  { family: 'recursive-body-sacrifice-mana-loop', positiveDeltas: [{ resource: 'mana', min: 1, max: 1 }, { resource: 'casts', min: 1, max: Infinity }] },
]), ['infinite-cast', 'infinite-mana']);
assert.deepEqual(classesForProofDeltas([
  {
    family: 'variable-board-count-mana-loop',
    positiveDeltas: [
      { resource: 'mana', min: 1, max: Infinity },
      { resource: 'untaps', min: 1, max: Infinity },
      { resource: 'cards', min: 1, max: Infinity },
      { resource: 'life', min: 1, max: Infinity },
      { resource: 'pump', min: 1, max: Infinity },
    ],
  },
]), ['infinite-draw', 'infinite-life', 'infinite-mana', 'infinite-pump', 'infinite-untap']);
assert.deepEqual(classesForProofDeltas([
  { family: 'aristocrats-body-outlet-payoff', positiveDeltas: [{ resource: 'mana', min: 1, max: 1 }] },
]), []);
assert.deepEqual(classesForProofDeltas([
  {
    family: 'combat-resource→extra-combat-loop',
    positiveDeltas: [
      { resource: 'combatPhases', min: 1, max: Infinity },
      { resource: 'untaps', min: 1, max: Infinity },
      { resource: 'mana', min: 1, max: Infinity },
      { resource: 'tokens', min: 1, max: Infinity },
    ],
  },
]), ['combat', 'infinite-untap'], 'combat-resource proof deltas must not leak mana/tokens without an allowed family result axis');
assert.deepEqual(classesForProofDeltas([
  {
    family: 'artifact-token→extra-turn-loop',
    positiveDeltas: [
      { resource: 'turns', min: 1, max: Infinity },
      { resource: 'tokens', min: 1, max: Infinity },
      { resource: 'mana', min: 1, max: Infinity },
    ],
  },
]), ['infinite-turns'], 'artifact-token extra-turn proof deltas must not leak mana/tokens without an allowed family result axis');
assert.deepEqual(classesForProofDeltas([
  {
    family: 'combat-sacrifice-aura→extra-combat-loop',
    positiveDeltas: [
      { resource: 'combatPhases', min: 1, max: Infinity },
      { resource: 'sacrifices', min: 1, max: Infinity },
      { resource: 'deathTriggers', min: 1, max: Infinity },
      { resource: 'ltbTriggers', min: 1, max: Infinity },
      { resource: 'untaps', min: 1, max: Infinity },
      { resource: 'tokens', min: 1, max: Infinity },
      { resource: 'mana', min: 1, max: Infinity },
      { resource: 'damage', min: 1, max: Infinity },
    ],
  },
]), ['combat', 'infinite-death', 'infinite-ltb', 'infinite-sacrifice', 'infinite-untap'], 'combat-sacrifice Aura proof deltas must not leak mana/tokens/damage without an allowed family result axis');
assert.deepEqual(classesForProofDeltas([
  {
    family: 'hasty-copy→connect-extra-combat-loop',
    positiveDeltas: [
      { resource: 'combatPhases', min: 1, max: Infinity },
      { resource: 'tokens', min: 1, max: Infinity },
      { resource: 'etbTriggers', min: 1, max: Infinity },
      { resource: 'mana', min: 1, max: Infinity },
      { resource: 'damage', min: 1, max: Infinity },
      { resource: 'turns', min: 1, max: Infinity },
    ],
  },
]), ['combat', 'infinite-etb', 'infinite-tokens'], 'fresh-copy connect extra-combat proof deltas must not leak mana/damage/turn axes');
assert.deepEqual(classesForProofDeltas([
  {
    family: 'hasty-copy→connect-extra-turn-loop',
    positiveDeltas: [
      { resource: 'turns', min: 1, max: Infinity },
      { resource: 'tokens', min: 1, max: Infinity },
      { resource: 'etbTriggers', min: 1, max: Infinity },
      { resource: 'combatPhases', min: 1, max: Infinity },
      { resource: 'damage', min: 1, max: Infinity },
    ],
  },
]), ['infinite-turns'], 'fresh-copy extra-turn proof deltas must not leak token/ETB/combat/damage axes');

const lifeLoop = evaluateCombo({
  id: 'life-loop',
  detailPath: '/combos/test/life-loop',
  url: 'https://example.test/life-loop',
  cards: ['Gain From Loss', 'Loss From Gain'],
  cardCount: 2,
  results: ['Infinite lifegain', 'Infinite lifeloss'],
  categories: ['test'],
  metadata: { deckCount: 10 },
}, idx);
assert.equal(lifeLoop.resolvedAll, true);
assert.equal(lifeLoop.bucket, 'proved');
assert.ok(lifeLoop.familySignals.includes('lifegain-lifeloss-loop'));
assert.equal(lifeLoop.resultCoverage.coveredAny, true);

const fixedLifeLoop = evaluateCombo({
  id: 'fixed-life-loop',
  detailPath: '/combos/test/fixed-life-loop',
  url: 'https://example.test/fixed-life-loop',
  cards: ['Gain From Loss', 'Fixed Loss From Gain'],
  cardCount: 2,
  results: ['Infinite lifegain', 'Infinite lifeloss'],
  categories: ['test'],
  metadata: { deckCount: 9 },
}, idx);
assert.equal(fixedLifeLoop.bucket, 'proved');
assert.ok(fixedLifeLoop.familySignals.includes('lifegain-lifeloss-loop'));
assert.equal(fixedLifeLoop.resultCoverage.coveredAny, true);

const drawDamageLoop = evaluateCombo({
  id: 'draw-damage-loop',
  detailPath: '/combos/test/draw-damage-loop',
  url: 'https://example.test/draw-damage-loop',
  cards: ['Draw Damage Engine', 'Damage Draw Aura'],
  cardCount: 2,
  results: ['Infinite damage', 'Infinite card draw'],
  categories: ['test'],
  metadata: { deckCount: 8 },
}, idx);
assert.equal(drawDamageLoop.bucket, 'proved');
assert.ok(drawDamageLoop.familySignals.includes('draw-damage-feedback-loop'));
assert.deepEqual(drawDamageLoop.proofOnlyModelClasses, ['infinite-damage', 'infinite-draw']);
assert.equal(drawDamageLoop.proofOnlyResultCoverage.coveredAny, true);
assert.deepEqual(drawDamageLoop.modelClasses, ['infinite-damage', 'infinite-draw']);
assert.equal(drawDamageLoop.resultCoverage.coveredAny, true);

const pairedDrawDamageLoop = evaluateCombo({
  id: 'paired-draw-damage-loop',
  detailPath: '/combos/test/paired-draw-damage-loop',
  url: 'https://example.test/paired-draw-damage-loop',
  cards: ['Draw Damage Engine', 'Paired Creature Damage Draw'],
  cardCount: 2,
  results: ['Infinite damage', 'Infinite card draw'],
  categories: ['test'],
  metadata: { deckCount: 8 },
}, idx);
assert.equal(pairedDrawDamageLoop.bucket, 'proved');
assert.ok(pairedDrawDamageLoop.familySignals.includes('draw-damage-feedback-loop'));
assert.equal(pairedDrawDamageLoop.resultCoverage.coveredAny, true);

const selfCopySpellMagecraftDrainLoop = evaluateCombo({
  id: 'self-copy-spell-magecraft-drain-loop',
  detailPath: '/combos/test/self-copy-spell-magecraft-drain-loop',
  url: 'https://example.test/self-copy-spell-magecraft-drain-loop',
  cards: ['Self-Copying Targeted Spell', 'Magecraft Drain Payoff'],
  cardCount: 2,
  results: ['Infinite lifegain', 'Infinite lifeloss', 'Infinite magecraft triggers'],
  categories: ['test'],
  metadata: { deckCount: 8 },
}, idx);
assert.equal(selfCopySpellMagecraftDrainLoop.bucket, 'proved');
assert.ok(selfCopySpellMagecraftDrainLoop.familySignals.includes('self-copy-spell→magecraft-drain-loop'));
assert.equal(selfCopySpellMagecraftDrainLoop.resultCoverage.coveredAny, true);

const selfCopySpellNonDrainNearMiss = evaluateCombo({
  id: 'self-copy-spell-non-drain-near-miss',
  detailPath: '/combos/test/self-copy-spell-non-drain-near-miss',
  url: 'https://example.test/self-copy-spell-non-drain-near-miss',
  cards: ['Self-Copying Targeted Spell', 'Magecraft Token Payoff'],
  cardCount: 2,
  results: ['Infinite lifegain'],
  categories: ['test'],
  metadata: { deckCount: 1 },
}, idx);
assert.notEqual(selfCopySpellNonDrainNearMiss.bucket, 'proved');
assert.ok(!selfCopySpellNonDrainNearMiss.familySignals.includes('self-copy-spell→magecraft-drain-loop'));

const lifelinkCounterDamageLoop = evaluateCombo({
  id: 'lifelink-counter-damage-loop',
  detailPath: '/combos/test/lifelink-counter-damage-loop',
  url: 'https://example.test/lifelink-counter-damage-loop',
  cards: ['Lifelink Counter Engine', 'Counter Damage Creature'],
  cardCount: 2,
  results: ['Infinite damage', 'Infinite lifegain'],
  categories: ['test'],
  metadata: { deckCount: 8 },
}, idx);
assert.equal(lifelinkCounterDamageLoop.bucket, 'proved');
assert.ok(lifelinkCounterDamageLoop.familySignals.includes('lifelink-counter-damage-loop'));
assert.equal(lifelinkCounterDamageLoop.resultCoverage.coveredAny, true);

const lifePaidDamageRecoveryLoop = evaluateCombo({
  id: 'life-paid-damage-recovery-loop',
  detailPath: '/combos/test/life-paid-damage-recovery-loop',
  url: 'https://example.test/life-paid-damage-recovery-loop',
  cards: ['Life-Paid Damage Source', 'Opponent Loss Lifegain Payoff'],
  cardCount: 2,
  results: ['Infinite damage', 'Infinite lifegain triggers'],
  categories: ['test'],
  metadata: { deckCount: 8 },
}, idx);
assert.equal(lifePaidDamageRecoveryLoop.bucket, 'proved');
assert.ok(lifePaidDamageRecoveryLoop.familySignals.includes('life-paid-damage-lifeloss-recovery-loop'));
assert.equal(lifePaidDamageRecoveryLoop.resultCoverage.coveredAny, true);

const lifePaidDamageNoRecovery = evaluateCombo({
  id: 'life-paid-damage-no-recovery',
  detailPath: '/combos/test/life-paid-damage-no-recovery',
  url: 'https://example.test/life-paid-damage-no-recovery',
  cards: ['Life-Paid Damage Source', 'Blank Rock'],
  cardCount: 2,
  results: ['Infinite damage'],
  categories: ['test'],
  metadata: { deckCount: 1 },
}, idx);
assert.ok(!lifePaidDamageNoRecovery.familySignals.includes('life-paid-damage-lifeloss-recovery-loop'));
assert.equal(lifePaidDamageNoRecovery.resultCoverage.coveredAny, false, 'life-paid damage must not be repeatable without life-loss recovery');

const tappedLifePaidDamageNearMiss = evaluateCombo({
  id: 'tapped-life-paid-damage-near-miss',
  detailPath: '/combos/test/tapped-life-paid-damage-near-miss',
  url: 'https://example.test/tapped-life-paid-damage-near-miss',
  cards: ['Tapped Life-Paid Damage Source', 'Opponent Loss Lifegain Payoff'],
  cardCount: 2,
  results: ['Infinite damage'],
  categories: ['test'],
  metadata: { deckCount: 1 },
}, idx);
assert.ok(!tappedLifePaidDamageNearMiss.familySignals.includes('life-paid-damage-lifeloss-recovery-loop'));
assert.equal(tappedLifePaidDamageNearMiss.resultCoverage.coveredAny, false, 'life-paid damage with tap cost must not be treated as repeatable');

const counterTokenEtbCounterLoop = evaluateCombo({
  id: 'counter-token-etb-counter-loop',
  detailPath: '/combos/test/counter-token-etb-counter-loop',
  url: 'https://example.test/counter-token-etb-counter-loop',
  cards: ['Counter Token Engine', 'Green ETB Counter Granter'],
  cardCount: 2,
  results: ['Infinite creature tokens', 'Infinite ETB', 'Infinite +1/+1 counters on a creature'],
  categories: ['test'],
  metadata: { deckCount: 8 },
}, idx);
assert.equal(counterTokenEtbCounterLoop.bucket, 'proved');
assert.ok(counterTokenEtbCounterLoop.familySignals.includes('counter-token→etb-counter-loop'));
assert.equal(counterTokenEtbCounterLoop.resultCoverage.coveredAny, true);

const counterTokenColorNearMiss = evaluateCombo({
  id: 'counter-token-color-near-miss',
  detailPath: '/combos/test/counter-token-color-near-miss',
  url: 'https://example.test/counter-token-color-near-miss',
  cards: ['Colorless Counter Token Engine', 'Green ETB Counter Granter'],
  cardCount: 2,
  results: ['Infinite creature tokens'],
  categories: ['test'],
  metadata: { deckCount: 1 },
}, idx);
assert.notEqual(counterTokenColorNearMiss.bucket, 'proved');
assert.ok(!counterTokenColorNearMiss.familySignals.includes('counter-token→etb-counter-loop'));
assert.equal(counterTokenColorNearMiss.resultCoverage.coveredAny, false, 'color-restricted ETB counter granters must not accept off-color tokens');

const minusCounterDeathTokenLoop = evaluateCombo({
  id: 'minus-counter-death-token-loop',
  detailPath: '/combos/test/minus-counter-death-token-loop',
  url: 'https://example.test/minus-counter-death-token-loop',
  cards: ['Minus Counter Death Spreader', 'Minus Counter Token Engine'],
  cardCount: 2,
  results: ['Infinite death triggers', 'Infinite ETB', 'Infinite LTB'],
  categories: ['test'],
  metadata: { deckCount: 8 },
}, idx);
assert.equal(minusCounterDeathTokenLoop.bucket, 'proved');
assert.ok(minusCounterDeathTokenLoop.familySignals.includes('minus-counter-death→token-loop'));
assert.equal(minusCounterDeathTokenLoop.resultCoverage.coveredAny, true);

const lifegainCounterTokenEtbLoop = evaluateCombo({
  id: 'lifegain-counter-token-etb-loop',
  detailPath: '/combos/test/lifegain-counter-token-etb-loop',
  url: 'https://example.test/lifegain-counter-token-etb-loop',
  cards: ['Named Counter Token Engine', 'Lifegain Counter Payoff', 'Creature ETB Lifegain Payoff'],
  cardCount: 3,
  results: ['Infinite creature tokens', 'Infinite ETB', 'Infinite lifegain', 'Infinite +1/+1 counters on a creature'],
  categories: ['test'],
  metadata: { deckCount: 8 },
}, idx);
assert.equal(lifegainCounterTokenEtbLoop.bucket, 'proved');
assert.ok(lifegainCounterTokenEtbLoop.familySignals.includes('lifegain-counter-token-etb-loop'));
assert.equal(lifegainCounterTokenEtbLoop.resultCoverage.coveredAny, true);

const lifegainCounterOncePerTurnNearMiss = evaluateCombo({
  id: 'lifegain-counter-once-per-turn-near-miss',
  detailPath: '/combos/test/lifegain-counter-once-per-turn-near-miss',
  url: 'https://example.test/lifegain-counter-once-per-turn-near-miss',
  cards: ['Named Counter Token Engine', 'Lifegain Counter Payoff', 'Once-Per-Turn ETB Lifegain Payoff'],
  cardCount: 3,
  results: ['Infinite lifegain'],
  categories: ['test'],
  metadata: { deckCount: 1 },
}, idx);
assert.notEqual(lifegainCounterOncePerTurnNearMiss.bucket, 'proved');
assert.ok(!lifegainCounterOncePerTurnNearMiss.familySignals.includes('lifegain-counter-token-etb-loop'));
assert.equal(lifegainCounterOncePerTurnNearMiss.resultCoverage.coveredAny, false, 'once-per-turn ETB lifegain must not prove the repeatable counter-token loop');

const intrinsicDeathUntapPingerLock = evaluateCombo({
  id: 'intrinsic-death-untap-pinger-lock',
  detailPath: '/combos/test/intrinsic-death-untap-pinger-lock',
  url: 'https://example.test/intrinsic-death-untap-pinger-lock',
  cards: ['Death Untap Pinger', 'Deathtouch Equipment'],
  cardCount: 2,
  results: ['Destroy all creatures opponents control'],
  categories: ['test'],
  metadata: { deckCount: 8 },
}, idx);
assert.equal(intrinsicDeathUntapPingerLock.bucket, 'proved');
assert.ok(intrinsicDeathUntapPingerLock.familySignals.includes('death-untap-deathtouch-pinger-lock'));
assert.deepEqual(intrinsicDeathUntapPingerLock.proofOnlyModelClasses, ['lock']);
assert.equal(intrinsicDeathUntapPingerLock.proofOnlyResultCoverage.coveredAny, true);
assert.equal(intrinsicDeathUntapPingerLock.resultCoverage.coveredAny, true);

const grantedDeathUntapPingerLock = evaluateCombo({
  id: 'granted-death-untap-pinger-lock',
  detailPath: '/combos/test/granted-death-untap-pinger-lock',
  url: 'https://example.test/granted-death-untap-pinger-lock',
  cards: ['Death Untap Equipment', 'Free Ping Equipment', 'Deathtouch Equipment'],
  cardCount: 3,
  results: ['Destroy all creatures opponents control'],
  categories: ['test'],
  metadata: { deckCount: 8 },
}, idx);
assert.equal(grantedDeathUntapPingerLock.bucket, 'proved');
assert.ok(grantedDeathUntapPingerLock.familySignals.includes('death-untap-deathtouch-pinger-lock'));
assert.deepEqual(grantedDeathUntapPingerLock.proofOnlyModelClasses, ['lock']);
assert.equal(grantedDeathUntapPingerLock.proofOnlyResultCoverage.coveredAny, true);
assert.equal(grantedDeathUntapPingerLock.resultCoverage.coveredAny, true);

const costedDeathUntapPingerNearMiss = evaluateCombo({
  id: 'costed-death-untap-pinger-near-miss',
  detailPath: '/combos/test/costed-death-untap-pinger-near-miss',
  url: 'https://example.test/costed-death-untap-pinger-near-miss',
  cards: ['Death Untap Equipment', 'Costed Ping Equipment', 'Deathtouch Equipment'],
  cardCount: 3,
  results: ['Destroy all creatures opponents control'],
  categories: ['test'],
  metadata: { deckCount: 1 },
}, idx);
assert.notEqual(costedDeathUntapPingerNearMiss.bucket, 'proved');
assert.ok(!costedDeathUntapPingerNearMiss.familySignals.includes('death-untap-deathtouch-pinger-lock'));
assert.equal(costedDeathUntapPingerNearMiss.resultCoverage.coveredAny, false, 'mana-costed pingers must not prove repeatable creature locks without a mana proof');

const oncePerTurnDeathUntapPingerNearMiss = evaluateCombo({
  id: 'once-per-turn-death-untap-pinger-near-miss',
  detailPath: '/combos/test/once-per-turn-death-untap-pinger-near-miss',
  url: 'https://example.test/once-per-turn-death-untap-pinger-near-miss',
  cards: ['Once-Per-Turn Death Untap Equipment', 'Free Ping Equipment', 'Deathtouch Equipment'],
  cardCount: 3,
  results: ['Destroy all creatures opponents control'],
  categories: ['test'],
  metadata: { deckCount: 1 },
}, idx);
assert.notEqual(oncePerTurnDeathUntapPingerNearMiss.bucket, 'proved');
assert.ok(!oncePerTurnDeathUntapPingerNearMiss.familySignals.includes('death-untap-deathtouch-pinger-lock'));
assert.equal(oncePerTurnDeathUntapPingerNearMiss.resultCoverage.coveredAny, false, 'once-per-turn death untaps must not prove repeatable creature locks');

const splitIntrinsicDeathUntapPingerNearMiss = evaluateCombo({
  id: 'split-intrinsic-death-untap-pinger-near-miss',
  detailPath: '/combos/test/split-intrinsic-death-untap-pinger-near-miss',
  url: 'https://example.test/split-intrinsic-death-untap-pinger-near-miss',
  cards: ['Free Pinger Creature', 'Death Untap Creature', 'Deathtouch Equipment'],
  cardCount: 3,
  results: ['Destroy all creatures opponents control'],
  categories: ['test'],
  metadata: { deckCount: 1 },
}, idx);
assert.notEqual(splitIntrinsicDeathUntapPingerNearMiss.bucket, 'proved');
assert.ok(!splitIntrinsicDeathUntapPingerNearMiss.familySignals.includes('death-untap-deathtouch-pinger-lock'));
assert.equal(splitIntrinsicDeathUntapPingerNearMiss.resultCoverage.coveredAny, false, 'intrinsic ping and death-untap roles on different creatures must not imply one repeatable lock source');

const exileRecastCreatureManaLoop = evaluateCombo({
  id: 'exile-recast-creature-mana-loop',
  detailPath: '/combos/test/exile-recast-creature-mana-loop',
  url: 'https://example.test/exile-recast-creature-mana-loop',
  cards: ['Recursive Exile Creature', 'Creature-Only Exile Mana Outlet'],
  cardCount: 2,
  results: ['Infinite ETB', 'Infinite LTB', 'Infinite storm count', 'Infinite colored mana'],
  categories: ['test'],
  metadata: { deckCount: 8 },
}, idx);
assert.equal(exileRecastCreatureManaLoop.bucket, 'proved');
assert.ok(exileRecastCreatureManaLoop.familySignals.includes('exile-recast-creature-mana-loop'));
assert.equal(exileRecastCreatureManaLoop.resultCoverage.coveredAny, true);

const exileOutletGraveyardRecursionNearMiss = evaluateCombo({
  id: 'exile-outlet-graveyard-recursion-near-miss',
  detailPath: '/combos/test/exile-outlet-graveyard-recursion-near-miss',
  url: 'https://example.test/exile-outlet-graveyard-recursion-near-miss',
  cards: ['Recursive Body', 'Creature-Only Exile Mana Outlet'],
  cardCount: 2,
  results: ['Infinite storm count'],
  categories: ['test'],
  metadata: { deckCount: 1 },
}, idx);
assert.ok(!exileOutletGraveyardRecursionNearMiss.familySignals.includes('exile-recast-creature-mana-loop'));
assert.equal(exileOutletGraveyardRecursionNearMiss.resultCoverage.coveredAny, false, 'graveyard recursion must not be treated as exile recursion');

const originBoundExileRecastNearMiss = evaluateCombo({
  id: 'origin-bound-exile-recast-near-miss',
  detailPath: '/combos/test/origin-bound-exile-recast-near-miss',
  url: 'https://example.test/origin-bound-exile-recast-near-miss',
  cards: ['Conditional Exile Creature', 'Creature-Only Exile Mana Outlet'],
  cardCount: 2,
  results: ['Infinite storm count'],
  categories: ['test'],
  metadata: { deckCount: 1 },
}, idx);
assert.ok(!originBoundExileRecastNearMiss.familySignals.includes('exile-recast-creature-mana-loop'));
assert.equal(originBoundExileRecastNearMiss.resultCoverage.coveredAny, false, 'origin-bound exile casting must not be treated as arbitrary exile recursion');

const deathCopySpellEtbCopyLoop = evaluateCombo({
  id: 'death-copy-spell-etb-copy-loop',
  detailPath: '/combos/test/death-copy-spell-etb-copy-loop',
  url: 'https://example.test/death-copy-spell-etb-copy-loop',
  cards: ['ETB Spell Copier Creature', 'Death-Copy Creature Spell'],
  cardCount: 2,
  results: ['Infinite creature tokens', 'Infinite ETB', 'Infinite LTB', 'Infinite death triggers', 'Infinite magecraft triggers'],
  categories: ['test'],
  metadata: { deckCount: 8 },
}, idx);
assert.equal(deathCopySpellEtbCopyLoop.bucket, 'proved');
assert.ok(deathCopySpellEtbCopyLoop.familySignals.includes('death-copy-spell-etb-copy-loop'));
assert.equal(deathCopySpellEtbCopyLoop.resultCoverage.coveredAny, true);

const deathCopyLegendaryNearMiss = evaluateCombo({
  id: 'death-copy-legendary-near-miss',
  detailPath: '/combos/test/death-copy-legendary-near-miss',
  url: 'https://example.test/death-copy-legendary-near-miss',
  cards: ['Legendary ETB Spell Copier Creature', 'Death-Copy Creature Spell'],
  cardCount: 2,
  results: ['Infinite creature tokens'],
  categories: ['test'],
  metadata: { deckCount: 1 },
}, idx);
assert.ok(!deathCopyLegendaryNearMiss.familySignals.includes('death-copy-spell-etb-copy-loop'));
assert.equal(deathCopyLegendaryNearMiss.resultCoverage.coveredAny, false, 'legendary ETB spell copiers must not be treated as safe token-copy loops');

const broadSpellCopyLoop = evaluateCombo({
  id: 'broad-spell-copy-loop',
  detailPath: '/combos/test/broad-spell-copy-loop',
  url: 'https://example.test/broad-spell-copy-loop',
  cards: ['ETB Spell Copier Creature', 'Broad Hasty Creature Copy Spell'],
  cardCount: 2,
  results: ['Infinite creature tokens', 'Infinite ETB', 'Infinite LTB'],
  categories: ['test'],
  metadata: { deckCount: 8 },
}, idx);
assert.equal(broadSpellCopyLoop.bucket, 'proved');
assert.ok(broadSpellCopyLoop.familySignals.includes('spell-copy-etb→creature-copy-spell-loop'));
assert.equal(broadSpellCopyLoop.resultCoverage.coveredAny, true);

const broadSpellCopyLegendaryNearMiss = evaluateCombo({
  id: 'broad-spell-copy-legendary-near-miss',
  detailPath: '/combos/test/broad-spell-copy-legendary-near-miss',
  url: 'https://example.test/broad-spell-copy-legendary-near-miss',
  cards: ['Legendary ETB Spell Copier Creature', 'Broad Hasty Creature Copy Spell'],
  cardCount: 2,
  results: ['Infinite creature tokens', 'Infinite ETB', 'Infinite LTB'],
  categories: ['test'],
  metadata: { deckCount: 1 },
}, idx);
assert.notEqual(broadSpellCopyLegendaryNearMiss.bucket, 'proved');
assert.ok(!broadSpellCopyLegendaryNearMiss.familySignals.includes('spell-copy-etb→creature-copy-spell-loop'));
assert.ok(!broadSpellCopyLegendaryNearMiss.proofOnlyFamilies.includes('spell-copy-etb→creature-copy-spell-loop'));

const recursiveSacLoop = evaluateCombo({
  id: 'recursive-sac-loop',
  detailPath: '/combos/test/recursive-sac-loop',
  url: 'https://example.test/recursive-sac-loop',
  cards: ['Recursive Body', 'Mana Sac Outlet'],
  cardCount: 2,
  results: ['Infinite death triggers', 'Infinite sacrifice triggers', 'Infinite storm count'],
  categories: ['test'],
  metadata: { deckCount: 7 },
}, idx);
assert.equal(recursiveSacLoop.bucket, 'proved');
assert.ok(recursiveSacLoop.familySignals.includes('recursive-body-sacrifice-mana-loop'));
assert.equal(recursiveSacLoop.proofOnlyResultCoverage.coveredAny, true);
assert.equal(recursiveSacLoop.resultCoverage.coveredAny, true);

const layeredRecursiveSacLoop = evaluateCombo({
  id: 'layered-recursive-sac-loop',
  detailPath: '/combos/test/layered-recursive-sac-loop',
  url: 'https://example.test/layered-recursive-sac-loop',
  cards: ['Colored Recursive Body', 'Colorless Mana Sac Outlet', 'Death Mana Payoff'],
  cardCount: 3,
  results: ['Infinite death triggers', 'Infinite sacrifice triggers', 'Infinite ETB'],
  categories: ['test'],
  metadata: { deckCount: 6 },
}, idx);
assert.equal(layeredRecursiveSacLoop.bucket, 'proved');
assert.ok(layeredRecursiveSacLoop.proofOnlyFamilies.includes('recursive-body-sacrifice-mana-loop'));
assert.equal(layeredRecursiveSacLoop.proofOnlyResultCoverage.coveredAny, true);

const hastyCopyLoop = evaluateCombo({
  id: 'hasty-copy-loop',
  detailPath: '/combos/test/hasty-copy-loop',
  url: 'https://example.test/hasty-copy-loop',
  cards: ['Hasty Copy Engine', 'Permanent Untapper'],
  cardCount: 2,
  results: ['Infinite mana'],
  categories: ['test'],
  metadata: { deckCount: 5 },
}, idx);
assert.equal(hastyCopyLoop.bucket, 'proved');
assert.ok(hastyCopyLoop.familySignals.includes('hasty-copy→etb-untap-loop'));
assert.deepEqual(hastyCopyLoop.modelClasses, ['infinite-etb', 'infinite-ltb', 'infinite-tokens', 'infinite-untap']);
assert.equal(hastyCopyLoop.resultCoverage.coveredAny, false, 'hasty-copy ETB untap loops should not imply mana without mana facts');

const amplifiedSelfUntapLoop = evaluateCombo({
  id: 'amplified-self-untap-loop',
  detailPath: '/combos/test/amplified-self-untap-loop',
  url: 'https://example.test/amplified-self-untap-loop',
  cards: ['Colorless Mana Amplifier', 'Break-Even Self Untapper With Colorless'],
  cardCount: 2,
  results: ['Infinite mana'],
  categories: ['test'],
  metadata: { deckCount: 4 },
}, idx);
assert.equal(amplifiedSelfUntapLoop.bucket, 'proved');
assert.ok(amplifiedSelfUntapLoop.familySignals.includes('self-untap-mana-loop'));
assert.equal(amplifiedSelfUntapLoop.resultCoverage.coveredAny, true);

const anyTypeAmplifiedSelfUntapLoop = evaluateCombo({
  id: 'any-type-amplified-self-untap-loop',
  detailPath: '/combos/test/any-type-amplified-self-untap-loop',
  url: 'https://example.test/any-type-amplified-self-untap-loop',
  cards: ['Any-Type Nonland Mana Amplifier', 'Break-Even Self Untapper With Colorless'],
  cardCount: 2,
  results: ['Infinite mana'],
  categories: ['test'],
  metadata: { deckCount: 4 },
}, idx);
assert.equal(anyTypeAmplifiedSelfUntapLoop.bucket, 'proved');
assert.ok(anyTypeAmplifiedSelfUntapLoop.familySignals.includes('self-untap-mana-loop'));
assert.equal(anyTypeAmplifiedSelfUntapLoop.resultCoverage.coveredAny, true);

const costReducedSelfUntapLoop = evaluateCombo({
  id: 'cost-reduced-self-untap-loop',
  detailPath: '/combos/test/cost-reduced-self-untap-loop',
  url: 'https://example.test/cost-reduced-self-untap-loop',
  cards: ['Break-Even Self Untapper With Colorless', 'Artifact Ability Cost Reducer'],
  cardCount: 2,
  results: ['Infinite colorless mana'],
  categories: ['test'],
  metadata: { deckCount: 4 },
}, idx);
assert.equal(costReducedSelfUntapLoop.bucket, 'proved');
assert.ok(costReducedSelfUntapLoop.familySignals.includes('self-untap-mana-loop'));
assert.equal(costReducedSelfUntapLoop.resultCoverage.coveredAny, true);

const variableBoardCountStaffLoop = evaluateCombo({
  id: 'variable-board-count-staff-loop',
  detailPath: '/combos/test/variable-board-count-staff-loop',
  url: 'https://example.test/variable-board-count-staff-loop',
  cards: ['Generic Tribe Count Druid', 'Generic Modal Untap Engine'],
  cardCount: 2,
  results: ['Infinite card draw', 'Infinite lifegain', 'Infinite untap', 'Infinite green mana'],
  categories: ['test'],
  metadata: { deckCount: 4 },
}, idx);
assert.equal(variableBoardCountStaffLoop.bucket, 'proved');
assert.ok(variableBoardCountStaffLoop.familySignals.includes('variable-board-count-mana-loop'));
assert.ok(variableBoardCountStaffLoop.proofDeltaClasses.includes('infinite-draw'));
assert.ok(variableBoardCountStaffLoop.proofDeltaClasses.includes('infinite-life'));
assert.ok(variableBoardCountStaffLoop.proofDeltaClasses.includes('infinite-mana'));
assert.ok(variableBoardCountStaffLoop.proofDeltaClasses.includes('infinite-untap'));
assert.equal(variableBoardCountStaffLoop.resultCoverage.coveredAny, true);

const variableBoardCountPumpLoop = evaluateCombo({
  id: 'variable-board-count-pump-loop',
  detailPath: '/combos/test/variable-board-count-pump-loop',
  url: 'https://example.test/variable-board-count-pump-loop',
  cards: ['Generic Tribe Count Druid', 'Untap Symbol Equipment'],
  cardCount: 2,
  results: ['Infinitely large creatures', 'Infinite green mana'],
  categories: ['test'],
  metadata: { deckCount: 4 },
}, idx);
assert.equal(variableBoardCountPumpLoop.bucket, 'proved');
assert.ok(variableBoardCountPumpLoop.familySignals.includes('variable-board-count-mana-loop'));
assert.ok(variableBoardCountPumpLoop.proofDeltaClasses.includes('infinite-pump'));
assert.ok(variableBoardCountPumpLoop.proofDeltaClasses.includes('infinite-mana'));
assert.equal(variableBoardCountPumpLoop.resultCoverage.coveredAny, true);

const combatCopyExtraCombatLoop = evaluateCombo({
  id: 'combat-copy-extra-combat-loop',
  detailPath: '/combos/test/combat-copy-extra-combat-loop',
  url: 'https://example.test/combat-copy-extra-combat-loop',
  cards: ['Combat Copy Equipment', 'First Attack Extra Combat'],
  cardCount: 2,
  results: ['Infinite combat phases', 'Infinite creature tokens', 'Infinite ETB'],
  categories: ['test'],
  metadata: { deckCount: 4 },
}, idx);
assert.equal(combatCopyExtraCombatLoop.bucket, 'proved');
assert.ok(combatCopyExtraCombatLoop.familySignals.includes('combat-copy-token→extra-combat-loop'));
assert.equal(combatCopyExtraCombatLoop.resultCoverage.coveredAny, true);
assert.deepEqual(combatCopyExtraCombatLoop.proofDeltaClasses, ['combat', 'infinite-etb', 'infinite-tokens']);

const hastyCopyAttackExtraCombatLoop = evaluateCombo({
  id: 'hasty-copy-attack-extra-combat-loop',
  detailPath: '/combos/test/hasty-copy-attack-extra-combat-loop',
  url: 'https://example.test/hasty-copy-attack-extra-combat-loop',
  cards: ['Hasty Copy Source', 'Exert Extra Combat'],
  cardCount: 2,
  results: ['Infinite combat phases', 'Infinite creature tokens', 'Infinite ETB'],
  categories: ['test'],
  metadata: { deckCount: 4 },
}, idx);
assert.equal(hastyCopyAttackExtraCombatLoop.bucket, 'proved');
assert.ok(hastyCopyAttackExtraCombatLoop.proofOnlyFamilies.includes('hasty-copy→attack-extra-combat-loop'));
assert.deepEqual(hastyCopyAttackExtraCombatLoop.proofDeltaClasses, ['combat', 'infinite-etb', 'infinite-tokens']);
assert.equal(hastyCopyAttackExtraCombatLoop.resultCoverage.coveredAny, true);

const attachedCopyAttackExtraCombatLoop = evaluateCombo({
  id: 'attached-copy-attack-extra-combat-loop',
  detailPath: '/combos/test/attached-copy-attack-extra-combat-loop',
  url: 'https://example.test/attached-copy-attack-extra-combat-loop',
  cards: ['Attached Self Copy Aura', 'Exert Extra Combat'],
  cardCount: 2,
  results: ['Infinite combat phases', 'Infinite creature tokens', 'Infinite ETB'],
  categories: ['test'],
  metadata: { deckCount: 4 },
}, idx);
assert.equal(attachedCopyAttackExtraCombatLoop.bucket, 'proved');
assert.ok(attachedCopyAttackExtraCombatLoop.proofOnlyFamilies.includes('hasty-copy→attack-extra-combat-loop'));

const genericPrecombatAttackExtraCombatLoop = evaluateCombo({
  id: 'generic-precombat-attack-extra-combat-loop',
  detailPath: '/combos/test/generic-precombat-attack-extra-combat-loop',
  url: 'https://example.test/generic-precombat-attack-extra-combat-loop',
  cards: ['Generic Precombat Copy Source', 'Exert Extra Combat'],
  cardCount: 2,
  results: ['Infinite combat phases', 'Infinite creature tokens', 'Infinite ETB'],
  categories: ['test'],
  metadata: { deckCount: 3 },
}, idx);
assert.equal(genericPrecombatAttackExtraCombatLoop.bucket, 'proved');
assert.ok(genericPrecombatAttackExtraCombatLoop.proofOnlyFamilies.includes('combat-copy-token→extra-combat-loop'));

const combatCopyConnectExtraCombatLoop = evaluateCombo({
  id: 'combat-copy-connect-extra-combat-loop',
  detailPath: '/combos/test/combat-copy-connect-extra-combat-loop',
  url: 'https://example.test/combat-copy-connect-extra-combat-loop',
  cards: ['Combat Copy Equipment', 'Connect Extra Combat'],
  cardCount: 2,
  results: ['Infinite combat phases', 'Infinite creature tokens', 'Infinite ETB'],
  categories: ['test'],
  metadata: { deckCount: 4 },
}, idx);
assert.equal(combatCopyConnectExtraCombatLoop.bucket, 'proved');
assert.ok(combatCopyConnectExtraCombatLoop.proofOnlyFamilies.includes('combat-copy-token→connect-extra-combat-loop'));
assert.deepEqual(combatCopyConnectExtraCombatLoop.proofDeltaClasses, ['combat', 'infinite-etb', 'infinite-tokens']);
assert.equal(combatCopyConnectExtraCombatLoop.resultCoverage.coveredAny, true);

const hastyCopyConnectExtraCombatLoop = evaluateCombo({
  id: 'hasty-copy-connect-extra-combat-loop',
  detailPath: '/combos/test/hasty-copy-connect-extra-combat-loop',
  url: 'https://example.test/hasty-copy-connect-extra-combat-loop',
  cards: ['Hasty Copy Source', 'Connect Extra Combat'],
  cardCount: 2,
  results: ['Infinite combat phases', 'Infinite creature tokens', 'Infinite ETB'],
  categories: ['test'],
  metadata: { deckCount: 4 },
}, idx);
assert.equal(hastyCopyConnectExtraCombatLoop.bucket, 'proved');
assert.ok(hastyCopyConnectExtraCombatLoop.proofOnlyFamilies.includes('hasty-copy→connect-extra-combat-loop'));
assert.deepEqual(hastyCopyConnectExtraCombatLoop.proofDeltaClasses, ['combat', 'infinite-etb', 'infinite-tokens']);
assert.equal(hastyCopyConnectExtraCombatLoop.resultCoverage.coveredAny, true);

const combatCopyConnectExtraTurnLoop = evaluateCombo({
  id: 'combat-copy-connect-extra-turn-loop',
  detailPath: '/combos/test/combat-copy-connect-extra-turn-loop',
  url: 'https://example.test/combat-copy-connect-extra-turn-loop',
  cards: ['Combat Copy Equipment', 'Connect Extra Turn'],
  cardCount: 2,
  results: ['Infinite turns'],
  categories: ['test'],
  metadata: { deckCount: 2 },
}, idx);
assert.equal(combatCopyConnectExtraTurnLoop.bucket, 'proved');
assert.ok(combatCopyConnectExtraTurnLoop.proofOnlyFamilies.includes('combat-copy-token→connect-extra-turn-loop'));
assert.deepEqual(combatCopyConnectExtraTurnLoop.proofDeltaClasses, ['infinite-turns']);
assert.equal(combatCopyConnectExtraTurnLoop.resultCoverage.coveredAny, true);

const hastyCopyConnectExtraTurnLoop = evaluateCombo({
  id: 'hasty-copy-connect-extra-turn-loop',
  detailPath: '/combos/test/hasty-copy-connect-extra-turn-loop',
  url: 'https://example.test/hasty-copy-connect-extra-turn-loop',
  cards: ['Hasty Copy Source', 'Connect Extra Turn'],
  cardCount: 2,
  results: ['Infinite turns'],
  categories: ['test'],
  metadata: { deckCount: 2 },
}, idx);
assert.equal(hastyCopyConnectExtraTurnLoop.bucket, 'proved');
assert.ok(hastyCopyConnectExtraTurnLoop.proofOnlyFamilies.includes('hasty-copy→connect-extra-turn-loop'));
assert.deepEqual(hastyCopyConnectExtraTurnLoop.proofDeltaClasses, ['infinite-turns']);
assert.equal(hastyCopyConnectExtraTurnLoop.resultCoverage.coveredAny, true);

const combatCopyAttackExtraTurnLoop = evaluateCombo({
  id: 'combat-copy-attack-extra-turn-loop',
  detailPath: '/combos/test/combat-copy-attack-extra-turn-loop',
  url: 'https://example.test/combat-copy-attack-extra-turn-loop',
  cards: ['Generic Precombat Copy Source', 'Attack Extra Turn'],
  cardCount: 2,
  results: ['Infinite turns'],
  categories: ['test'],
  metadata: { deckCount: 2 },
}, idx);
assert.equal(combatCopyAttackExtraTurnLoop.bucket, 'proved');
assert.ok(combatCopyAttackExtraTurnLoop.proofOnlyFamilies.includes('combat-copy-token→attack-extra-turn-loop'));

const combatCopyNoExtraCombatNearMiss = evaluateCombo({
  id: 'combat-copy-no-extra-combat-near-miss',
  detailPath: '/combos/test/combat-copy-no-extra-combat-near-miss',
  url: 'https://example.test/combat-copy-no-extra-combat-near-miss',
  cards: ['Combat Copy Equipment', 'Vanilla Attacker'],
  cardCount: 2,
  results: ['Infinite combat phases'],
  categories: ['test'],
  metadata: { deckCount: 1 },
}, idx);
assert.notEqual(combatCopyNoExtraCombatNearMiss.bucket, 'proved');
assert.ok(!combatCopyNoExtraCombatNearMiss.familySignals.includes('combat-copy-token→extra-combat-loop'));

for (const combo of [
  {
    id: 'hasty-copy-legendary-attack-near-miss',
    cards: ['Hasty Copy Source', 'Legendary Attack Extra Combat'],
    results: ['Infinite combat phases'],
  },
  {
    id: 'broad-hasty-copy-legendary-attack-near-miss',
    cards: ['Broad Hasty Copy Source', 'Legendary Attack Extra Combat'],
    results: ['Infinite combat phases'],
  },
  {
    id: 'tapped-artifact-hasty-copy-attack-near-miss',
    cards: ['Tapped Artifact Hasty Copy Source', 'Exert Extra Combat'],
    results: ['Infinite combat phases'],
  },
  {
    id: 'tapped-artifact-hasty-copy-connect-near-miss',
    cards: ['Tapped Artifact Hasty Copy Source', 'Connect Extra Combat'],
    results: ['Infinite combat phases'],
  },
  {
    id: 'tapped-attacking-copy-connect-near-miss',
    cards: ['Tapped Attacking Copy Source', 'Connect Extra Combat'],
    results: ['Infinite combat phases'],
  },
  {
    id: 'restricted-connect-extra-combat-near-miss',
    cards: ['Combat Copy Equipment', 'Restricted Connect Extra Combat'],
    results: ['Infinite combat phases'],
  },
  {
    id: 'creature-damage-extra-combat-near-miss',
    cards: ['Combat Copy Equipment', 'Creature Damage Extra Combat'],
    results: ['Infinite combat phases'],
  },
  {
    id: 'extra-turn-cannot-attack-near-miss',
    cards: ['Combat Copy Equipment', 'Extra Turn Cannot Attack'],
    results: ['Infinite turns'],
  },
  {
    id: 'optional-sacrifice-extra-turn-near-miss',
    cards: ['Combat Copy Equipment', 'Optional Sacrifice Extra Turn'],
    results: ['Infinite turns'],
  },
]) {
  const item = evaluateCombo({
    id: combo.id,
    detailPath: `/combos/test/${combo.id}`,
    url: `https://example.test/${combo.id}`,
    cards: combo.cards,
    cardCount: 2,
    results: combo.results,
    categories: ['test'],
    metadata: { deckCount: 1 },
  }, idx);
  assert.notEqual(item.bucket, 'proved', `${combo.id} should not be strict-proved`);
  assert.equal(item.proofOnlyFamilies.some(family => /extra-combat-loop|extra-turn-loop/.test(family)), false, `${combo.id} should not surface a strict combat/turn proof family`);
  assert.equal(item.resultCoverage.coveredAny, false, `${combo.id} should not cover its requested result axis`);
}

const combatSacrificeAuraLoop = evaluateCombo({
  id: 'combat-sacrifice-aura-loop',
  detailPath: '/combos/test/combat-sacrifice-aura-loop',
  url: 'https://example.test/combat-sacrifice-aura-loop',
  cards: ['Combat Sacrifice Aura', 'Fresh Combat Carrier Source'],
  cardCount: 2,
  results: ['Infinite combat phases', 'Infinite sacrifice triggers', 'Infinite LTB', 'Infinite death triggers', 'Infinite untap'],
  categories: ['test'],
  metadata: { deckCount: 4 },
}, idx);
assert.equal(combatSacrificeAuraLoop.bucket, 'proved');
assert.ok(combatSacrificeAuraLoop.proofOnlyFamilies.includes('combat-sacrifice-aura→extra-combat-loop'));
assert.ok(combatSacrificeAuraLoop.familySignals.includes('combat-sacrifice-aura→extra-combat-loop'));
assert.deepEqual(combatSacrificeAuraLoop.proofDeltaClasses, ['combat', 'infinite-death', 'infinite-ltb', 'infinite-sacrifice', 'infinite-untap']);
assert.equal(combatSacrificeAuraLoop.proofOnlyResultCoverage.coveredAny, true);
assert.equal(combatSacrificeAuraLoop.resultCoverage.coveredAny, true);
assert.equal(combatSacrificeAuraLoop.modelClasses.includes('infinite-mana'), false);
assert.equal(combatSacrificeAuraLoop.modelClasses.includes('infinite-damage'), false);
assert.equal(combatSacrificeAuraLoop.modelClasses.includes('infinite-tokens'), false);

const breathShapedAuraLoop = evaluateCombo({
  id: 'breath-shaped-aura-loop',
  detailPath: '/combos/test/breath-shaped-aura-loop',
  url: 'https://example.test/breath-shaped-aura-loop',
  cards: ['Breath-Shaped Aura', 'Fresh Combat Carrier Source'],
  cardCount: 2,
  results: ['Infinite combat phases', 'Infinite sacrifice triggers', 'Infinite LTB', 'Infinite death triggers', 'Infinite untap'],
  categories: ['test'],
  metadata: { deckCount: 4 },
}, idx);
assert.equal(breathShapedAuraLoop.bucket, 'proved');
assert.ok(breathShapedAuraLoop.proofOnlyFamilies.includes('combat-sacrifice-aura→extra-combat-loop'));
assert.deepEqual(breathShapedAuraLoop.proofDeltaClasses, ['combat', 'infinite-death', 'infinite-ltb', 'infinite-sacrifice', 'infinite-untap']);

const combatSacrificeAuraStaleCarrierNearMiss = evaluateCombo({
  id: 'combat-sacrifice-aura-stale-carrier-near-miss',
  detailPath: '/combos/test/combat-sacrifice-aura-stale-carrier-near-miss',
  url: 'https://example.test/combat-sacrifice-aura-stale-carrier-near-miss',
  cards: ['Combat Sacrifice Aura', 'Stale Carrier Source'],
  cardCount: 2,
  results: ['Infinite combat phases'],
  categories: ['test'],
  metadata: { deckCount: 1 },
}, idx);
assert.notEqual(combatSacrificeAuraStaleCarrierNearMiss.bucket, 'proved');
assert.ok(!combatSacrificeAuraStaleCarrierNearMiss.proofOnlyFamilies.includes('combat-sacrifice-aura→extra-combat-loop'));
assert.ok(!combatSacrificeAuraStaleCarrierNearMiss.modelClasses.includes('combat'));
assert.equal(combatSacrificeAuraStaleCarrierNearMiss.resultCoverage.coveredAny, false);

const breathShapedAuraFirstCombatOnlyNearMiss = evaluateCombo({
  id: 'breath-shaped-aura-first-combat-only-near-miss',
  detailPath: '/combos/test/breath-shaped-aura-first-combat-only-near-miss',
  url: 'https://example.test/breath-shaped-aura-first-combat-only-near-miss',
  cards: ['Breath-Shaped Aura', 'First Combat Only Carrier Source'],
  cardCount: 2,
  results: ['Infinite combat phases'],
  categories: ['test'],
  metadata: { deckCount: 1 },
}, idx);
assert.notEqual(breathShapedAuraFirstCombatOnlyNearMiss.bucket, 'proved');
assert.ok(!breathShapedAuraFirstCombatOnlyNearMiss.proofOnlyFamilies.includes('combat-sacrifice-aura→extra-combat-loop'));
assert.equal(breathShapedAuraFirstCombatOnlyNearMiss.resultCoverage.coveredAny, false);

const combatTreasureExtraCombatLoop = evaluateCombo({
  id: 'combat-treasure-extra-combat-loop',
  detailPath: '/combos/test/combat-treasure-extra-combat-loop',
  url: 'https://example.test/combat-treasure-extra-combat-loop',
  cards: ['Combat Treasure Equipment', 'Generic Extra Combat Activator'],
  cardCount: 2,
  results: ['Infinite combat phases'],
  categories: ['test'],
  metadata: { deckCount: 4 },
}, idx);
assert.equal(combatTreasureExtraCombatLoop.bucket, 'proved');
assert.ok(combatTreasureExtraCombatLoop.familySignals.includes('combat-resource→extra-combat-loop'));
assert.deepEqual(combatTreasureExtraCombatLoop.proofDeltaClasses, ['combat']);
assert.deepEqual(combatTreasureExtraCombatLoop.modelClasses, ['combat']);
assert.equal(combatTreasureExtraCombatLoop.resultCoverage.coveredAny, true);

const combatLandUntapExtraCombatLoop = evaluateCombo({
  id: 'combat-land-untap-extra-combat-loop',
  detailPath: '/combos/test/combat-land-untap-extra-combat-loop',
  url: 'https://example.test/combat-land-untap-extra-combat-loop',
  cards: ['Combat Land Untap Equipment', 'Generic Extra Combat Activator'],
  cardCount: 2,
  results: ['Infinite combat phases', 'Infinite untap'],
  categories: ['test'],
  metadata: { deckCount: 4 },
}, idx);
assert.equal(combatLandUntapExtraCombatLoop.bucket, 'proved');
assert.ok(combatLandUntapExtraCombatLoop.familySignals.includes('combat-resource→extra-combat-loop'));
assert.deepEqual(combatLandUntapExtraCombatLoop.proofDeltaClasses, ['combat', 'infinite-untap']);
assert.deepEqual(combatLandUntapExtraCombatLoop.modelClasses, ['combat', 'infinite-untap']);
assert.equal(combatLandUntapExtraCombatLoop.resultCoverage.coveredAny, true);

const randomTreasureExtraCombatNearMiss = evaluateCombo({
  id: 'random-treasure-extra-combat-near-miss',
  detailPath: '/combos/test/random-treasure-extra-combat-near-miss',
  url: 'https://example.test/random-treasure-extra-combat-near-miss',
  cards: ['Random Treasure Dragon', 'Generic Extra Combat Activator'],
  cardCount: 2,
  results: ['Infinite combat phases'],
  categories: ['test'],
  metadata: { deckCount: 1 },
}, idx);
assert.notEqual(randomTreasureExtraCombatNearMiss.bucket, 'proved');
assert.ok(!randomTreasureExtraCombatNearMiss.familySignals.includes('combat-resource→extra-combat-loop'));
assert.ok(!randomTreasureExtraCombatNearMiss.modelClasses.includes('combat'));
assert.equal(randomTreasureExtraCombatNearMiss.resultCoverage.coveredAny, false);

const noUntapExtraCombatNearMiss = evaluateCombo({
  id: 'no-untap-extra-combat-near-miss',
  detailPath: '/combos/test/no-untap-extra-combat-near-miss',
  url: 'https://example.test/no-untap-extra-combat-near-miss',
  cards: ['Combat Treasure Equipment', 'Extra Combat Without Untap'],
  cardCount: 2,
  results: ['Infinite combat phases'],
  categories: ['test'],
  metadata: { deckCount: 1 },
}, idx);
assert.notEqual(noUntapExtraCombatNearMiss.bucket, 'proved');
assert.ok(!noUntapExtraCombatNearMiss.familySignals.includes('combat-resource→extra-combat-loop'));
assert.ok(!noUntapExtraCombatNearMiss.modelClasses.includes('combat'));
assert.equal(noUntapExtraCombatNearMiss.resultCoverage.coveredAny, false);

const noMainPhaseExtraCombatNearMiss = evaluateCombo({
  id: 'no-main-phase-extra-combat-near-miss',
  detailPath: '/combos/test/no-main-phase-extra-combat-near-miss',
  url: 'https://example.test/no-main-phase-extra-combat-near-miss',
  cards: ['Combat Treasure Equipment', 'Extra Combat Without Main'],
  cardCount: 2,
  results: ['Infinite combat phases'],
  categories: ['test'],
  metadata: { deckCount: 1 },
}, idx);
assert.notEqual(noMainPhaseExtraCombatNearMiss.bucket, 'proved');
assert.ok(!noMainPhaseExtraCombatNearMiss.familySignals.includes('combat-resource→extra-combat-loop'));
assert.ok(!noMainPhaseExtraCombatNearMiss.modelClasses.includes('combat'));
assert.equal(noMainPhaseExtraCombatNearMiss.resultCoverage.coveredAny, false);

const attackTriggeredExtraCombatNearMiss = evaluateCombo({
  id: 'attack-triggered-extra-combat-near-miss',
  detailPath: '/combos/test/attack-triggered-extra-combat-near-miss',
  url: 'https://example.test/attack-triggered-extra-combat-near-miss',
  cards: ['Combat Treasure Equipment', 'Attack Triggered Extra Combat'],
  cardCount: 2,
  results: ['Infinite combat phases'],
  categories: ['test'],
  metadata: { deckCount: 1 },
}, idx);
assert.notEqual(attackTriggeredExtraCombatNearMiss.bucket, 'proved');
assert.ok(!attackTriggeredExtraCombatNearMiss.familySignals.includes('combat-resource→extra-combat-loop'));
assert.ok(!attackTriggeredExtraCombatNearMiss.modelClasses.includes('combat'));
assert.equal(attackTriggeredExtraCombatNearMiss.resultCoverage.coveredAny, false);

const tappedArtifactExtraCombatNearMiss = evaluateCombo({
  id: 'tapped-artifact-extra-combat-near-miss',
  detailPath: '/combos/test/tapped-artifact-extra-combat-near-miss',
  url: 'https://example.test/tapped-artifact-extra-combat-near-miss',
  cards: ['Combat Treasure Equipment', 'Tapped Artifact Extra Combat'],
  cardCount: 2,
  results: ['Infinite combat phases'],
  categories: ['test'],
  metadata: { deckCount: 1 },
}, idx);
assert.notEqual(tappedArtifactExtraCombatNearMiss.bucket, 'proved');
assert.ok(!tappedArtifactExtraCombatNearMiss.familySignals.includes('combat-resource→extra-combat-loop'));
assert.ok(!tappedArtifactExtraCombatNearMiss.modelClasses.includes('combat'));
assert.equal(tappedArtifactExtraCombatNearMiss.resultCoverage.coveredAny, false);

const artifactTokenExtraTurnLoop = evaluateCombo({
  id: 'artifact-token-extra-turn-loop',
  detailPath: '/combos/test/artifact-token-extra-turn-loop',
  url: 'https://example.test/artifact-token-extra-turn-loop',
  cards: ['Upkeep Artifact Token Engine', 'Artifact Sacrifice Extra-Turn Engine'],
  cardCount: 2,
  results: ['Infinite turns'],
  categories: ['test'],
  metadata: { deckCount: 4 },
}, idx);
assert.equal(artifactTokenExtraTurnLoop.bucket, 'proved');
assert.ok(artifactTokenExtraTurnLoop.familySignals.includes('artifact-token→extra-turn-loop'));
assert.deepEqual(artifactTokenExtraTurnLoop.proofDeltaClasses, ['infinite-turns']);
assert.deepEqual(artifactTokenExtraTurnLoop.modelClasses, ['infinite-turns']);
assert.equal(artifactTokenExtraTurnLoop.resultCoverage.coveredAny, true);

const replacementAmplifiedArtifactExtraTurnNearMiss = evaluateCombo({
  id: 'replacement-amplified-artifact-extra-turn-near-miss',
  detailPath: '/combos/test/replacement-amplified-artifact-extra-turn-near-miss',
  url: 'https://example.test/replacement-amplified-artifact-extra-turn-near-miss',
  cards: ['Four Artifact Token Engine', 'Token Doubler', 'Artifact Sacrifice Extra-Turn Engine'],
  cardCount: 3,
  results: ['Infinite turns'],
  categories: ['test'],
  metadata: { deckCount: 1 },
}, idx);
assert.notEqual(replacementAmplifiedArtifactExtraTurnNearMiss.bucket, 'proved');
assert.ok(!replacementAmplifiedArtifactExtraTurnNearMiss.familySignals.includes('artifact-token→extra-turn-loop'));
assert.ok(!replacementAmplifiedArtifactExtraTurnNearMiss.modelClasses.includes('infinite-turns'));
assert.equal(replacementAmplifiedArtifactExtraTurnNearMiss.resultCoverage.coveredAny, false);

const oncePerTurnArtifactTokenSourceExtraTurnNearMiss = evaluateCombo({
  id: 'once-per-turn-artifact-token-source-extra-turn-near-miss',
  detailPath: '/combos/test/once-per-turn-artifact-token-source-extra-turn-near-miss',
  url: 'https://example.test/once-per-turn-artifact-token-source-extra-turn-near-miss',
  cards: ['Once Per Turn Upkeep Artifact Token Engine', 'Artifact Sacrifice Extra-Turn Engine'],
  cardCount: 2,
  results: ['Infinite turns'],
  categories: ['test'],
  metadata: { deckCount: 1 },
}, idx);
assert.notEqual(oncePerTurnArtifactTokenSourceExtraTurnNearMiss.bucket, 'proved');
assert.ok(!oncePerTurnArtifactTokenSourceExtraTurnNearMiss.familySignals.includes('artifact-token→extra-turn-loop'));
assert.ok(!oncePerTurnArtifactTokenSourceExtraTurnNearMiss.modelClasses.includes('infinite-turns'));
assert.equal(oncePerTurnArtifactTokenSourceExtraTurnNearMiss.resultCoverage.coveredAny, false);

const oncePerTurnArtifactExtraTurnNearMiss = evaluateCombo({
  id: 'once-per-turn-artifact-extra-turn-near-miss',
  detailPath: '/combos/test/once-per-turn-artifact-extra-turn-near-miss',
  url: 'https://example.test/once-per-turn-artifact-extra-turn-near-miss',
  cards: ['Upkeep Artifact Token Engine', 'Once Per Turn Artifact Sacrifice Extra-Turn Engine'],
  cardCount: 2,
  results: ['Infinite turns'],
  categories: ['test'],
  metadata: { deckCount: 1 },
}, idx);
assert.notEqual(oncePerTurnArtifactExtraTurnNearMiss.bucket, 'proved');
assert.ok(!oncePerTurnArtifactExtraTurnNearMiss.familySignals.includes('artifact-token→extra-turn-loop'));
assert.ok(!oncePerTurnArtifactExtraTurnNearMiss.modelClasses.includes('infinite-turns'));
assert.equal(oncePerTurnArtifactExtraTurnNearMiss.resultCoverage.coveredAny, false);

const endStepArtifactTokenExtraTurnNearMiss = evaluateCombo({
  id: 'end-step-artifact-token-extra-turn-near-miss',
  detailPath: '/combos/test/end-step-artifact-token-extra-turn-near-miss',
  url: 'https://example.test/end-step-artifact-token-extra-turn-near-miss',
  cards: ['End Step Artifact Token Engine', 'Artifact Sacrifice Extra-Turn Engine'],
  cardCount: 2,
  results: ['Infinite turns'],
  categories: ['test'],
  metadata: { deckCount: 1 },
}, idx);
assert.notEqual(endStepArtifactTokenExtraTurnNearMiss.bucket, 'proved');
assert.ok(!endStepArtifactTokenExtraTurnNearMiss.familySignals.includes('artifact-token→extra-turn-loop'));
assert.ok(!endStepArtifactTokenExtraTurnNearMiss.modelClasses.includes('infinite-turns'));
assert.equal(endStepArtifactTokenExtraTurnNearMiss.resultCoverage.coveredAny, false);

const millLifeLossLoop = evaluateCombo({
  id: 'mill-lifeloss-loop',
  detailPath: '/combos/test/mill-lifeloss-loop',
  url: 'https://example.test/mill-lifeloss-loop',
  cards: ['Mill To Life Loss Payoff', 'Life Loss To Mill Payoff'],
  cardCount: 2,
  results: ['Infinite mill', 'Infinite lifeloss', 'Infinite lifegain'],
  categories: ['test'],
  metadata: { deckCount: 4 },
}, idx);
assert.equal(millLifeLossLoop.bucket, 'proved');
assert.ok(millLifeLossLoop.familySignals.includes('mill-lifeloss-feedback-loop'));
assert.equal(millLifeLossLoop.resultCoverage.coveredAny, true);

const opponentDrawPunisherWin = evaluateCombo({
  id: 'opponent-draw-punisher-win',
  detailPath: '/combos/test/opponent-draw-punisher-win',
  url: 'https://example.test/opponent-draw-punisher-win',
  cards: ['Opponent Half-Library Draw', 'Opponent Draw Punisher'],
  cardCount: 2,
  results: ['Win the game'],
  categories: ['test'],
  metadata: { deckCount: 3 },
}, idx);
assert.equal(opponentDrawPunisherWin.bucket, 'proved');
assert.ok(opponentDrawPunisherWin.familySignals.includes('opponent-draw-punisher-win'));
assert.equal(opponentDrawPunisherWin.resultCoverage.coveredAny, true);

const millMultiplierFinisher = evaluateCombo({
  id: 'mill-multiplier-finisher',
  detailPath: '/combos/test/mill-multiplier-finisher',
  url: 'https://example.test/mill-multiplier-finisher',
  cards: ['Half-Library Mill', 'Mill Multiplier'],
  cardCount: 2,
  results: ['Mill all opponents'],
  categories: ['test'],
  metadata: { deckCount: 3 },
}, idx);
assert.equal(millMultiplierFinisher.bucket, 'proved');
assert.ok(millMultiplierFinisher.familySignals.includes('mill-multiplier-finite-mill'));
assert.equal(millMultiplierFinisher.resultCoverage.coveredAny, true);

const delayedMillEqualizerFinisher = evaluateCombo({
  id: 'delayed-mill-equalizer-finisher',
  detailPath: '/combos/test/delayed-mill-equalizer-finisher',
  url: 'https://example.test/delayed-mill-equalizer-finisher',
  cards: ['Half-Library Mill', 'Delayed Mill Equalizer'],
  cardCount: 2,
  results: ['Infinite mill'],
  categories: ['test'],
  metadata: { deckCount: 3 },
}, idx);
assert.equal(delayedMillEqualizerFinisher.bucket, 'proved');
assert.ok(delayedMillEqualizerFinisher.familySignals.includes('delayed-mill-equalizer-finite-mill'));
assert.equal(delayedMillEqualizerFinisher.resultCoverage.coveredAny, true);

const mutualEtbBlinkLoop = evaluateCombo({
  id: 'mutual-etb-blink-loop',
  detailPath: '/combos/test/mutual-etb-blink-loop',
  url: 'https://example.test/mutual-etb-blink-loop',
  cards: ['ETB Creature Blinker', 'ETB Permanent Blinker'],
  cardCount: 2,
  results: ['Infinite ETB triggers'],
  categories: ['test'],
  metadata: { deckCount: 2 },
}, idx);
assert.equal(mutualEtbBlinkLoop.bucket, 'proved');
assert.ok(mutualEtbBlinkLoop.familySignals.includes('mutual-etb-blink-reset-loop'));
assert.equal(mutualEtbBlinkLoop.resultCoverage.coveredAny, true);

const tokenReplacementSacLoop = evaluateCombo({
  id: 'token-replacement-sac-loop',
  detailPath: '/combos/test/token-replacement-sac-loop',
  url: 'https://example.test/token-replacement-sac-loop',
  cards: ['Creature-Token Replacement Outlet', 'Death Mana Payoff'],
  cardCount: 2,
  results: ['Infinite death triggers', 'Infinite sacrifice triggers', 'Infinite tokens'],
  categories: ['test'],
  metadata: { deckCount: 2 },
}, idx);
assert.equal(tokenReplacementSacLoop.bucket, 'proved');
assert.ok(tokenReplacementSacLoop.familySignals.includes('token-replacement-sacrifice-mana-loop'));
assert.equal(tokenReplacementSacLoop.resultCoverage.coveredAny, true);

const aristocratsDrainLoop = evaluateCombo({
  id: 'aristocrats-drain-loop',
  detailPath: '/combos/test/aristocrats-drain-loop',
  url: 'https://example.test/aristocrats-drain-loop',
  cards: ['Aristocrats Token Body', 'Free Creature Sac Outlet', 'Death Drain Payoff'],
  cardCount: 3,
  results: ['Infinite death triggers', 'Infinite sacrifice triggers', 'Infinite lifegain', 'Infinite lifeloss'],
  categories: ['test'],
  metadata: { deckCount: 2 },
}, idx);
assert.equal(aristocratsDrainLoop.bucket, 'proved');
assert.ok(aristocratsDrainLoop.familySignals.includes('aristocrats-body-outlet-payoff'));
assert.ok(aristocratsDrainLoop.proofDeltaClasses.includes('infinite-life'));
assert.ok(aristocratsDrainLoop.proofDeltaClasses.includes('infinite-opponent-life-loss'));
assert.equal(aristocratsDrainLoop.resultCoverage.coveredAny, true);

const lifePaidTreasureRecursiveDrainLoop = evaluateCombo({
  id: 'life-paid-treasure-recursive-drain-loop',
  detailPath: '/combos/test/life-paid-treasure-recursive-drain-loop',
  url: 'https://example.test/life-paid-treasure-recursive-drain-loop',
  cards: ['Typed Recursive Cast Body', 'Life-Paid Treasure Outlet', 'Death Drain Payoff'],
  cardCount: 3,
  results: ['Infinite death triggers', 'Infinite ETB', 'Infinite lifegain', 'Infinite lifeloss', 'Infinite sacrifice triggers', 'Infinite storm count'],
  categories: ['test'],
  metadata: { deckCount: 2 },
}, idx);
assert.equal(lifePaidTreasureRecursiveDrainLoop.bucket, 'proved');
assert.ok(lifePaidTreasureRecursiveDrainLoop.familySignals.includes('life-paid-treasure-recursive-drain-loop'));
assert.ok(!lifePaidTreasureRecursiveDrainLoop.proofDeltaClasses.includes('infinite-life'));
assert.equal(lifePaidTreasureRecursiveDrainLoop.resultCoverage.coveredAny, true);

const mutualEtbBlinkDfcNearMiss = evaluateCombo({
  id: 'mutual-etb-blink-dfc-near-miss',
  detailPath: '/combos/test/mutual-etb-blink-dfc-near-miss',
  url: 'https://example.test/mutual-etb-blink-dfc-near-miss',
  cards: ['ETB Creature Blinker', 'Artifact Blinker'],
  cardCount: 2,
  results: ['Infinite ETB triggers'],
  categories: ['test'],
  metadata: { deckCount: 1 },
}, idx);
assert.equal(mutualEtbBlinkDfcNearMiss.resolvedAll, true);
assert.ok(!mutualEtbBlinkDfcNearMiss.familySignals.includes('mutual-etb-blink-reset-loop'));
assert.ok(!mutualEtbBlinkDfcNearMiss.proofOnlyFamilies.includes('mutual-etb-blink-reset-loop'));

const recursiveDfcPreconditionNearMiss = evaluateCombo({
  id: 'recursive-dfc-precondition-near-miss',
  detailPath: '/combos/test/recursive-dfc-precondition-near-miss',
  url: 'https://example.test/recursive-dfc-precondition-near-miss',
  cards: ['Conditional Recursive Body', 'Artifact Outlet'],
  cardCount: 2,
  results: ['Infinite death triggers'],
  categories: ['test'],
  metadata: { deckCount: 1 },
}, idx);
assert.equal(recursiveDfcPreconditionNearMiss.resolvedAll, true);
assert.ok(!recursiveDfcPreconditionNearMiss.familySignals.includes('recursive-body-sacrifice-mana-loop'));
assert.ok(!recursiveDfcPreconditionNearMiss.proofOnlyFamilies.includes('recursive-body-sacrifice-mana-loop'));

const recursiveDfcPreconditionWithSupport = evaluateCombo({
  id: 'recursive-dfc-precondition-with-support',
  detailPath: '/combos/test/recursive-dfc-precondition-with-support',
  url: 'https://example.test/recursive-dfc-precondition-with-support',
  cards: ['Conditional Recursive Body', 'Artifact Outlet', 'Separate Creature Support'],
  cardCount: 3,
  results: ['Infinite death triggers', 'Infinite sacrifice triggers'],
  categories: ['test'],
  metadata: { deckCount: 1 },
}, idx);
assert.equal(recursiveDfcPreconditionWithSupport.bucket, 'proved');
assert.ok(recursiveDfcPreconditionWithSupport.familySignals.includes('recursive-body-sacrifice-mana-loop'));
assert.ok(recursiveDfcPreconditionWithSupport.proofOnlyFamilies.includes('recursive-body-sacrifice-mana-loop'));

const miss = evaluateCombo({
  id: 'miss',
  detailPath: '/combos/test/miss',
  url: 'https://example.test/miss',
  cards: ['Blank Rock', 'Missing Card'],
  cardCount: 2,
  results: ['Infinite mana'],
  categories: ['test'],
  metadata: { deckCount: 1 },
}, idx);
assert.equal(miss.bucket, 'missing-card');
assert.deepEqual(miss.missing, ['Missing Card']);

const unmappedOnly = evaluateCombo({
  id: 'unmapped-only',
  detailPath: '/combos/test/unmapped-only',
  url: 'https://example.test/unmapped-only',
  cards: ['Blank Rock'],
  cardCount: 1,
  results: ['Infinite LTB'],
  categories: ['test'],
  metadata: { deckCount: 1 },
}, idx);
assert.deepEqual(unmappedOnly.expectedClasses, ['infinite-ltb']);
assert.deepEqual(unmappedOnly.unmappedLabels, []);
assert.equal(unmappedOnly.resultCoverage.coveredAny, false);

const edgeBridgedSacrificeInteraction = evaluateCombo({
  id: 'edge-bridged-sacrifice-interaction',
  detailPath: '/combos/test/edge-bridged-sacrifice-interaction',
  url: 'https://example.test/edge-bridged-sacrifice-interaction',
  cards: ['Aristocrats Token Body', 'Free Creature Sac Outlet'],
  cardCount: 2,
  results: ['Infinite sacrifice triggers', 'Infinite LTB'],
  categories: ['test'],
  metadata: { deckCount: 1 },
}, idx);
assert.equal(edgeBridgedSacrificeInteraction.proofStatus, 'no-proof');
assert.equal(edgeBridgedSacrificeInteraction.bucket, 'classified-not-proven');
assert.ok(edgeBridgedSacrificeInteraction.edgeSignalFamilies.includes('sac-fodder→outlet'));
assert.ok(edgeBridgedSacrificeInteraction.edgeSignalClasses.includes('infinite-sacrifice'));
assert.ok(edgeBridgedSacrificeInteraction.edgeSignalClasses.includes('infinite-ltb'));
assert.equal(edgeBridgedSacrificeInteraction.resultCoverage.coveredAny, true);

const edgeBridgeNegative = evaluateCombo({
  id: 'edge-bridge-negative',
  detailPath: '/combos/test/edge-bridge-negative',
  url: 'https://example.test/edge-bridge-negative',
  cards: ['Aristocrats Token Body', 'Free Creature Sac Outlet'],
  cardCount: 2,
  results: ['Infinite colorless mana'],
  categories: ['test'],
  metadata: { deckCount: 1 },
}, idx);
assert.equal(edgeBridgeNegative.bucket, 'classified-not-proven');
assert.ok(edgeBridgeNegative.edgeSignalFamilies.includes('sac-fodder→outlet'));
assert.equal(edgeBridgeNegative.resultCoverage.coveredAny, false, 'sacrifice edge signals must not imply unrelated mana results');

const summary = summarizeEvaluations([
  lifeLoop,
  fixedLifeLoop,
  drawDamageLoop,
  lifelinkCounterDamageLoop,
  lifePaidDamageRecoveryLoop,
  counterTokenEtbCounterLoop,
  minusCounterDeathTokenLoop,
  lifegainCounterTokenEtbLoop,
  intrinsicDeathUntapPingerLock,
  grantedDeathUntapPingerLock,
  exileRecastCreatureManaLoop,
  deathCopySpellEtbCopyLoop,
  recursiveSacLoop,
  layeredRecursiveSacLoop,
  hastyCopyLoop,
  combatSacrificeAuraLoop,
  amplifiedSelfUntapLoop,
  anyTypeAmplifiedSelfUntapLoop,
  millLifeLossLoop,
  opponentDrawPunisherWin,
  millMultiplierFinisher,
  delayedMillEqualizerFinisher,
  mutualEtbBlinkLoop,
  tokenReplacementSacLoop,
  miss,
], { source: 'fixture' });
assert.equal(summary.totalDetailed, 25);
assert.equal(summary.byBucket.proved, 24);
assert.equal(summary.byBucket['missing-card'], 1);
assert.equal(summary.proofOnlyExpectedClassCoverage.considered, 25);
assert.equal(summary.proofOnlyExpectedClassCoverage.coveredAny, 23);
assert.equal(summary.proofOnlyExpectedClassCoverage.coveredAnyPct, 92);
assert.equal(summary.byExpectedClass.lock, 2);
assert.equal(summary.byModelClass.lock, 2);
assert.equal(summary.topFamilySignals['death-untap-deathtouch-pinger-lock'], 2);
assert.equal(summary.coverageBlockers.totalExpectedMisses, summary.expectedClassCoverage.missedAll);
const blockerSummary = summarizeEvaluations([counterTokenColorNearMiss, edgeBridgeNegative, miss], { source: 'fixture' });
assert.equal(blockerSummary.coverageBlockers.totalExpectedMisses, blockerSummary.expectedClassCoverage.missedAll);
assert.ok(blockerSummary.coverageBlockers.byBlocker['missing-card-data'] >= 1);
assert.equal(
  Object.values(blockerSummary.coverageBlockers.byBlocker).reduce((sum, count) => sum + count, 0),
  blockerSummary.coverageBlockers.totalExpectedMisses,
);
const taxonomyGapSummary = summarizeEvaluations([unmappedOnly], { source: 'fixture' });
assert.equal(taxonomyGapSummary.unmappedResultLabels.combosWithAny, 0);
assert.equal(taxonomyGapSummary.unmappedResultLabels.labelInstances, 0);
assert.equal(taxonomyGapSummary.expectedClassCoverage.coveredAny, 0);
assert.ok(renderMarkdown({ summary, edgeCases: [] }).includes('EDHREC combo model baseline'));
assert.ok(renderMarkdown({ summary, edgeCases: [] }).includes('Proof-only expected result-class coverage'));
assert.ok(renderMarkdown({ summary: taxonomyGapSummary, edgeCases: [] }).includes('Unmapped EDHREC result labels'));

process.stdout.write('EDHREC combo evaluator tests passed\n');
