const assert = require('node:assert/strict');
const {
  PROOF_PACKAGE_SCHEMA_FIELDS,
  PROOF_PACKAGE_SCHEMA_VERSION,
  buildInteractionProofPackages,
  seedCandidates,
} = require('../src/interaction-proof-packages');
const { buildInteractionIndexes } = require('../src/interaction-indexes');
const { provePackage } = require('../src/interaction-proof-search');
const { build } = require('../src/build-deck-viz');

const fixtures = [
  { id: 'Self Untap Dork', type_line: 'Creature — Elf Druid', oracle_text: '{T}: Add {G}{G}. {0}: Untap this creature.', cmc: 2 },
  { id: 'Deadeye Navigator', type_line: 'Creature — Spirit', oracle_text: '{1}{U}: Exile another target creature you control, then return it to the battlefield under your control.', cmc: 6 },
  { id: 'Peregrine Drake', type_line: 'Creature — Drake', oracle_text: 'Flying When this creature enters, untap up to five lands.', cmc: 5 },
  { id: 'Sanguine Bond', type_line: 'Enchantment', oracle_text: 'Whenever you gain life, target opponent loses that much life.', cmc: 5 },
  { id: 'Fixed Gain Converts To Loss', type_line: 'Creature — Cleric', oracle_text: 'Whenever you gain life, each opponent loses 1 life.', cmc: 3 },
  { id: 'Exquisite Blood', type_line: 'Enchantment', oracle_text: 'Whenever an opponent loses life, you gain that much life.', cmc: 5 },
  { id: 'Draw Damage Engine', type_line: 'Legendary Creature — Wizard', oracle_text: 'Whenever you draw a card, this creature deals 1 damage to any target.', cmc: 6 },
  { id: 'Opponent Draw Damage Engine', type_line: 'Creature — Devil', oracle_text: 'Whenever an opponent draws a card, this creature deals 1 damage to any target.', cmc: 3 },
  { id: 'Damage Draw Aura', type_line: 'Enchantment — Aura', oracle_text: 'Enchant creature\nWhenever enchanted creature deals damage to an opponent, you may draw a card.', cmc: 1 },
  { id: 'Lifelink Counter Engine', type_line: 'Enchantment Creature — God', oracle_text: 'Whenever you gain life, put a +1/+1 counter on target creature or enchantment you control. {1}{W}: Another target creature gains lifelink until end of turn.', cmc: 3 },
  { id: 'Counter Damage Creature', type_line: 'Artifact Creature — Construct', oracle_text: 'This creature enters with X +1/+1 counters on it. Remove a +1/+1 counter from this creature: It deals 1 damage to any target.', cmc: 0 },
  { id: 'Life-Paid Damage Source', type_line: 'Artifact', oracle_text: 'Pay 50 life: This artifact deals 50 damage to any target.', cmc: 4 },
  { id: 'Opponent Loss Lifegain Payoff', type_line: 'Enchantment', oracle_text: 'Whenever an opponent loses life, you gain that much life.', cmc: 5 },
  { id: 'Counter Token Engine', type_line: 'Creature — Plant', oracle_text: 'Whenever one or more +1/+1 counters are put on this creature, create a 1/1 green Saproling creature token.', cmc: 3 },
  { id: 'Green ETB Counter Granter', type_line: 'Creature — Elf', oracle_text: 'Whenever another green creature you control enters, put a +1/+1 counter on target creature.', cmc: 4 },
  { id: 'Minus Counter Death Spreader', type_line: 'Enchantment', oracle_text: 'Whenever a creature dies, if it had a -1/-1 counter on it, put a -1/-1 counter on target creature.', cmc: 3 },
  { id: 'Minus Counter Token Engine', type_line: 'Enchantment', oracle_text: 'Whenever you put one or more -1/-1 counters on a creature, create that many 1/1 black Insect creature tokens.', cmc: 3 },
  { id: 'Named Counter Token Engine', type_line: 'Creature — Treefolk', oracle_text: 'Whenever one or more +1/+1 counters are put on Named Counter Token Engine, create a 1/1 green Squirrel creature token.', cmc: 3 },
  { id: 'Lifegain Counter Payoff', type_line: 'Enchantment Creature — God', oracle_text: 'Whenever you gain life, put a +1/+1 counter on target creature or enchantment you control.', cmc: 3 },
  { id: 'Creature ETB Lifegain Payoff', type_line: 'Creature — Cleric', oracle_text: 'Whenever another creature enters the battlefield under your control, you gain 1 life.', cmc: 1 },
  { id: 'Death Untap Pinger', type_line: 'Creature — Goblin', oracle_text: "This creature doesn't untap during your untap step. Whenever a creature dies, untap this creature. {T}: This creature deals 1 damage to any target.", cmc: 3 },
  { id: 'Deathtouch Equipment', type_line: 'Artifact — Equipment', oracle_text: 'Equipped creature has deathtouch. Equip {2}', cmc: 1 },
  { id: 'Free Ping Equipment', type_line: 'Artifact — Equipment', oracle_text: 'Equipped creature has "{T}: This creature deals 1 damage to any target." Equip {3}', cmc: 1 },
  { id: 'Death Untap Equipment', type_line: 'Artifact — Equipment', oracle_text: 'Equipped creature has "Whenever a creature dies, untap this creature." Equip {4}', cmc: 2 },
  { id: 'Once-Per-Turn Death Untap Equipment', type_line: 'Artifact — Equipment', oracle_text: 'Equipped creature has "Whenever a creature dies, untap this creature. This ability triggers only once each turn." Equip {4}', cmc: 2 },
  { id: 'Costed Ping Equipment', type_line: 'Artifact — Equipment', oracle_text: 'Equipped creature has "{1}, {T}: This creature deals 1 damage to any target." Equip {2}', cmc: 1 },
  { id: 'Self Top Draw Artifact', type_line: 'Artifact', oracle_text: '{1}: Draw a card, then put this artifact on top of its owner’s library.', cmc: 1 },
  { id: 'Artifact Spell Reducer', type_line: 'Artifact Creature — Vedalken Artificer', oracle_text: 'Artifact spells you cast cost {1} less to cast.', cmc: 2 },
  { id: 'Artifact Top Caster', type_line: 'Artifact', oracle_text: 'You may look at the top card of your library any time. You may cast artifact spells from the top of your library.', cmc: 4 },
  { id: 'Recursive Body', type_line: 'Creature — Zombie', oracle_text: 'You may cast this card from your graveyard.', cmc: 1, mana_cost: '{B}' },
  { id: 'Mana Sac Outlet', type_line: 'Artifact', oracle_text: 'Sacrifice a creature: Add one mana of any color.', cmc: 3 },
  { id: 'Repeat Library Exiler', type_line: 'Instant', oracle_text: 'Exile the top card of your library. You may put that card into your hand unless it has the same name as another card exiled this way. Repeat this process until you put a card into your hand or exile two cards with the same name.', cmc: 2 },
  { id: 'Empty Library Oracle', type_line: 'Creature — Merfolk Wizard', oracle_text: 'When this creature enters, look at the top X cards of your library, where X is your devotion to blue. If X is greater than or equal to the number of cards in your library, you win the game.', cmc: 2 },
  { id: 'Nonland Untap Spell', type_line: 'Instant', oracle_text: 'Untap all nonland permanents you control.', cmc: 2 },
  { id: 'Repeatable Instant Caster', type_line: 'Artifact', oracle_text: 'Imprint — When this artifact enters, you may exile an instant card with mana value 2 or less from your hand. {2}, {T}: You may copy the exiled card. If you do, you may cast the copy without paying its mana cost.', cmc: 2 },
  { id: 'Ability Copier', type_line: 'Artifact', oracle_text: "Whenever you activate an ability, if it isn't a mana ability, you may pay {2}. If you do, copy that ability.", cmc: 3 },
  { id: 'Self Untap Mana Rock', type_line: 'Artifact', oracle_text: '{T}: Add {C}{C}{C}. {3}: Untap this artifact.', cmc: 3 },
  { id: 'Hasty Copy Engine', type_line: 'Legendary Creature — Goblin Shaman', oracle_text: "{T}: Create a token that's a copy of target nonlegendary creature you control, except it has haste.", cmc: 5 },
  { id: 'Permanent Untapper', type_line: 'Creature — Human Warrior', oracle_text: 'When this creature enters, gain control of target permanent until end of turn. Untap that permanent. It gains haste until end of turn.', cmc: 5 },
  { id: 'ETB Spell Copier', type_line: 'Creature — Human Wizard', oracle_text: 'Flash When this creature enters, copy target instant or sorcery spell. You may choose new targets for the copy.', cmc: 3 },
  { id: 'Hasty Creature Copy Spell', type_line: 'Sorcery', oracle_text: "Choose target creature you control. Create a token that's a copy of that creature, except it has haste. Exile it at the beginning of the next end step.", cmc: 2 },
  { id: 'Death-Copy Creature Spell', type_line: 'Instant', oracle_text: 'Destroy target creature. If that creature dies this way, its controller creates two tokens that are copies of that creature.', cmc: 3 },
  { id: 'Self-Copying Targeted Spell', type_line: 'Sorcery', oracle_text: 'Target player discards two cards. That player may copy this spell and may choose a new target for that copy.', cmc: 2 },
  { id: 'Magecraft Drain Payoff', type_line: 'Creature — Human Druid', oracle_text: 'Magecraft — Whenever you cast or copy an instant or sorcery spell, each opponent loses 1 life and you gain 1 life.', cmc: 2 },
  { id: 'Combat Copy Equipment', type_line: 'Legendary Artifact — Equipment', oracle_text: "At the beginning of combat on your turn, create a token that's a copy of equipped creature, except the token isn't legendary. That token gains haste. Equip {5}", cmc: 4 },
  { id: 'First Attack Extra Combat', type_line: 'Legendary Creature — Angel', oracle_text: 'Haste. Whenever this creature attacks for the first time each turn, untap all creatures you control. After this phase, there is an additional combat phase.', cmc: 4 },
  { id: 'Exert Extra Combat', type_line: 'Creature — Human Warrior', oracle_text: "If this creature hasn't been exerted this turn, you may exert it as it attacks. When you do, untap all other creatures you control and after this phase, there is an additional combat phase.", cmc: 3 },
  { id: 'Connect Extra Combat', type_line: 'Creature — Orc Pirate', oracle_text: "Whenever this creature deals combat damage to a player, untap each creature you control. After this phase, there is an additional combat phase. This creature can't attack a player it has already attacked this turn.", cmc: 5 },
  { id: 'Attached Self Copy Aura', type_line: 'Enchantment — Aura', oracle_text: 'Enchant creature\nEnchanted creature has "{T}: Create a token that’s a copy of this creature, except it has haste. Exile that token at the beginning of the next end step."', cmc: 4 },
  { id: 'Legendary Attack Extra Combat', type_line: 'Legendary Creature — Angel', oracle_text: 'Haste. Whenever this creature attacks for the first time each turn, untap all creatures you control. After this phase, there is an additional combat phase.', cmc: 4 },
  { id: 'Generic Precombat Copy Source', type_line: 'Enchantment', oracle_text: "At the beginning of combat on your turn, create a token that's a copy of target creature you control. That token gains haste.", cmc: 4 },
  { id: 'Broad Hasty Copy Source', type_line: 'Artifact Creature — Shapeshifter', oracle_text: "{T}: Create a token that's a copy of target creature you control, except it has haste.", cmc: 5 },
  { id: 'Tapped Artifact Hasty Copy Source', type_line: 'Artifact', oracle_text: "{T}: Create a token that's a copy of target creature you control, except it has haste.", cmc: 5 },
  { id: 'Tapped Attacking Copy Source', type_line: 'Artifact — Equipment', oracle_text: "Whenever equipped creature attacks, create a token that's a copy of equipped creature tapped and attacking. Exile it at end of combat. Equip {4}", cmc: 4 },
  { id: 'Restricted Connect Extra Combat', type_line: 'Creature — Noble', oracle_text: 'Whenever this creature deals combat damage to a player, untap all lands you control. After this phase, there is an additional combat phase. Only land creatures can attack during that combat phase.', cmc: 5 },
  { id: 'Connect Extra Turn', type_line: 'Creature — Sphinx', oracle_text: 'Flying. Whenever this creature deals combat damage to a player, take an extra turn after this one.', cmc: 6 },
  { id: 'Attack Extra Turn', type_line: 'Creature — Human Warrior', oracle_text: 'Whenever this creature attacks, take an extra turn after this one.', cmc: 4 },
  { id: 'Extra Turn Cannot Attack', type_line: 'Legendary Creature — Sphinx', oracle_text: "Flying Whenever Extra Turn Cannot Attack deals combat damage to a player, take an extra turn after this one. Extra Turn Cannot Attack can't attack during extra turns.", cmc: 6 },
  { id: 'Optional Sacrifice Extra Turn', type_line: 'Creature — Merfolk Wizard', oracle_text: 'Whenever this creature deals combat damage to a player, you may sacrifice a Merfolk. If you do, take an extra turn after this one.', cmc: 4 },
  { id: 'Combat Sacrifice Aura', type_line: 'Enchantment — Aura', oracle_text: 'Enchant creature\nWhenever enchanted creature deals combat damage to a player, sacrifice that creature and attach this Aura to another target creature you control. Untap all creatures you control. After this phase, there is an additional combat phase.', cmc: 3 },
  { id: 'Breath-Shaped Aura', type_line: 'Enchantment — Aura', oracle_text: 'Enchant creature\nWhenever enchanted creature deals combat damage to a player, sacrifice it and attach Breath-Shaped Aura to a creature you control. If you do, untap all creatures you control and after this phase, there is an additional combat phase.', cmc: 3 },
  { id: 'Fresh Combat Carrier Source', type_line: 'Creature — Human Warrior', oracle_text: 'At the beginning of combat on your turn, create a 1/1 red Warrior creature token with haste. It attacks this combat if able.', cmc: 3 },
  { id: 'Stale Carrier Source', type_line: 'Creature — Human Soldier', oracle_text: 'At the beginning of combat on your turn, create a 1/1 white Soldier creature token.', cmc: 2 },
  { id: 'Wrong Timing Carrier Source', type_line: 'Creature — Human Soldier', oracle_text: 'Whenever this creature attacks, create a 1/1 red Warrior creature token with haste.', cmc: 2 },
  { id: 'First Combat Only Carrier Source', type_line: 'Creature — Human Warrior', oracle_text: 'At the beginning of combat on your turn, if this is the first combat phase this turn, create a 1/1 red Warrior creature token with haste. It attacks this combat if able.', cmc: 2 },
  { id: 'Hasty Tapped Attacking Carrier Source', type_line: 'Creature — Human Soldier', oracle_text: 'At the beginning of combat on your turn, create a 1/1 red Warrior creature token tapped and attacking. That token gains haste.', cmc: 2 },
  { id: 'Recursive Exile Creature', type_line: 'Creature — Elemental', oracle_text: 'You may cast this card from exile.', cmc: 3, mana_cost: '{2}{R}' },
  { id: 'Creature-Only Exile Mana Outlet', type_line: 'Enchantment', oracle_text: "Exile a creature you control: Add X mana of any one color, where X is 1 plus the exiled creature's mana value. Spend this mana only to cast creature spells.", cmc: 3 },
  { id: 'Artifact Ability Cost Reducer', type_line: 'Creature — Vedalken Artificer', oracle_text: "Activated abilities of artifacts you control cost {1} less to activate. This effect can't reduce the mana in that cost to less than one mana.", cmc: 3 },
  { id: 'Self Untapping Artifact', type_line: 'Artifact', oracle_text: "This artifact doesn't untap during your untap step. {T}: Add {C}{C}{C}. {3}: Untap this artifact.", cmc: 3 },
  { id: 'Token Source', type_line: 'Creature', oracle_text: 'When this creature enters, create a 1/1 white Soldier creature token.', cmc: 2 },
  { id: 'Token Doubler', type_line: 'Enchantment', oracle_text: 'If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead.', cmc: 4 },
  { id: 'Token Payoff', type_line: 'Creature', oracle_text: 'Whenever one or more tokens you control enter, draw a card.', cmc: 3 },
  { id: 'Colorless Mana Amplifier', type_line: 'Artifact', oracle_text: 'Whenever you tap a permanent for {C}, add an additional {C}.', cmc: 5 },
  { id: 'Any-Type Nonland Mana Amplifier', type_line: 'Legendary Creature — Druid', oracle_text: 'Whenever you tap a nonland permanent for mana, add one mana of any type that permanent produced.', cmc: 2 },
  { id: 'Break-Even Self Untapper With Colorless', type_line: 'Artifact', oracle_text: '{T}: Add {C}{C}{C}. {3}: Untap this artifact.', cmc: 3 },
  { id: 'Generic Tribe Count Druid', type_line: 'Creature — Elf Druid', oracle_text: '{T}: Add {G} for each Elf you control.', cmc: 2, mana_cost: '{1}{G}' },
  { id: 'Opponent Count Druid', type_line: 'Creature — Druid', oracle_text: '{T}: Add {G} for each creature target opponent controls.', cmc: 2, mana_cost: '{1}{G}' },
  { id: 'Generic Modal Untap Engine', type_line: 'Artifact', oracle_text: '{1}: Untap this artifact. {3}, {T}: Untap target creature. {4}, {T}: Draw a card. {2}, {T}: You gain 1 life.', cmc: 3, mana_cost: '{3}' },
  { id: 'Generic Creature Untap Aura', type_line: 'Enchantment — Aura', oracle_text: 'Enchant creature\n{3}: Untap enchanted creature.', cmc: 1, mana_cost: '{G}' },
  { id: 'Untap Symbol Equipment', type_line: 'Artifact — Equipment', oracle_text: 'Equipped creature has "{3}, {Q}: This creature gets +2/+2 until end of turn." Equip {0}', cmc: 3, mana_cost: '{3}' },
  { id: 'Generic Extra Combat Activator', type_line: 'Enchantment', oracle_text: '{3}{R}{R}: Untap all creatures you control. After this phase, there is an additional combat phase followed by an additional main phase. Activate only as a sorcery.', cmc: 3, mana_cost: '{3}' },
  { id: 'Combat Treasure Equipment', type_line: 'Artifact — Equipment', oracle_text: 'Equipped creature has trample and "Whenever this creature deals combat damage to a player, create that many Treasure tokens." Equip {3}', cmc: 3, mana_cost: '{3}' },
  { id: 'Combat Land Untap Equipment', type_line: 'Artifact — Equipment', oracle_text: 'Whenever equipped creature deals combat damage to a player, untap all lands you control.', cmc: 3, mana_cost: '{3}' },
  { id: 'Attack Land Untap Aura', type_line: 'Enchantment — Aura', oracle_text: 'Enchant creature Whenever enchanted creature attacks, untap all lands you control.', cmc: 2, mana_cost: '{2}' },
  { id: 'Random Treasure Dragon', type_line: 'Creature — Dragon', oracle_text: 'Whenever this creature deals combat damage to a player, roll a d20. Create a number of Treasure tokens equal to the result.', cmc: 6, mana_cost: '{4}{R}{R}' },
  { id: 'Upkeep Artifact Token Engine', type_line: 'Artifact Creature — Thopter', oracle_text: 'At the beginning of your upkeep, create five 1/1 colorless Thopter artifact creature tokens.', cmc: 6, mana_cost: '{6}' },
  { id: 'Four Artifact Token Engine', type_line: 'Artifact', oracle_text: 'At the beginning of your upkeep, create four Clue tokens.', cmc: 4, mana_cost: '{4}' },
  { id: 'Artifact Sacrifice Extra-Turn Engine', type_line: 'Artifact', oracle_text: '{T}, Sacrifice five artifacts: Take an extra turn after this one.', cmc: 2, mana_cost: '{2}' },
  { id: 'Creature Token Engine', type_line: 'Creature', oracle_text: 'At the beginning of your upkeep, create five 1/1 white Soldier creature tokens.', cmc: 5, mana_cost: '{5}' },
  { id: 'Once Per Turn Upkeep Artifact Token Engine', type_line: 'Artifact Creature — Thopter', oracle_text: 'At the beginning of your upkeep, create five 1/1 colorless Thopter artifact creature tokens. This ability triggers only once each turn.', cmc: 6, mana_cost: '{6}' },
  { id: 'Once Per Turn Artifact Sacrifice Extra-Turn Engine', type_line: 'Artifact', oracle_text: '{T}, Sacrifice five artifacts: Take an extra turn after this one. Activate only once each turn.', cmc: 2, mana_cost: '{2}' },
  { id: 'Mill To Life Loss Payoff', type_line: 'Enchantment', oracle_text: "Whenever a card is put into an opponent's graveyard from anywhere, that player loses 1 life and you gain 1 life.", cmc: 1 },
  { id: 'Life Loss To Mill Payoff', type_line: 'Enchantment', oracle_text: 'Whenever an opponent loses life, that player mills that many cards.', cmc: 3 },
  { id: 'Opponent Half-Library Draw', type_line: 'Sorcery', oracle_text: 'Target opponent draws cards equal to half the number of cards in their library, rounded up.', cmc: 7 },
  { id: 'Opponent Draw Punisher', type_line: 'Enchantment', oracle_text: 'Whenever an opponent draws a card, that player loses 1 life.', cmc: 3 },
  { id: 'Half-Library Mill', type_line: 'Sorcery', oracle_text: 'Target player mills half their library, rounded up.', cmc: 5 },
  { id: 'Mill Multiplier', type_line: 'Enchantment', oracle_text: 'If an opponent would mill one or more cards, that player mills twice that many cards instead.', cmc: 3 },
  { id: 'Delayed Mill Equalizer', type_line: 'Enchantment — Aura Curse', oracle_text: "Enchant player At the beginning of each end step, enchanted player mills X cards, where X is the number of cards put into their graveyard from anywhere this turn.", cmc: 3 },
  { id: 'ETB Creature Blinker', type_line: 'Creature — Angel', oracle_text: 'Flying When this creature enters the battlefield, exile another target creature you control, then return that card to the battlefield under its owner’s control.', cmc: 5 },
  { id: 'ETB Permanent Blinker', type_line: 'Creature — Cat Beast', oracle_text: 'When this creature enters the battlefield, exile another target permanent you control, then return that card to the battlefield under its owner’s control.', cmc: 4 },
  { id: 'Creature-Token Replacement Outlet', type_line: 'Legendary Creature — Squirrel Warrior', oracle_text: 'If one or more tokens would be created under your control, those tokens plus that many 1/1 green Squirrel creature tokens are created instead.\n{B}, Sacrifice X Squirrels: Target creature gets +X/-X until end of turn.', cmc: 3 },
  { id: 'Death Mana Payoff', type_line: 'Creature — Human Pirate', oracle_text: 'Whenever another creature you control dies, create a Treasure token.', cmc: 4 },
  { id: 'Ephemerate', type_line: 'Instant', oracle_text: 'Exile target creature you control, then return it to the battlefield under its owner’s control.', cmc: 1 },
];

const indexes = buildInteractionIndexes(fixtures);
const seeded = seedCandidates(indexes, { perCardTripleLimit: 8 });
assert.ok(seeded.some(candidate => candidate.cards.length === 1 && candidate.cards.includes('Self Untap Dork')));
assert.ok(seeded.some(candidate => candidate.cards.join('|') === 'Deadeye Navigator|Peregrine Drake'));
assert.ok(seeded.some(candidate => candidate.cards.join('|') === 'Damage Draw Aura|Draw Damage Engine'));
assert.equal(seeded.some(candidate => candidate.cards.join('|') === 'Damage Draw Aura|Opponent Draw Damage Engine'), false, 'opponent-draw punishers should not seed draw-damage feedback packages that draw only you');
assert.ok(seeded.some(candidate => candidate.cards.join('|') === 'Counter Damage Creature|Lifelink Counter Engine'));
assert.ok(seeded.some(candidate => candidate.cards.join('|') === 'Life-Paid Damage Source|Opponent Loss Lifegain Payoff'));
assert.ok(seeded.some(candidate => candidate.cards.join('|') === 'Counter Token Engine|Green ETB Counter Granter'));
assert.ok(seeded.some(candidate => candidate.cards.join('|') === 'Minus Counter Death Spreader|Minus Counter Token Engine'));
assert.ok(seeded.some(candidate => candidate.cards.join('|') === 'Creature ETB Lifegain Payoff|Lifegain Counter Payoff|Named Counter Token Engine'));
assert.ok(seeded.some(candidate => candidate.cards.join('|') === 'Death Untap Pinger|Deathtouch Equipment'));
assert.ok(seeded.some(candidate => candidate.cards.join('|') === 'Death Untap Equipment|Deathtouch Equipment|Free Ping Equipment'));
assert.equal(seeded.some(candidate => candidate.cards.join('|') === 'Costed Ping Equipment|Death Untap Equipment|Deathtouch Equipment'), false, 'mana-costed pingers must not seed strict death-untap pinger locks');
assert.equal(seeded.some(candidate => candidate.cards.join('|') === 'Deathtouch Equipment|Free Ping Equipment|Once-Per-Turn Death Untap Equipment'), false, 'once-per-turn death untaps must not seed strict pinger locks');
assert.ok(seeded.some(candidate => candidate.cards.join('|') === 'Mana Sac Outlet|Recursive Body'));
assert.ok(seeded.some(candidate => candidate.cards.join('|') === 'Empty Library Oracle|Repeat Library Exiler'));
assert.ok(seeded.some(candidate => candidate.cards.join('|') === 'Nonland Untap Spell|Repeatable Instant Caster'));
assert.ok(seeded.some(candidate => candidate.cards.join('|') === 'Ability Copier|Self Untap Mana Rock'));
assert.ok(seeded.some(candidate => candidate.cards.join('|') === 'Artifact Ability Cost Reducer|Self Untapping Artifact'));
assert.ok(seeded.some(candidate => candidate.cards.join('|') === 'Hasty Copy Engine|Permanent Untapper'));
assert.ok(seeded.some(candidate => candidate.cards.join('|') === 'Combat Copy Equipment|First Attack Extra Combat'));
assert.ok(seeded.some(candidate => candidate.cards.join('|') === 'Exert Extra Combat|Hasty Copy Engine'));
assert.ok(seeded.some(candidate => candidate.cards.join('|') === 'Attached Self Copy Aura|Exert Extra Combat'));
assert.ok(seeded.some(candidate => candidate.cards.join('|') === 'Exert Extra Combat|Generic Precombat Copy Source'));
assert.ok(seeded.some(candidate => candidate.cards.join('|') === 'Combat Copy Equipment|Connect Extra Combat'));
assert.ok(seeded.some(candidate => candidate.cards.join('|') === 'Connect Extra Combat|Hasty Copy Engine'));
assert.ok(seeded.some(candidate => candidate.cards.join('|') === 'Combat Copy Equipment|Connect Extra Turn'));
assert.ok(seeded.some(candidate => candidate.cards.join('|') === 'Connect Extra Turn|Hasty Copy Engine'));
assert.ok(seeded.some(candidate => candidate.cards.join('|') === 'Attack Extra Turn|Generic Precombat Copy Source'));
assert.equal(seeded.some(candidate => candidate.cards.includes('Tapped Attacking Copy Source') && candidate.cards.includes('Connect Extra Combat')), false, 'tapped-and-attacking copy sources must not seed fresh-token connect extra-combat packages');
assert.equal(seeded.some(candidate => candidate.cards.includes('Hasty Copy Engine') && candidate.cards.includes('Legendary Attack Extra Combat')), true, 'illegal legendary copy targets may seed but must fail strict proof');
assert.equal(seeded.some(candidate => candidate.cards.includes('Combat Copy Equipment') && candidate.cards.includes('Restricted Connect Extra Combat')), false, 'restricted connect-trigger extra-combat sources must not seed strict fresh-token connect packages');
assert.equal(seeded.some(candidate => candidate.cards.includes('Combat Copy Equipment') && candidate.cards.includes('Extra Turn Cannot Attack')), false, 'fresh-token extra-turn packages must not seed sources that cannot attack during extra turns');
assert.equal(seeded.some(candidate => candidate.cards.includes('Combat Copy Equipment') && candidate.cards.includes('Optional Sacrifice Extra Turn')), false, 'fresh-token extra-turn packages must not seed optional-payment extra-turn sources');
assert.ok(seeded.some(candidate => candidate.cards.join('|') === 'Combat Sacrifice Aura|Fresh Combat Carrier Source'));
assert.ok(seeded.some(candidate => candidate.cards.join('|') === 'Breath-Shaped Aura|Fresh Combat Carrier Source'));
assert.equal(
  seeded.some(candidate => candidate.cards.includes('Combat Sacrifice Aura') && candidate.cards.includes('Stale Carrier Source')),
  false,
  'fresh carrier source must be combat-ready before seeding combat-sacrifice Aura packages',
);
assert.equal(
  seeded.some(candidate => candidate.cards.includes('Combat Sacrifice Aura') && candidate.cards.includes('Wrong Timing Carrier Source')),
  false,
  'attack-trigger carrier sources are deferred from G014 and must not seed combat-sacrifice Aura packages',
);
assert.equal(
  seeded.some(candidate => candidate.cards.includes('Breath-Shaped Aura') && candidate.cards.includes('First Combat Only Carrier Source')),
  false,
  'first-combat-only carrier sources must not seed combat-sacrifice Aura packages',
);
assert.equal(
  seeded.some(candidate => candidate.cards.includes('Breath-Shaped Aura') && candidate.cards.includes('Hasty Tapped Attacking Carrier Source')),
  false,
  'tapped-and-attacking carrier sources are deferred from G014 and must not seed combat-sacrifice Aura packages',
);
assert.ok(seeded.some(candidate => candidate.cards.join('|') === 'ETB Spell Copier|Hasty Creature Copy Spell'));
assert.ok(seeded.some(candidate => candidate.cards.join('|') === 'Death-Copy Creature Spell|ETB Spell Copier'));
assert.ok(seeded.some(candidate => candidate.cards.join('|') === 'Magecraft Drain Payoff|Self-Copying Targeted Spell'));
assert.ok(seeded.some(candidate => candidate.cards.join('|') === 'Creature-Only Exile Mana Outlet|Recursive Exile Creature'));
assert.ok(seeded.some(candidate => candidate.cards.join('|') === 'Break-Even Self Untapper With Colorless|Colorless Mana Amplifier'));
assert.ok(seeded.some(candidate => candidate.cards.join('|') === 'Any-Type Nonland Mana Amplifier|Break-Even Self Untapper With Colorless'));
assert.ok(seeded.some(candidate => candidate.cards.join('|') === 'Generic Modal Untap Engine|Generic Tribe Count Druid'));
assert.ok(seeded.some(candidate => candidate.cards.join('|') === 'Generic Creature Untap Aura|Generic Tribe Count Druid'));
assert.ok(seeded.some(candidate => candidate.cards.join('|') === 'Generic Tribe Count Druid|Untap Symbol Equipment'));
assert.ok(seeded.some(candidate => candidate.cards.join('|') === 'Combat Treasure Equipment|Generic Extra Combat Activator'));
assert.ok(seeded.some(candidate => candidate.cards.join('|') === 'Combat Land Untap Equipment|Generic Extra Combat Activator'));
assert.ok(seeded.some(candidate => candidate.cards.join('|') === 'Attack Land Untap Aura|Generic Extra Combat Activator'));
assert.equal(seeded.some(candidate => candidate.cards.join('|') === 'Generic Extra Combat Activator|Random Treasure Dragon'), false, 'random Treasure combat triggers must not seed strict combat-resource proof packages');
assert.ok(seeded.some(candidate => candidate.cards.join('|') === 'Artifact Sacrifice Extra-Turn Engine|Upkeep Artifact Token Engine'));
assert.equal(seeded.some(candidate => candidate.cards.join('|') === 'Artifact Sacrifice Extra-Turn Engine|Four Artifact Token Engine'), true, 'below-threshold artifact token sources can seed but must fail strict proof');
assert.equal(seeded.some(candidate => candidate.cards.includes('Artifact Sacrifice Extra-Turn Engine') && candidate.cards.includes('Creature Token Engine')), false, 'nonartifact token sources must not seed artifact-token extra-turn packages');
assert.equal(seeded.some(candidate => candidate.cards.includes('Artifact Sacrifice Extra-Turn Engine') && candidate.cards.includes('Once Per Turn Upkeep Artifact Token Engine')), false, 'once-per-turn artifact token sources must not seed strict repeatable packages');
assert.equal(seeded.some(candidate => candidate.cards.includes('Upkeep Artifact Token Engine') && candidate.cards.includes('Once Per Turn Artifact Sacrifice Extra-Turn Engine')), false, 'once-per-turn extra-turn engines must not seed strict artifact-token extra-turn packages');
assert.ok(seeded.some(candidate => candidate.cards.join('|') === 'Life Loss To Mill Payoff|Mill To Life Loss Payoff'));
assert.ok(seeded.some(candidate => candidate.cards.join('|') === 'Opponent Draw Punisher|Opponent Half-Library Draw'));
assert.ok(seeded.some(candidate => candidate.cards.join('|') === 'Half-Library Mill|Mill Multiplier'));
assert.ok(seeded.some(candidate => candidate.cards.join('|') === 'Delayed Mill Equalizer|Half-Library Mill'));
assert.ok(seeded.some(candidate => candidate.cards.join('|') === 'ETB Creature Blinker|ETB Permanent Blinker'));
assert.ok(seeded.some(candidate => candidate.cards.join('|') === 'Creature-Token Replacement Outlet|Death Mana Payoff'));
assert.ok(seeded.some(candidate => candidate.cards.includes('Artifact Top Caster') && candidate.cards.includes('Artifact Spell Reducer') && candidate.cards.includes('Self Top Draw Artifact')));

const packages = buildInteractionProofPackages(fixtures, { maxProofPackages: 192 });
const byFamily = new Map(packages.map(pkg => [pkg.family, pkg]));

assert.ok(byFamily.has('self-untap-mana-loop'));
assert.ok(byFamily.has('blink-etb-land-untap-loop'));
assert.ok(byFamily.has('lifegain-lifeloss-loop'));
assert.ok(byFamily.has('draw-damage-feedback-loop'));
assert.ok(byFamily.has('lifelink-counter-damage-loop'));
assert.ok(byFamily.has('life-paid-damage-lifeloss-recovery-loop'));
assert.ok(byFamily.has('counter-token→etb-counter-loop'));
assert.ok(byFamily.has('minus-counter-death→token-loop'));
assert.ok(byFamily.has('lifegain-counter-token-etb-loop'));
assert.ok(byFamily.has('death-untap-deathtouch-pinger-lock'));
assert.ok(byFamily.has('recursive-body-sacrifice-mana-loop'));
assert.ok(byFamily.has('exile-recast-creature-mana-loop'));
assert.ok(byFamily.has('library-exile-empty-library-win'));
assert.ok(byFamily.has('imprint-untap-spell-loop'));
assert.ok(byFamily.has('self-untap-mana→ability-copy-loop'));
assert.ok(byFamily.has('hasty-copy→etb-untap-loop'));
assert.ok(byFamily.has('combat-copy-token→extra-combat-loop'));
assert.ok(byFamily.has('hasty-copy→attack-extra-combat-loop'));
assert.ok(byFamily.has('combat-copy-token→connect-extra-combat-loop'));
assert.ok(byFamily.has('hasty-copy→connect-extra-combat-loop'));
assert.ok(byFamily.has('combat-copy-token→attack-extra-turn-loop'));
assert.ok(byFamily.has('combat-copy-token→connect-extra-turn-loop'));
assert.ok(byFamily.has('hasty-copy→connect-extra-turn-loop'));
assert.ok(byFamily.has('combat-sacrifice-aura→extra-combat-loop'));
assert.ok(byFamily.has('spell-copy-etb→creature-copy-spell-loop'));
assert.ok(byFamily.has('death-copy-spell-etb-copy-loop'));
assert.ok(byFamily.has('self-copy-spell→magecraft-drain-loop'));
assert.ok(byFamily.has('artifact-top-cost-reduction-loop'));
assert.ok(byFamily.has('token-source-modifier-payoff'));
assert.ok(byFamily.has('mill-lifeloss-feedback-loop'));
assert.ok(byFamily.has('opponent-draw-punisher-win'));
assert.ok(byFamily.has('mill-multiplier-finite-mill'));
assert.ok(byFamily.has('delayed-mill-equalizer-finite-mill'));
assert.ok(byFamily.has('mutual-etb-blink-reset-loop'));
assert.ok(byFamily.has('token-replacement-sacrifice-mana-loop'));
assert.ok(byFamily.has('variable-board-count-mana-loop'));
assert.ok(byFamily.has('combat-resource→extra-combat-loop'));
assert.ok(byFamily.has('artifact-token→extra-turn-loop'));
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

const drawDamageLoop = byFamily.get('draw-damage-feedback-loop');
assert.equal(drawDamageLoop.cardCount, 2);
assert.ok(drawDamageLoop.result.includes('damage'));
assert.ok(drawDamageLoop.assumptions.some(text => /initial draw or damage/.test(text)));

const lifelinkCounterDamageLoop = byFamily.get('lifelink-counter-damage-loop');
assert.equal(lifelinkCounterDamageLoop.cardCount, 2);
assert.ok(lifelinkCounterDamageLoop.result.includes('damage'));
assert.ok(lifelinkCounterDamageLoop.contributions.some(contribution => contribution.facts.includes('is-lifelink-counter-engine')));

const lifePaidDamagePackage = byFamily.get('life-paid-damage-lifeloss-recovery-loop');
assert.equal(lifePaidDamagePackage.cardCount, 2);
assert.ok(lifePaidDamagePackage.result.includes('damage'));
assert.ok(lifePaidDamagePackage.contributions.some(contribution => contribution.facts.includes('is-life-paid-damage-source')));

const counterTokenPackage = byFamily.get('counter-token→etb-counter-loop');
assert.equal(counterTokenPackage.cardCount, 2);
assert.ok(counterTokenPackage.result.includes('tokens'));
assert.ok(counterTokenPackage.resourceDeltas.some(delta => delta.resource === 'counters'));
assert.ok(counterTokenPackage.contributions.some(contribution => contribution.facts.includes('is-counter-to-creature-token-engine')));

const minusCounterPackage = byFamily.get('minus-counter-death→token-loop');
assert.equal(minusCounterPackage.cardCount, 2);
assert.ok(minusCounterPackage.resourceDeltas.some(delta => delta.resource === 'deathTriggers'));

const lifegainCounterTokenPackage = byFamily.get('lifegain-counter-token-etb-loop');
assert.equal(lifegainCounterTokenPackage.cardCount, 3);
assert.ok(lifegainCounterTokenPackage.resourceDeltas.some(delta => delta.resource === 'life'));
assert.ok(lifegainCounterTokenPackage.contributions.some(contribution => contribution.facts.includes('is-creature-etb-lifegain-payoff')));

const recursiveLoop = byFamily.get('recursive-body-sacrifice-mana-loop');
assert.equal(recursiveLoop.cardCount, 2);
assert.ok(recursiveLoop.result.includes('deathTriggers') || recursiveLoop.result.includes('sacrifices'));
assert.ok(recursiveLoop.contributions.some(contribution => contribution.facts.includes('is-recursive-body')));

const exileRecastPackage = byFamily.get('exile-recast-creature-mana-loop');
assert.equal(exileRecastPackage.cardCount, 2);
assert.ok(exileRecastPackage.result.includes('mana'));
assert.ok(exileRecastPackage.contributions.some(contribution => contribution.facts.includes('is-recursive-exile-cast-body')));

const libraryWin = byFamily.get('library-exile-empty-library-win');
assert.equal(libraryWin.repeatability.status, 'non-loop-win');
assert.ok(libraryWin.result.includes('winCondition'));

const imprintLoop = byFamily.get('imprint-untap-spell-loop');
assert.equal(imprintLoop.cardCount, 2);
assert.ok(imprintLoop.assumptions.some(text => /nonland permanents/.test(text)));

const copyAbilityLoop = byFamily.get('self-untap-mana→ability-copy-loop');
assert.equal(copyAbilityLoop.result.includes('mana 1'), true);

const costReducedSelfUntapPackage = packages.find(pkg => pkg.family === 'self-untap-mana-loop'
  && pkg.cards.includes('Artifact Ability Cost Reducer')
  && pkg.cards.includes('Self Untapping Artifact'));
assert.ok(costReducedSelfUntapPackage);
assert.ok(costReducedSelfUntapPackage.contributions.some(contribution => contribution.facts.includes('is-artifact-activated-ability-cost-reducer')));

const amplifiedSelfUntapLoop = packages.find(pkg => pkg.family === 'self-untap-mana-loop' && pkg.cards.includes('Colorless Mana Amplifier'));
assert.ok(amplifiedSelfUntapLoop);
assert.ok(amplifiedSelfUntapLoop.cards.includes('Break-Even Self Untapper With Colorless'));
assert.ok(amplifiedSelfUntapLoop.cards.includes('Colorless Mana Amplifier'));
assert.ok(amplifiedSelfUntapLoop.contributions.every(contribution => contribution.facts.length));
const anyTypeAmplifiedSelfUntapLoop = packages.find(pkg => pkg.family === 'self-untap-mana-loop' && pkg.cards.includes('Any-Type Nonland Mana Amplifier'));
assert.ok(anyTypeAmplifiedSelfUntapLoop);
assert.ok(anyTypeAmplifiedSelfUntapLoop.cards.includes('Break-Even Self Untapper With Colorless'));

const variableBoardCountPackage = packages.find(pkg => pkg.family === 'variable-board-count-mana-loop'
  && pkg.cards.includes('Generic Modal Untap Engine'));
assert.ok(variableBoardCountPackage);
assert.equal(variableBoardCountPackage.cardCount, 2);
assert.equal(variableBoardCountPackage.repeatability.status, 'repeatable-threshold');
assert.ok(variableBoardCountPackage.cards.includes('Generic Tribe Count Druid'));
assert.ok(/mana/.test(variableBoardCountPackage.result));
assert.ok(variableBoardCountPackage.resourceDeltas.some(delta => delta.resource === 'mana' && delta.min >= 1));
assert.ok(variableBoardCountPackage.resourceDeltas.some(delta => delta.resource === 'untaps'));
assert.ok(variableBoardCountPackage.resourceDeltas.some(delta => delta.resource === 'cards'));
assert.ok(variableBoardCountPackage.resourceDeltas.some(delta => delta.resource === 'life'));
assert.ok(variableBoardCountPackage.assumptions.some(text => /at least 5 elf/.test(text)));
assert.ok(variableBoardCountPackage.contributions.some(contribution => contribution.facts.includes('is-variable-board-count-mana-source')));
assert.ok(variableBoardCountPackage.contributions.some(contribution => contribution.facts.includes('is-repeatable-creature-untap-ability')));
assert.ok(variableBoardCountPackage.evidence.some(item => item.kind === 'precondition' && item.predicate === 'minimum-board-count'));

const attachedPumpVariablePackage = packages.find(pkg => pkg.family === 'variable-board-count-mana-loop'
  && pkg.cards.includes('Untap Symbol Equipment'));
assert.ok(attachedPumpVariablePackage);
assert.ok(attachedPumpVariablePackage.resourceDeltas.some(delta => delta.resource === 'pump'));
assert.ok(attachedPumpVariablePackage.contributions.some(contribution => contribution.facts.includes('is-attached-creature-untapper')));
assert.equal(
  packages.some(pkg => pkg.family === 'variable-board-count-mana-loop' && pkg.cards.includes('Opponent Count Druid')),
  false,
  'opponent-count variable mana sources must not seed or prove variable-board-count packages',
);

const combatResourcePackage = packages.find(pkg => pkg.family === 'combat-resource→extra-combat-loop'
  && pkg.cards.includes('Combat Treasure Equipment'));
assert.ok(combatResourcePackage);
assert.equal(combatResourcePackage.cardCount, 2);
assert.equal(combatResourcePackage.repeatability.status, 'repeatable-combat-threshold');
assert.ok(combatResourcePackage.result.includes('combatPhases'));
assert.equal(/tokens|mana/.test(combatResourcePackage.result), false, 'threshold combat-resource package should not claim accumulating mana or tokens');
assert.ok(combatResourcePackage.resourceDeltas.some(delta => delta.resource === 'combatPhases'));
assert.ok(combatResourcePackage.assumptions.some(text => /connects/.test(text)));
assert.ok(combatResourcePackage.limitingClauses.some(text => /connection/.test(text)));
assert.ok(combatResourcePackage.evidence.some(item => item.kind === 'precondition' && item.predicate === 'minimum-combat-damage'));
assert.ok(combatResourcePackage.evidence.some(item => item.kind === 'capability' && item.predicate === 'extra-combat-adds-main-phase'));

const combatLandUntapPackage = packages.find(pkg => pkg.family === 'combat-resource→extra-combat-loop'
  && pkg.cards.includes('Combat Land Untap Equipment'));
assert.ok(combatLandUntapPackage);
assert.ok(combatLandUntapPackage.resourceDeltas.some(delta => delta.resource === 'untaps'));
assert.ok(combatLandUntapPackage.evidence.some(item => item.kind === 'precondition' && item.predicate === 'minimum-land-count'));
assert.ok(combatLandUntapPackage.evidence.some(item => item.kind === 'precondition'
  && item.predicate === 'land-mana-can-pay-extra-combat-cost'
  && item.colors
  && item.colors.r === 2));
const attackLandUntapPackage = packages.find(pkg => pkg.family === 'combat-resource→extra-combat-loop'
  && pkg.cards.includes('Attack Land Untap Aura'));
assert.ok(attackLandUntapPackage);
assert.ok(attackLandUntapPackage.evidence.some(item => item.kind === 'precondition' && item.predicate === 'attack-trigger-can-be-declared'));
assert.equal(
  packages.some(pkg => pkg.family === 'combat-resource→extra-combat-loop' && pkg.cards.includes('Random Treasure Dragon')),
  false,
  'random Treasure combat damage must not surface as a proven strict package',
);

const artifactTokenExtraTurnPackage = byFamily.get('artifact-token→extra-turn-loop');
assert.equal(artifactTokenExtraTurnPackage.cardCount, 2);
assert.equal(artifactTokenExtraTurnPackage.repeatability.status, 'repeatable-turn-cycle-threshold');
assert.ok(artifactTokenExtraTurnPackage.result.includes('turns'));
assert.equal(/tokens|mana/.test(artifactTokenExtraTurnPackage.result), false, 'threshold artifact-token extra-turn package should not claim accumulating artifact tokens or mana');
assert.ok(artifactTokenExtraTurnPackage.resourceDeltas.some(delta => delta.resource === 'turns'));
assert.ok(artifactTokenExtraTurnPackage.assumptions.some(text => /each extra turn/.test(text)));
assert.ok(artifactTokenExtraTurnPackage.limitingClauses.some(text => /replacement-amplified/.test(text)));
assert.ok(artifactTokenExtraTurnPackage.evidence.some(item => item.kind === 'precondition' && item.predicate === 'artifact-tokens-per-turn' && item.value === 5));
assert.ok(artifactTokenExtraTurnPackage.evidence.some(item => item.kind === 'precondition' && item.predicate === 'artifact-extra-turn-sac-count' && item.value === 5));
assert.ok(artifactTokenExtraTurnPackage.contributions.some(contribution => contribution.facts.includes('is-turn-cycle-artifact-token-engine')));
assert.ok(artifactTokenExtraTurnPackage.contributions.some(contribution => contribution.facts.includes('is-artifact-sacrifice-extra-turn-engine')));
assert.equal(
  packages.some(pkg => pkg.family === 'artifact-token→extra-turn-loop' && pkg.cards.includes('Four Artifact Token Engine')),
  false,
  'below-threshold artifact token refills must not surface as proven strict extra-turn packages',
);
const replacementAmplifiedExtraTurnPackages = buildInteractionProofPackages(
  [
    fixtures.find(item => item.id === 'Four Artifact Token Engine'),
    fixtures.find(item => item.id === 'Token Doubler'),
    fixtures.find(item => item.id === 'Artifact Sacrifice Extra-Turn Engine'),
  ],
  { maxProofPackages: 16 },
);
assert.equal(
  replacementAmplifiedExtraTurnPackages.some(pkg => pkg.family === 'artifact-token→extra-turn-loop'),
  false,
  'broad token replacement must not turn a below-threshold artifact-token refill into a strict extra-turn proof package',
);

const millLifeLossPackage = byFamily.get('mill-lifeloss-feedback-loop');
assert.equal(millLifeLossPackage.cardCount, 2);
assert.ok(millLifeLossPackage.result.includes('mill'));

const opponentDrawPackage = byFamily.get('opponent-draw-punisher-win');
assert.equal(opponentDrawPackage.repeatability.status, 'non-loop-win');
assert.ok(opponentDrawPackage.result.includes('winCondition'));

const millMultiplierPackage = byFamily.get('mill-multiplier-finite-mill');
assert.equal(millMultiplierPackage.repeatability.status, 'non-loop-threshold');
assert.ok(millMultiplierPackage.result.includes('mill'));

const delayedMillEqualizerPackage = byFamily.get('delayed-mill-equalizer-finite-mill');
assert.equal(delayedMillEqualizerPackage.repeatability.status, 'non-loop-threshold');
assert.ok(delayedMillEqualizerPackage.result.includes('mill'));

const mutualBlinkPackage = byFamily.get('mutual-etb-blink-reset-loop');
assert.ok(mutualBlinkPackage.resourceDeltas.some(delta => delta.resource === 'etbTriggers'));

const tokenReplacementPackage = byFamily.get('token-replacement-sacrifice-mana-loop');
assert.equal(tokenReplacementPackage.cardCount, 2);
assert.ok(tokenReplacementPackage.assumptions.some(text => /replacement effect/.test(text)));
assert.ok(tokenReplacementPackage.contributions.some(contribution => contribution.facts.includes('is-token-to-creature-token-replacer')));

const combatCopyPackage = byFamily.get('combat-copy-token→extra-combat-loop');
assert.equal(combatCopyPackage.cardCount, 2);
assert.ok(combatCopyPackage.resourceDeltas.some(delta => delta.resource === 'combatPhases'));
assert.ok(combatCopyPackage.evidence.some(item => item.predicate === 'fresh-token-can-be-declared-attacker'));

const hastyCopyAttackPackage = byFamily.get('hasty-copy→attack-extra-combat-loop');
assert.equal(hastyCopyAttackPackage.cardCount, 2);
assert.equal(/mana|damage|win/i.test(hastyCopyAttackPackage.result), false);
assert.ok(hastyCopyAttackPackage.evidence.some(item => item.predicate === 'copy-source-reset-by-extra-combat-trigger'));
assert.ok(hastyCopyAttackPackage.evidence.some(item => item.predicate === 'fresh-token-unused-attack-trigger-at-loop-entry'));

const combatCopyConnectPackage = byFamily.get('combat-copy-token→connect-extra-combat-loop');
assert.equal(combatCopyConnectPackage.cardCount, 2);
assert.equal(/mana|damage|win/i.test(combatCopyConnectPackage.result), false);
assert.ok(combatCopyConnectPackage.evidence.some(item => item.predicate === 'combat-damage-connects'));
assert.ok(combatCopyConnectPackage.evidence.some(item => item.predicate === 'fresh-token-combat-damage-trigger-unused-at-loop-entry'));

const hastyCopyConnectPackage = byFamily.get('hasty-copy→connect-extra-combat-loop');
assert.equal(hastyCopyConnectPackage.cardCount, 2);
assert.equal(/mana|damage|win/i.test(hastyCopyConnectPackage.result), false);
assert.ok(hastyCopyConnectPackage.evidence.some(item => item.predicate === 'copy-source-reset-by-extra-combat-trigger'));
assert.ok(hastyCopyConnectPackage.evidence.some(item => item.predicate === 'combat-damage-connects'));

const combatCopyAttackTurnPackage = byFamily.get('combat-copy-token→attack-extra-turn-loop');
assert.equal(combatCopyAttackTurnPackage.cardCount, 2);
assert.equal(/combatPhases|tokens|etbTriggers|damage|win/i.test(combatCopyAttackTurnPackage.result), false);
assert.ok(combatCopyAttackTurnPackage.evidence.some(item => item.predicate === 'extra-turn-repeatable-with-fresh-token'));

const combatCopyConnectTurnPackage = byFamily.get('combat-copy-token→connect-extra-turn-loop');
assert.equal(combatCopyConnectTurnPackage.cardCount, 2);
assert.equal(/combatPhases|tokens|etbTriggers|damage|win/i.test(combatCopyConnectTurnPackage.result), false);
assert.ok(combatCopyConnectTurnPackage.evidence.some(item => item.predicate === 'combat-damage-connects'));

const hastyCopyConnectTurnPackage = byFamily.get('hasty-copy→connect-extra-turn-loop');
assert.equal(hastyCopyConnectTurnPackage.cardCount, 2);
assert.equal(/combatPhases|tokens|etbTriggers|damage|win/i.test(hastyCopyConnectTurnPackage.result), false);
assert.ok(hastyCopyConnectTurnPackage.evidence.some(item => item.predicate === 'copy-source-reset-by-extra-turn-untap-step'));

const combatSacrificeAuraPackage = byFamily.get('combat-sacrifice-aura→extra-combat-loop');
assert.equal(combatSacrificeAuraPackage.cardCount, 2);
assert.equal(combatSacrificeAuraPackage.repeatability.status, 'repeatable-combat-carrier');
assert.ok(combatSacrificeAuraPackage.result.includes('combatPhases'));
assert.equal(/mana|tokens|damage|win/i.test(combatSacrificeAuraPackage.result), false);
for (const resource of ['combatPhases', 'sacrifices', 'deathTriggers', 'ltbTriggers', 'untaps']) {
  assert.ok(combatSacrificeAuraPackage.resourceDeltas.some(delta => delta.resource === resource), `package missing ${resource}`);
}
assert.ok(combatSacrificeAuraPackage.evidence.some(item => item.kind === 'precondition' && item.predicate === 'combat-damage-connects'));
assert.ok(combatSacrificeAuraPackage.evidence.some(item => item.kind === 'precondition' && item.predicate === 'fresh-carrier-continuity'));
assert.ok(combatSacrificeAuraPackage.evidence.some(item => item.kind === 'precondition' && item.predicate === 'legal-reattach-target-at-trigger-resolution'));
assert.ok(combatSacrificeAuraPackage.evidence.some(item => item.kind === 'precondition' && item.predicate === 'current-enchanted-carrier-at-loop-entry'));
assert.ok(combatSacrificeAuraPackage.evidence.some(item => item.kind === 'precondition' && item.predicate === 'fresh-carrier-source-distinct-from-sacrificed-carrier'));
assert.ok(combatSacrificeAuraPackage.contributions.some(contribution => contribution.facts.includes('is-combat-sacrifice-extra-combat-aura')));
assert.ok(combatSacrificeAuraPackage.contributions.some(contribution => contribution.facts.includes('is-fresh-attack-carrier-source')));
const breathShapedAuraPackages = buildInteractionProofPackages([
  fixtures.find(item => item.id === 'Breath-Shaped Aura'),
  fixtures.find(item => item.id === 'Fresh Combat Carrier Source'),
], { maxProofPackages: 16 });
assert.ok(
  breathShapedAuraPackages.some(pkg => pkg.family === 'combat-sacrifice-aura→extra-combat-loop'),
  'Breath-shaped Aura wording should surface as a proven combat-sacrifice Aura package',
);
const staleCarrierPackages = buildInteractionProofPackages([
  fixtures.find(item => item.id === 'Combat Sacrifice Aura'),
  fixtures.find(item => item.id === 'Stale Carrier Source'),
], { maxProofPackages: 16 });
assert.equal(
  staleCarrierPackages.some(pkg => pkg.family === 'combat-sacrifice-aura→extra-combat-loop'),
  false,
  'stale carrier source must not surface as a proven combat-sacrifice Aura package',
);
const firstCombatOnlyCarrierPackages = buildInteractionProofPackages([
  fixtures.find(item => item.id === 'Breath-Shaped Aura'),
  fixtures.find(item => item.id === 'First Combat Only Carrier Source'),
], { maxProofPackages: 16 });
assert.equal(
  firstCombatOnlyCarrierPackages.some(pkg => pkg.family === 'combat-sacrifice-aura→extra-combat-loop'),
  false,
  'first-combat-only carrier source must not surface as a proven combat-sacrifice Aura package',
);
const hastyTappedAttackingCarrierPackages = buildInteractionProofPackages([
  fixtures.find(item => item.id === 'Breath-Shaped Aura'),
  fixtures.find(item => item.id === 'Hasty Tapped Attacking Carrier Source'),
], { maxProofPackages: 16 });
assert.equal(
  hastyTappedAttackingCarrierPackages.some(pkg => pkg.family === 'combat-sacrifice-aura→extra-combat-loop'),
  false,
  'tapped-and-attacking carrier source must not surface as a proven combat-sacrifice Aura package',
);

const deathCopyPackage = byFamily.get('death-copy-spell-etb-copy-loop');
assert.equal(deathCopyPackage.cardCount, 2);
assert.ok(deathCopyPackage.resourceDeltas.some(delta => delta.resource === 'tokens'));

const selfCopyMagecraftPackage = byFamily.get('self-copy-spell→magecraft-drain-loop');
assert.equal(selfCopyMagecraftPackage.cardCount, 2);
assert.ok(selfCopyMagecraftPackage.resourceDeltas.some(delta => delta.resource === 'magecraftTriggers'));

const pingerLockPackage = byFamily.get('death-untap-deathtouch-pinger-lock');
assert.equal(pingerLockPackage.cardCount, 2);
assert.equal(pingerLockPackage.repeatability.status, 'repeatable-lock');
assert.ok(pingerLockPackage.result.includes('deathtouch ping kills a creature'));
assert.ok(pingerLockPackage.assumptions.some(text => /creature/.test(text)));

const limited = buildInteractionProofPackages(fixtures, { maxProofPackages: 2 });
assert.equal(limited.length, 2);

const layeredRecursiveFixtures = [
  { id: 'Death Mana Payoff', type_line: 'Creature — Human Pirate', oracle_text: 'Whenever another creature you control dies, create a Treasure token.', cmc: 4 },
  { id: 'Colorless Mana Sac Outlet', type_line: 'Artifact', oracle_text: 'Sacrifice a creature: Add {C}{C}.', cmc: 3 },
  { id: 'Colored Recursive Body', type_line: 'Creature — Skeleton', oracle_text: '{1}{B}: Return this creature from your graveyard to the battlefield.', cmc: 2 },
];
const layeredSeeded = seedCandidates(buildInteractionIndexes(layeredRecursiveFixtures), { perCardTripleLimit: 8 });
assert.ok(layeredSeeded.some(candidate => candidate.cards.join('|') === 'Colored Recursive Body|Colorless Mana Sac Outlet|Death Mana Payoff'));
const layeredPackages = buildInteractionProofPackages(layeredRecursiveFixtures);
const layeredRecursivePackage = layeredPackages.find(pkg => pkg.family === 'recursive-body-sacrifice-mana-loop');
assert.ok(layeredRecursivePackage, 'death-mana support should prove layered recursive body sacrifice loops');
assert.equal(layeredRecursivePackage.cardCount, 3);

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
const faceGraph = build([
  { qty: 1, name: 'Call the Squad' },
  { qty: 1, name: 'Token Doubler' },
  { qty: 1, name: 'Token Payoff' },
], {
  'call the squad // quiet barracks': tokenDfc,
  'token doubler': fixtures.find(card => card.id === 'Token Doubler'),
  'token payoff': fixtures.find(card => card.id === 'Token Payoff'),
}, { includeInteractionProofs: false });
const facePackages = buildInteractionProofPackages(faceGraph.nodes);
const faceTokenPackage = facePackages.find(pkg => pkg.family === 'token-source-modifier-payoff');
assert.ok(faceTokenPackage, 'face-aware DFC token source should still prove token package');
const dfcContribution = faceTokenPackage.contributions.find(item => item.card === 'Call the Squad // Quiet Barracks');
assert.ok(dfcContribution);
assert.ok(dfcContribution.faces.some(face => face.name === 'Call the Squad'));
assert.ok(faceTokenPackage.evidence.some(item => item.card === 'Call the Squad // Quiet Barracks' && item.face?.name === 'Call the Squad'));

const payoffDfc = {
  name: 'Quiet Field // Festival Applause',
  layout: 'modal_dfc',
  type_line: 'Land // Enchantment',
  cmc: 3,
  color_identity: ['W'],
  card_faces: [
    {
      name: 'Quiet Field',
      mana_cost: '',
      type_line: 'Land',
      oracle_text: 'This land enters tapped. {T}: Add {W}.',
    },
    {
      name: 'Festival Applause',
      mana_cost: '{2}{W}',
      type_line: 'Enchantment',
      oracle_text: 'Whenever one or more tokens you control enter, draw a card.',
    },
  ],
};
const payoffGraph = build([
  { qty: 1, name: 'Token Source' },
  { qty: 1, name: 'Token Doubler' },
  { qty: 1, name: 'Festival Applause' },
], {
  'token source': fixtures.find(card => card.id === 'Token Source'),
  'token doubler': fixtures.find(card => card.id === 'Token Doubler'),
  'quiet field // festival applause': payoffDfc,
}, { includeInteractionProofs: false });
const payoffPackages = buildInteractionProofPackages(payoffGraph.nodes);
const payoffPackage = payoffPackages.find(pkg => pkg.family === 'token-source-modifier-payoff');
assert.ok(payoffPackage, 'face-aware DFC token payoff should prove token package');
const payoffContribution = payoffPackage.contributions.find(item => item.card === 'Quiet Field // Festival Applause');
assert.ok(payoffContribution.faces.some(face => face.name === 'Festival Applause'));
assert.ok(payoffPackage.evidence.some(item => item.card === 'Quiet Field // Festival Applause' && item.face?.name === 'Festival Applause'));

const impossibleLoopDfc = {
  name: 'Mana Adept // Untap Engine',
  layout: 'transform',
  type_line: 'Creature — Wizard // Artifact',
  cmc: 2,
  color_identity: ['G'],
  card_faces: [
    {
      name: 'Mana Adept',
      mana_cost: '{1}{G}',
      type_line: 'Creature — Wizard',
      oracle_text: '{T}: Add {G}{G}.',
    },
    {
      name: 'Untap Engine',
      mana_cost: '',
      type_line: 'Artifact',
      oracle_text: '{0}: Untap this artifact.',
    },
  ],
};
const impossibleGraph = build([{ qty: 1, name: 'Mana Adept' }], {
  'mana adept // untap engine': impossibleLoopDfc,
}, { includeInteractionProofs: false });
const impossibleNode = impossibleGraph.nodes.find(item => item.id === 'Mana Adept // Untap Engine');
assert.ok(impossibleNode.faceCompatibilityWarnings.some(warning => warning.kind === 'exclusive-face-aggregate'));
const impossibleProof = provePackage([impossibleNode]);
assert.notEqual(impossibleProof.status, 'proven', 'mutually exclusive DFC faces must not prove a same-card loop');
assert.ok(impossibleProof.rejections.some(item => item.reason.includes('mutually exclusive faces')));

const splitPingerPackages = buildInteractionProofPackages([
  { id: 'Free Pinger Creature', type_line: 'Creature — Goblin', oracle_text: '{T}: This creature deals 1 damage to any target.', cmc: 1 },
  { id: 'Death Untap Creature', type_line: 'Creature — Spirit', oracle_text: 'Whenever a creature dies, untap this creature.', cmc: 2 },
  { id: 'Deathtouch Equipment', type_line: 'Artifact — Equipment', oracle_text: 'Equipped creature has deathtouch. Equip {2}', cmc: 1 },
]);
assert.equal(
  splitPingerPackages.some(pkg => pkg.family === 'death-untap-deathtouch-pinger-lock'),
  false,
  'proof packages must not assemble intrinsic ping and death-untap roles from different creatures',
);

process.stdout.write('Interaction proof package tests passed\n');
