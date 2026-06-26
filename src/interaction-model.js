/*
 * interaction-model.js — the SHARED, subject-aware card-interaction taxonomy.
 *
 * Used by both build-deck-viz.js (Node) and the generated page (browser) so the
 * two can never drift apart. An interaction edge exists between two cards when
 * one PRODUCES a game event that the other CONSUMES — AND the subjects line up.
 *
 * WHY SUBJECTS MATTER (the fix):
 *   "You draw a card" and "Whenever an opponent draws, deal 1 damage" both touch
 *   the `draw` event, but they do NOT interact — the punisher only triggers on
 *   OPPONENTS drawing. So every produce/consume pattern is tagged with a subject:
 *     you  = you / a permanent you control
 *     opp  = an opponent / target opponent
 *     each = each player / all players  (expands to BOTH you and opp)
 *     any  = subject irrelevant (matches anything)
 *   An edge forms only if the produced subjects overlap the consumed subjects.
 */
(function (root) {
  const Y = "you", O = "opp", E = "each", A = "any";

  // Each event: produce/consume = list of { re, s } (s = subject tag above).
  const EVENTS = [
    { id: "draw", label: "card draw",
      produce: [
        { re: /each player[\s\S]{0,80}draws?/, s: E },     // wheels: "each player ... then draws seven"
        { re: /each opponent draws?/, s: O },
        { re: /target opponent draws?/, s: O },
        { re: /target player draws?/, s: Y },              // default beneficial draw → you
        { re: /\byou draws?\b/, s: Y },
        { re: /draws? (a card|two cards|three cards|four cards|five cards|six cards|seven cards|that many)/, s: Y },
      ],
      consume: [
        { re: /whenever an opponent draws/, s: O },
        { re: /whenever a player draws/, s: E },
        { re: /whenever you draw/, s: Y },
      ] },

    { id: "discard", label: "discarding",
      produce: [
        { re: /each player[\s\S]{0,60}discards?/, s: E },  // wheels: "each player discards their hand"
        { re: /each opponent discards?/, s: O },
        { re: /target opponent discards?/, s: O },
        { re: /target player discards?/, s: Y },
        { re: /\byou discards?\b/, s: Y },
        { re: /discards? (a card|two cards|three cards|that many|all the cards|their hand)/, s: Y }, // cost-style "discard a card" = you
      ],
      consume: [
        { re: /whenever an opponent discards?/, s: O },
        { re: /whenever a player discards?/, s: E },
        { re: /whenever you discards?/, s: Y },
      ] },

    { id: "sacrifice", label: "creatures dying / sacrificed",
      produce: [
        { re: /sacrifices? a creature/, s: Y },            // you sac as a cost
        { re: /each opponent sacrifices/, s: O },
        { re: /destroy all creatures/, s: E },             // wipes kill everyone's
        { re: /all creatures get [-−]/, s: E },
        { re: /when(ever)? .* creature .* dies/, s: A },
      ],
      consume: [
        { re: /whenever a creature you control dies/, s: Y },
        { re: /whenever another creature (you control )?dies/, s: Y },
        { re: /whenever a creature an opponent controls dies/, s: O },
        { re: /whenever an attacking creature dies/, s: A },
        { re: /whenever a creature dies/, s: A },
        { re: /whenever (this creature|[^.]* or another creature you control|another creature you control) dies/, s: Y },
        { re: /whenever (another creature|a nontoken creature|a creature) dies/, s: A },
        { re: /whenever .* you control is put into a graveyard/, s: Y },
      ] },

    { id: "treasure", label: "treasure / mana tokens",
      produce: [
        { re: /create .* treasure/, s: Y },
        { re: /\bgold token/, s: Y },
        { re: /treasure token/, s: Y },
      ],
      consume: [
        { re: /sacrifice a treasure/, s: Y },
        { re: /sacrifice (an|a) artifact/, s: Y },
        { re: /sacrifice this (artifact|token).*add/, s: Y },
        { re: /for each (artifact|treasure)/, s: Y },
      ] },

    { id: "goad", label: "goad / forced attacks",
      produce: [
        { re: /\bgoad/, s: O },                            // you goad opponents' creatures
        { re: /creatures your opponents control attack/, s: O },
        { re: /creatures? .* opponents control .* attack/, s: O },
      ],
      consume: [
        { re: /whenever a goaded creature/, s: O },
        { re: /\bgoaded\b/, s: O },
        { re: /whenever an? .* creature attacks (you|another)/, s: O },
        { re: /whenever an opponent attacks/, s: O },
        { re: /whenever an attacking creature dies/, s: A },
      ] },

    { id: "attack", label: "attacking / combat triggers",
      produce: [
        { re: /attacks each combat/, s: A },
        { re: /whenever .* attacks/, s: A },
        { re: /deals combat damage to a player/, s: Y },
      ],
      consume: [
        { re: /whenever you attack/, s: Y },
        { re: /whenever a creature you control attacks/, s: Y },
        { re: /whenever .* deals combat damage to a player/, s: Y },
      ] },

    { id: "counters", label: "+1/+1 counters",
      produce: [
        { re: /put .* \+1\/\+1 counter/, s: Y },
        { re: /\+1\/\+1 counters? on/, s: Y },
        { re: /distribute .* \+1\/\+1 counters?/, s: Y },   // "distribute two +1/+1 counters among..."
        { re: /\bfabricate \d+/, s: Y },
      ],
      consume: [
        { re: /for each \+1\/\+1 counter/, s: Y },
        { re: /remove .* \+1\/\+1 counter/, s: Y },
      ] },

    { id: "cast", label: "casting spells (spell-count payoffs)",
      // Conservative: a "producer" is a card that explicitly lets you cast/play
      // EXTRA spells (from exile / top / graveyard). Consumers are cast-payoffs.
      // We intentionally do NOT treat every spell as a cast-producer (that would
      // link a payoff to the whole deck), only cards that generate extra casts.
      produce: [
        { re: /you may (cast|play) (it|them|that card|those cards)/, s: Y },
        { re: /(cast|play) .* from (the top|your graveyard|exile)/, s: Y },
        { re: /exile the top .* you may (play|cast)/, s: Y },
      ],
      consume: [
        { re: /whenever you cast (a|an|your|a noncreature)/, s: Y },
        { re: /when you cast (a|an|your)/, s: Y },
      ] },

    { id: "lifegain", label: "life gain",
      produce: [
        { re: /you gain .* life/, s: Y },
        { re: /gain (\d+|x) life/, s: Y },
        { re: /\blifelink\b/, s: Y },
      ],
      consume: [
        { re: /whenever you gain life/, s: Y },
        { re: /if you gained life/, s: Y },
      ] },

    { id: "lifeloss", label: "opponents lose life / drain",
      produce: [
        { re: /each opponent loses .* life/, s: O },
        { re: /target opponent loses .* life/, s: O },
        { re: /deals damage to each (player|opponent)/, s: E },
        { re: /loses? half their life/, s: E },
      ],
      consume: [
        { re: /whenever an opponent loses life/, s: O },
        { re: /whenever a player loses life/, s: E },
      ] },

    { id: "monarch", label: "the monarch",
      produce: [{ re: /becomes? the monarch/, s: Y }, { re: /you become the monarch/, s: Y }],
      consume: [{ re: /while you're the monarch/, s: Y }, { re: /if you're the monarch/, s: Y }] },

    { id: "vote", label: "voting / council",
      produce: [{ re: /will of the council/, s: E }, { re: /council's dilemma/, s: E }, { re: /secret council/, s: E }],
      consume: [{ re: /\bvotes?\b/, s: E }] },

    { id: "steal", label: "donating / stealing control",
      produce: [
        { re: /target opponent gains control/, s: O },
        { re: /under the control of an opponent/, s: O },
      ],
      consume: [
        { re: /gains? control of (this|target)/, s: O },
        { re: /you control your opponents/, s: O },
      ] },

    // ---- events added from the full-database coverage audit ----
    { id: "tokens", label: "create tokens (tokens-matter)",
      produce: [
        { re: /create (a|an|one|two|three|four|five|x|that many|\d+) .*token/, s: Y },
        { re: /create .*token/, s: Y },
        { re: /\binvestigate\b/, s: Y }, { re: /\bamass\b/, s: Y }, { re: /\bincubate\b/, s: Y },
        { re: /\bfabricate \d+/, s: Y },
        { re: /\bpopulate\b/, s: Y },
      ],
      consume: [
        { re: /whenever (a|one or more) tokens? (you control )?enters?/, s: Y },
        { re: /if one or more tokens? would be created under your control/, s: Y },
        { re: /if .* would create .* tokens?/, s: Y },
        { re: /for each (creature |artifact )?token you control/, s: Y },
        { re: /tokens you control/, s: Y },
        { re: /sacrifice a (clue|food|treasure|blood|powerstone)/, s: Y },
      ] },

    { id: "destroy", label: "destroy a permanent",
      produce: [
        { re: /destroy (target|all|each|up to) /, s: A },
        { re: /destroy that (creature|permanent|artifact|enchantment)/, s: A },
      ],
      consume: [
        { re: /whenever a permanent(?: .*?)? is (destroyed|put into a graveyard)/, s: A },
      ] },

    { id: "tap", label: "tap a permanent (tappers)",
      produce: [
        { re: /tap (target|up to|all|each|that) /, s: A },
        { re: /tap target (creature|permanent|artifact|land)/, s: A },
      ],
      consume: [
        { re: /whenever .* becomes tapped/, s: A },
        { re: /whenever you tap (a|an|one or more)/, s: Y },
      ] },

    { id: "untap", label: "untap a permanent",
      // The untap→tap-ability ENABLEMENT family (capability-based, in the MATCH
      // stage) now owns the "untap a dork to re-tap it" combo. This event keeps
      // only the literal "becomes untapped" reaction to avoid double-counting.
      produce: [
        { re: /untap (target|all|up to|another target|that|each)/, s: A },
      ],
      consume: [
        { re: /whenever .* becomes untapped/, s: A },
      ] },

    { id: "noUntap", label: "untap denial / stun counters",
      produce: [
        { re: /doesn't untap during/, s: A },
        { re: /don't untap during/, s: A },
        { re: /put a stun counter/, s: A },
      ],
      consume: [
        { re: /whenever a stun counter is removed/, s: A },
        { re: /stun counter/, s: A },
      ] },

    { id: "bounce", label: "return a permanent to hand (bounce)",
      produce: [
        { re: /return (target|all|each|up to) .* to (its|their) owner'?s? hand/, s: A },
        { re: /return .* you control to (its|your) owner'?s? hand/, s: Y },
        { re: /return (it|this) to its owner'?s? hand/, s: A },
      ],
      consume: [
        { re: /whenever (this|a) (creature|permanent) .* enters/, s: Y },
        { re: /whenever .* you control leaves the battlefield/, s: Y },
      ] },

    { id: "reanimate", label: "return a card to the battlefield (recursion)",
      produce: [
        { re: /return (target|all|up to) .* from (a|your|their) graveyard to the battlefield/, s: A },
        { re: /put .* creature card .* graveyard onto the battlefield/, s: A },
        { re: /return .* to the battlefield under (your|its owner's) control/, s: A },
      ],
      consume: [
        { re: /whenever (a|another) (creature|permanent) enters/, s: Y },
        { re: /whenever .* enters .* from (a|your) graveyard/, s: Y },
      ] },

    { id: "blink", label: "exile and return (flicker)",
      produce: [
        { re: /exile .* then return (it|them|that card) to the battlefield/, s: Y },
        { re: /exile up to .* you control,? then return/, s: Y },
      ],
      consume: [
        { re: /whenever .* leaves the battlefield/, s: Y },
        { re: /whenever this (creature|permanent) enters or leaves/, s: Y },
      ] },

    { id: "copy", label: "copy a spell / permanent",
      produce: [
        { re: /copy (target|that) (instant|sorcery|spell|activated|triggered)/, s: Y },
        { re: /create a token that's a copy/, s: Y },
        { re: /you may copy/, s: Y },
        { re: /\bpopulate\b/, s: Y },
      ],
      consume: [
        { re: /whenever you copy/, s: Y },
        { re: /whenever a .* copy .* enters/, s: Y },
      ] },

    { id: "damage", label: "deal damage (noncombat)",
      produce: [
        { re: /deals? \d+ damage to any target/, s: A },
        { re: /deals? \d+ damage to (target|each|any)/, s: A },
        { re: /deals? (x|that much|damage equal to)/, s: A },
        { re: /deals? \d+ damage divided/, s: A },
        { re: /\bfights?\b/, s: A },
      ],
      consume: [
        { re: /whenever .* is dealt damage/, s: A },
        { re: /whenever a source .* deals damage to you/, s: Y },
        { re: /if .* would be dealt damage/, s: A },
      ] },

    { id: "fight", label: "creatures fight",
      produce: [
        { re: /\bfights?\b/, s: Y },
      ],
      consume: [
        { re: /whenever .* you control fights/, s: Y },
      ] },

    { id: "pump", label: "buff +X/+X",
      produce: [
        { re: /creatures you control get \+\d+\/\+\d+/, s: Y },
        { re: /gets \+\d+\/\+\d+ until end of turn/, s: A },
        { re: /\brally\b/, s: Y },
      ],
      consume: [
        { re: /whenever .* gets \+\d+\/\+\d+/, s: Y },
      ] },

    { id: "debuff", label: "shrink -X/-X",
      produce: [
        { re: /gets -\d+\/-\d+ until end of turn/, s: A },
        { re: /creatures (your opponents control|you don't control) get -\d+\/-\d+/, s: O },
        { re: /put a -1\/-1 counter/, s: A },
      ],
      consume: [
        { re: /whenever .* gets -\d+\/-\d+/, s: A },
        { re: /-1\/-1 counter/, s: A },
      ] },

    { id: "scry", label: "scry / look at top",
      produce: [
        { re: /\bscry \d+/, s: Y },
      ],
      consume: [
        { re: /whenever you scry/, s: Y },
        { re: /look at the top card of your library/, s: Y },
      ] },

    { id: "proliferate", label: "proliferate",
      // Proliferate is a PRODUCER that grows existing counters. Its only real
      // consumer is a "whenever you proliferate" payoff (rare). We do NOT treat
      // "counters on" as a consumer — that matched 4,500+ cards (every counter
      // card) and created a giant false hub.
      produce: [
        { re: /\bproliferate\b/, s: Y },
      ],
      consume: [
        { re: /whenever you proliferate/, s: Y },
      ] },

    { id: "energy", label: "energy counters",
      produce: [
        { re: /you get \{e\}/, s: Y },
        { re: /\bget \{e\}/, s: Y },
      ],
      consume: [
        { re: /pay \{e\}/, s: Y },
        { re: /you have .* energy/, s: Y },
      ] },

    { id: "landfall", label: "lands entering (landfall)",
      produce: [
        { re: /play an additional land/, s: Y },
        { re: /put .* land .* onto the battlefield/, s: Y },
        { re: /return .* land cards? .* graveyard .* battlefield/, s: Y },
        { re: /search your library for .*land cards?/, s: Y },
      ],
      consume: [
        { re: /\blandfall\b/, s: Y },
        { re: /whenever a land (you control )?enters/, s: Y },
      ] },

    { id: "attach", label: "Equipment / Aura attach (Voltron)",
      produce: [
        { re: /attach (it|this|that|target)/, s: Y },
        { re: /\benchant (creature|permanent)/, s: Y },
        { re: /for mirrodin!/, s: Y },
      ],
      consume: [
        { re: /whenever .* becomes attached/, s: Y },
        { re: /whenever .* becomes equipped/, s: Y },
        { re: /whenever an aura .* is attached/, s: Y },
      ] },

    { id: "blocked", label: "blocks / becomes blocked (combat sub-triggers)",
      produce: [
        { re: /whenever this creature becomes blocked/, s: E },
        { re: /whenever this creature blocks/, s: E },
        { re: /\brampage \d+/, s: E }, { re: /\bbushido \d+/, s: E }, { re: /\bflanking\b/, s: E },
      ],
      consume: [
        { re: /whenever a creature you control becomes blocked/, s: Y },
      ] },

    { id: "explore", label: "explore",
      produce: [{ re: /\bexplores?\b/, s: Y }],
      consume: [{ re: /whenever .* you control explores/, s: Y }] },

    { id: "connive", label: "connive",
      produce: [{ re: /\bconnives?\b/, s: Y }, { re: /connive \d+/, s: Y }],
      consume: [{ re: /whenever .* connives/, s: Y }] },

    { id: "venture", label: "venture / dungeons",
      produce: [{ re: /venture into the dungeon/, s: Y }],
      consume: [{ re: /whenever you venture/, s: Y }, { re: /whenever you complete a dungeon/, s: Y }] },

    { id: "diceCoin", label: "dice rolls / coin flips",
      produce: [{ re: /roll (a|two|\d+|one or more) .*di(c|e)/, s: Y }, { re: /flip a coin/, s: Y }],
      consume: [{ re: /whenever you roll/, s: Y }, { re: /whenever you flip/, s: Y }, { re: /if you win the flip/, s: Y }] },

    { id: "transform", label: "transform / turn face up",
      produce: [
        { re: /\btransform\b/, s: Y },
        { re: /turn (it|this|that) face up/, s: Y },
      ],
      consume: [
        { re: /whenever .* transforms/, s: Y },
      ] },

    { id: "crime", label: "commit a crime",
      // "Crime" is hard to detect from effect text (it's about targeting
      // opponents' stuff). Only the explicit payoff phrasing is reliable; we
      // keep it as a consumer-only marker rather than risk false producers.
      produce: [
        { re: /commits? a crime/, s: O },
      ],
      consume: [
        { re: /whenever you commit a crime/, s: Y },
      ] },

    { id: "theRing", label: "the Ring / ring-bearer",
      produce: [{ re: /the ring tempts you/, s: Y }],
      consume: [{ re: /whenever the ring tempts you/, s: Y }, { re: /your ring-bearer/, s: Y }] },

    // ---- near-miss patches from the tail analysis ----
    // Only events that actually FORM edges are kept (extraTurn / initiative were
    // dropped — they had zero consumers in the database, so they never link).
    { id: "leaves", label: "a permanent leaves the battlefield (LTB triggers)",
      produce: [
        { re: /exile (target|all|each)/, s: A },
        { re: /return (target|all) .* to (its|their) owner'?s? hand/, s: A },
        { re: /sacrifice(s)? (a|an|that|the|one|two)/, s: A },
      ],
      consume: [
        { re: /whenever .* leaves the battlefield/, s: Y },
      ] },

    { id: "targeted", label: "becomes the target of a spell/ability",
      produce: [
        { re: /target(s)? (a|target|this|that) (creature|permanent|spell)/, s: A },
        { re: /you may choose new targets/, s: A },
      ],
      consume: [
        { re: /whenever .* becomes the target of (a|an) (spell|ability)/, s: A },
      ] },

    // ---- ramp engine: mana producers feed big-mana sinks (X-spells, etc.) ----
    // Gated to NON-LANDS in classify() so the manabase doesn't become a false
    // hub linking 30+ lands to every payoff. The real, scoreable interaction is
    // "ramp piece (dork / rock / ritual / mana-doubler) -> mana sink".
    { id: "mana", label: "ramp ↔ mana sink",
      produce: [
        { re: /\{t\}[^.]*?:\s*add \{/, s: Y },              // "{T}: Add {G}"
        { re: /:\s*add \{[wubrgcs]/, s: Y },                // "{2}, {T}: Add {B}{R}"
        { re: /\badd \{[wubrgc]/, s: Y },                   // rituals: "Add {B}{B}{B}"
        { re: /add (one|two|three|four|five|six|x) (?:additional |more )?mana/, s: Y },
        { re: /add .* mana of any/, s: Y },
        { re: /add an additional|twice that much mana|doesn't empty/, s: Y }, // doublers
      ],
      consume: [
        { re: /(loses?|lose) x life/, s: Y },
        { re: /gains? x life/, s: Y },
        { re: /deals? x damage/, s: Y },
        { re: /draws? x cards/, s: Y },
        { re: /creates? x /, s: Y },
        { re: /with mana value x( or less)?/, s: Y },
        { re: /repeat .* x times/, s: Y },
        { re: /\bx target/, s: Y },
        { re: /where x is/, s: Y },
        { re: /spend .* mana .* as though|spend this mana/, s: Y },
      ] },
  ];

  // Irregular tribe plurals → singular; everything else just drops a trailing "s".
  function singularize(w) {
    if (/ves$/.test(w)) return w.replace(/ves$/, "f");      // elves→elf, wolves→wolf, dwarves→dwarf, thieves→thief
    if (/ies$/.test(w)) return w.replace(/ies$/, "y");
    if (/s$/.test(w)) return w.replace(/s$/, "");
    return w;
  }

  // The creature's OWN subtypes (the part after the em/en dash on a creature).
  function creatureSubtypes(typeLine) {
    const t = (typeLine || "");
    if (!/creature/i.test(t)) return [];
    const m = t.split(/[—\-–]/);
    if (m.length < 2) return [];
    return m[1].trim().toLowerCase().split(/\s+/).filter(Boolean);
  }

  // Creature types a card SCALES on / cares about (lords, anthems, "for each X").
  // The sentinel "creature" means a generic team reference ("creatures you
  // control get …") that links to ALL your creatures. Other words must match a
  // creature's actual subtype to form an edge — so a Goblin lord won't link to
  // Elves. Words that aren't creature types (land/artifact/etc.) simply never match.
  function tribalRefs(oracle) {
    const o = (oracle || "").toLowerCase();
    const refs = new Set();
    const pats = [
      /(?:other |each |every |all )?([a-z]+) you control get[s]? [+\-]\d/g,
      /for each ([a-z]+) you control/g,
      /\b([a-z]+) creatures? you control/g,
      /whenever (?:a|an|another) ([a-z]+) (?:you control )?enters/g,
      /other ([a-z]+) you control/g,
    ];
    for (const re of pats) {
      let m;
      while ((m = re.exec(o)) !== null) {
        const w = singularize(m[1]);
        if (w === "creature") refs.add("creature");          // wildcard team buff
        else if (w.length >= 3 && !STOP_REFS.has(w)) refs.add(w);
      }
    }
    return [...refs];
  }
  // words that grammatically land in the capture slot but are never creature types
  const STOP_REFS = new Set(["land", "artifact", "enchantment", "permanent", "token",
    "card", "spell", "planeswalker", "you", "them", "this", "that", "your", "each", "other", "another"]);

  const ZONE_RULES = [
    { id: "@Hand",      re: /discard|draws? |draw a|in hand|from (your|their) hand|hand of|reveal .* hand|cards in (their|your|a player|each|hand)|return .* to (your|their) hand/ },
    { id: "@Graveyard", re: /graveyard/ },
    { id: "@Exile",     re: /\bexiles?\b|\bexiled?\b/ },
    { id: "@Library",   re: /library|search your|top of (your|that)|put .* onto the battlefield|shuffle|\bmill\b|\bsurveil\b/ },
    { id: "@Opponents", re: /opponent|each player|target player|another player|goad|every player|that player|its controller|attacks? you|attacking player/ },
  ];

  const ZONES = [
    { id: "@Hand",      label: "Hand",          x: 0,    y: -470, color: "#5aa6ff", text: "Cards in hand — drawing, discarding, hand size." },
    { id: "@Opponents", label: "Other players", x: 540,  y: -60,  color: "#c061f0", text: "Opponents / the whole table — drain, goad, group effects." },
    { id: "@Exile",     label: "Exile",         x: 420,  y: 400,  color: "#4fd6d6", text: "Exile zone — exile removal & cast-from-exile." },
    { id: "@Graveyard", label: "Graveyard",     x: -420, y: 400,  color: "#9a6cff", text: "Graveyard — reanimation, recursion, mill." },
    { id: "@Library",   label: "Library",       x: -560, y: -60,  color: "#54c98a", text: "Library — tutors, top-of-library, search & shuffle." },
  ];

  function isLandType(typeLine) { return /\bland\b/i.test(typeLine || ""); }

  function roleOf(typeLine, oracle) {
    const t = (typeLine || "").toLowerCase(), o = (oracle || "").toLowerCase();
    if (isLandType(t)) return "land";
    if (/destroy all|all creatures get [-−]|[-−]x\/[-−]x/.test(o)) return "wipe";
    if (/destroy target|exile target (creature|permanent|artifact)|deals \d+ damage to target (creature|any)|counter target spell/.test(o)) return "removal";
    if (/return .* from .* graveyard to the battlefield|put .* creature card .* graveyard onto the battlefield/.test(o)) return "reanimation";
    if (/whenever an opponent draws|whenever a player draws/.test(o)) return "payoff";
    if (/each opponent loses|loses half their life|deals damage to each player|each opponent sacrifices/.test(o)) return "finisher";
    if (/\bgoad|creatures your opponents control attack|becomes? the monarch|will of the council|council's dilemma/.test(o)) return "political";
    if (/search your library for a card/.test(o)) return "tutor";
    if (/(\{t\}: add|add \{|adds? .* mana|search your library for a .*land)/.test(o) && (t.includes("artifact") || t.includes("instant") || t.includes("sorcery"))) return "ramp";
    if (/draw (a card|two cards|three cards|seven)|each player draws/.test(o)) return "draw";
    if (t.includes("creature")) return "creature";
    return "utility";
  }

  // collect matched subjects for one side (produce or consume) of one event
  function subjectsFor(patterns, text) {
    const subs = [];
    for (const p of patterns) if (p.re.test(text)) subs.push(p.s);
    return subs;
  }

  // A card PRODUCES an event only via its EFFECT text, not its trigger condition.
  // "Whenever an opponent draws a card, deal 1 damage" — the draw is the trigger
  // (a reaction), so it must not count as producing a draw. We strip leading
  // "when/whenever … ," trigger clauses before testing producers. Consumers are
  // tested against the FULL text (the trigger is exactly what they react to).
  function effectText(o) {
    return o.replace(/\bwhen(ever)?\b[^,.]*[,.]/g, " ");
  }
  function rulesText(oracle) {
    // Parenthetical text in Oracle is reminder text, not an additional ability.
    // Removing it prevents token reminders from creating fake mana/sacrifice
    // producers or consumers.
    return (oracle || "").replace(/\([^()]*\)/g, " ");
  }

  // ============================ PIPELINE: SEGMENT ============================
  // Split a card's oracle text into individual ability segments so each ability
  // is classified on its own (no cross-clause regex bleed). Cards separate
  // abilities by newlines; within a line we detect the ability KIND:
  //   activated  — "{cost}: effect"  (cost contains mana / {T} / sacrifice / pay)
  //   triggered  — "when/whenever/at ..., effect"   (etb = trigger mentions "enters")
  //   static/spell — everything else (continuous abilities, sorcery/instant text)
  // Each segment carries {kind, cost, trigger, effect, raw}; cost/trigger/effect
  // are the slices the TAG stage runs regexes against.
  const COST_LEAD = /^\s*([^:"]*?(?:\{[^}]+\}|\btap\b|sacrifice|discard|pay|remove|exert|reveal)[^:"]*?):\s+/i;
  function segmentOracle(oracle) {
    const text = rulesText(oracle)
      // Scryfall often stores multiple abilities on one line separated by
      // sentences. Split before trigger clauses so static keyword/reminder text
      // does not hide later triggered abilities.
      .replace(/([.)])\s+(?=(When|Whenever|At the beginning|At end|At your|At each)\b)/gi, "$1\n")
      // Compact search records can collapse a keyword and a trigger without
      // punctuation ("Defender When this creature enters..."). Split common
      // keyword-only prefixes so ETB/triggers are still seen as abilities.
      .replace(/\b(Defender|Flying|Reach|Deathtouch|First strike|Double strike|Haste|Lifelink|Menace|Trample|Vigilance|Ward(?: \{[^}]+\})?|Hexproof|Indestructible|Flash)\s+(?=(When|Whenever|At the beginning|At end|At your|At each)\b)/gi, "$1\n")
      .replace(/\b(Enchant [^.\n]+?)\s+(?=(When|Whenever|At the beginning|At end|At your|At each)\b)/gi, "$1\n")
      .replace(/\b(Fabricate \d+)\s+(?=(When|Whenever|At the beginning|At end|At your|At each)\b)/gi, "$1\n")
      .replace(/([.)])\s+(?=Crew \d+)/gi, "$1\n")
      .replace(/([.)])\s+(?=(Sacrifice|Discard|Pay|Remove|Tap|Exert|Reveal)\b[^:]{0,120}:)/gi, "$1\n")
      .replace(/([.)])\s+(?=\{[^}]+\}[^:]{0,120}:)/gi, "$1\n");
    const out = [];
    for (let line of text.split(/\n+/)) {
      line = line.trim();
      if (!line) continue;
      const lc = line.toLowerCase();
      let kind = "static", cost = "", trigger = "", effect = lc;
      const am = line.match(COST_LEAD);
      if (am) {
        kind = "activated"; cost = am[1].toLowerCase(); effect = lc.slice(am[0].length);
      } else if (/^(when|whenever|at )/i.test(line)) {
        // trigger clause runs to the first comma; the rest is the effect
        const ci = line.indexOf(",");
        if (ci > -1) { trigger = lc.slice(0, ci); effect = lc.slice(ci + 1).trim(); }
        else { trigger = lc; effect = lc; }
        kind = /\benters\b/.test(trigger) ? "etb" : "triggered";
      }
      out.push({ kind, cost, trigger, effect, raw: lc });
    }
    return out;
  }

  // =========================== PIPELINE: SEMANTIC IR =======================
  // A typed, audit-friendly wrapper around today's classify() output. This does
  // not change matching behavior yet; it gives future proof search a stable
  // fact surface with evidence and confidence instead of having to reason over
  // flat string maps directly.
  const FACT_KIND_ONTOLOGY = {
    "ability": "One segmented Oracle ability with a structural kind, cost/trigger/effect slices, and exact evidence.",
    "event.produces": "A regex-derived event/resource this card can produce for one or more subjects.",
    "event.consumes": "A regex-derived event/resource this card reacts to, requires, or pays off.",
    "capability": "A typed predicate converted from the legacy caps array; enablement families consume these predicates.",
    "zone.reference": "A game zone mentioned by the card outside pure land mana text.",
    "type.creature-subtype": "A creature subtype on this card.",
    "type.tribal-reference": "A creature type or creature wildcard referenced by this card's rules text.",
    "role": "The legacy card role classification used by graph coloring and scoring.",
    "classification.fallback": "Fallback fact when no more specific semantic facts were extracted.",
  };
  const FAMILY_KIND_ONTOLOGY = {
    reaction: "A produces/consumes event match between two cards.",
    synergy: "A directional, non-infinite synergy from one capability predicate to another.",
    enablement: "A directional predicate edge that can participate in loop or combo proof search.",
  };
  const CONFIDENCE_ONTOLOGY = {
    exact: "Structurally recognized from ability shape or card type.",
    pattern: "Regex-derived semantic cue with direct Oracle-text evidence.",
    heuristic: "Broad inference retained for compatibility and review.",
    unknown: "Fallback when the classifier could not extract a stronger signal.",
  };
  const ONTOLOGY = {
    factKinds: FACT_KIND_ONTOLOGY,
    familyKinds: FAMILY_KIND_ONTOLOGY,
    confidence: CONFIDENCE_ONTOLOGY,
  };

  function typedPredicateForCap(cap) {
    const raw = String(cap || "");
    const i = raw.indexOf(":");
    return {
      predicate: i >= 0 ? raw.slice(0, i) : raw,
      value: i >= 0 ? raw.slice(i + 1) : null,
      raw,
    };
  }

  function snippet(text) {
    return String(text || "").replace(/\s+/g, " ").trim().slice(0, 240);
  }

  function evidenceForSegment(segment, abilityId) {
    return { source: "oracle_text", abilityId, snippet: snippet(segment && segment.raw) };
  }

  function abilityIR(segment, index) {
    const id = "ability:" + index;
    return {
      id,
      kind: segment.kind,
      cost: segment.cost || null,
      trigger: segment.trigger || null,
      effect: segment.effect || "",
      confidence: "exact",
      evidence: [evidenceForSegment(segment, id)],
    };
  }

  function makeFact(kind, attrs) {
    const base = attrs.event || attrs.predicate || attrs.zone || attrs.type || attrs.reference || attrs.role || "unknown";
    const value = attrs.value == null ? "" : ":" + attrs.value;
    const subjects = attrs.subjects && attrs.subjects.length ? ":" + attrs.subjects.join(",") : "";
    return Object.assign({
      id: [kind, base + value + subjects].join(":"),
      kind,
      confidence: attrs.confidence || "pattern",
      evidence: attrs.evidence || [],
    }, attrs);
  }

  function eventEvidence(eventId, mode, abilities) {
    const ev = EVENTS.find(e => e.id === eventId);
    if (!ev) return [];
    const patterns = mode === "produces" ? ev.produce : ev.consume;
    const out = [];
    for (const ability of abilities) {
      const text = mode === "produces" ? ability.effect : [ability.trigger, ability.effect].filter(Boolean).join(" ");
      if (patterns.some(p => p.re.test(text))) out.push({ source: "oracle_text", abilityId: ability.id, snippet: snippet(text) });
    }
    return out.slice(0, 3);
  }

  function confidenceForCap(cap) {
    const { predicate } = typedPredicateForCap(cap);
    if (/^(has-tap-ability|has-nonmana-activated-ability|has-creature-activated-ability|has-trigger|has-etb|taps-for-mana|mana-produced|blink-cost|self-untap-cost|ability-copy-cost)$/.test(predicate))
      return "exact";
    if (/^(is-|uses-|untaps-|etb-untaps-|mana-from-|exile-access-source)/.test(predicate))
      return "pattern";
    return "heuristic";
  }

  function capEvidence(cap, abilities) {
    const { predicate } = typedPredicateForCap(cap);
    const checks = [
      { re: /trigger|etb/, matches: a => a.kind === "triggered" || a.kind === "etb" },
      { re: /tap|activated|mana-produced|mana-from|self-untap|ability-copy/, matches: a => a.kind === "activated" },
      { re: /untap/, matches: a => /\buntap\b/.test(a.effect + " " + a.cost) },
      { re: /blink/, matches: a => /\bexile\b/.test(a.effect) && /\breturn\b/.test(a.effect) && /\bbattlefield\b/.test(a.effect) },
      { re: /cost-reducer|cost-reduction|spell-cost/, matches: a => /cost.*less|activated abilities|spells?.*cost/.test(a.effect) },
      { re: /token/, matches: a => /\btoken/.test(a.effect + " " + a.trigger) },
      { re: /counter|proliferate/, matches: a => /\bcounter|proliferate/.test(a.effect + " " + a.trigger) },
    ];
    const matched = abilities.filter(ability => checks.some(check => check.re.test(predicate) && check.matches(ability)));
    return (matched.length ? matched : abilities.slice(0, 1)).map(ability => evidenceForSegment({ raw: ability.evidence[0] && ability.evidence[0].snippet }, ability.id));
  }

  function addFact(facts, seen, fact) {
    if (seen.has(fact.id)) return;
    seen.add(fact.id);
    facts.push(fact);
  }

  function semanticIR(card, classified) {
    const abilities = (classified.segments || segmentOracle(card && card.oracle_text)).map(abilityIR);
    const facts = [], seen = new Set();
    for (const [event, subjects] of Object.entries(classified.produces || {})) {
      addFact(facts, seen, makeFact("event.produces", {
        event,
        subjects: subjects.slice().sort(),
        confidence: "pattern",
        evidence: eventEvidence(event, "produces", abilities),
      }));
    }
    for (const [event, subjects] of Object.entries(classified.consumes || {})) {
      addFact(facts, seen, makeFact("event.consumes", {
        event,
        subjects: subjects.slice().sort(),
        confidence: "pattern",
        evidence: eventEvidence(event, "consumes", abilities),
      }));
    }
    for (const cap of (classified.caps || []).slice().sort()) {
      const parsed = typedPredicateForCap(cap);
      addFact(facts, seen, makeFact("capability", {
        predicate: parsed.predicate,
        value: parsed.value,
        raw: parsed.raw,
        confidence: confidenceForCap(cap),
        evidence: capEvidence(cap, abilities),
      }));
    }
    for (const zone of (classified.zones || []).slice().sort()) {
      addFact(facts, seen, makeFact("zone.reference", { zone, confidence: "pattern" }));
    }
    for (const type of (classified.myTypes || []).slice().sort()) {
      addFact(facts, seen, makeFact("type.creature-subtype", { type, confidence: "exact" }));
    }
    for (const reference of (classified.tribalRefs || []).slice().sort()) {
      addFact(facts, seen, makeFact("type.tribal-reference", { reference, confidence: "pattern" }));
    }
    if (classified.role) {
      addFact(facts, seen, makeFact("role", {
        role: classified.role,
        confidence: classified.role === "utility" ? "heuristic" : "pattern",
      }));
    }
    if (!facts.length) {
      addFact(facts, seen, makeFact("classification.fallback", {
        predicate: "unknown",
        confidence: "unknown",
        evidence: abilities.slice(0, 1).map(ability => ability.evidence[0]),
      }));
    }
    facts.sort((a, b) => a.id.localeCompare(b.id));
    return {
      version: "semantic-ir.v1",
      card: {
        typeLine: card.type_line || "",
        role: classified.role || "utility",
      },
      abilities,
      facts,
      predicates: facts.filter(f => f.kind === "capability").map(f => f.raw).sort(),
      summary: {
        abilityCount: abilities.length,
        factCount: facts.length,
        produces: Object.keys(classified.produces || {}).sort(),
        consumes: Object.keys(classified.consumes || {}).sort(),
        caps: (classified.caps || []).slice().sort(),
      },
    };
  }

  function attachSemanticIR(result, card) {
    Object.defineProperty(result, "ir", {
      enumerable: false,
      configurable: true,
      get() {
        const value = semanticIR(card, result);
        Object.defineProperty(result, "ir", { value, enumerable: false, configurable: true });
        return value;
      },
    });
    return result;
  }

  // ============================ PIPELINE: TAG ===============================
  // Per-segment capability flags. These are the currency of the enablement
  // families (untap→tap, etb→blink, death→payoff, …). Kept deliberately
  // recognizable; tightening for false-hubs happens later, against real decks.
  // A "free/cheap" untap activation has no mana cost beyond the untap itself —
  // these are the ones that go infinite (return-a-Forest, {0}, {Q}). A costed
  // untap ({3},{T}: untap) just trades mana and isn't a combo on its own.
  function isFreeUntap(cost) {
    if (/\{q\}/.test(cost)) return true;                 // the untap symbol itself
    if (/return (a|an|another|two) .* to (its|your) owner'?s? hand/.test(cost)) return true;
    if (/^\{0\}/.test(cost) || cost === "" ) return true;
    return !/\{[1-9wubrgc]/.test(cost);                  // no real mana in the cost
  }

  function numberWordValue(word) {
    const map = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
    if (word == null) return 1;
    const s = String(word).toLowerCase();
    if (/^\d+$/.test(s)) return parseInt(s, 10);
    return map[s] || 1;
  }

  function manaCostValue(cost) {
    let total = 0;
    for (const m of String(cost || "").matchAll(/\{([^}]+)\}/g)) {
      const sym = m[1].toLowerCase();
      if (/^\d+$/.test(sym)) total += parseInt(sym, 10);
      else if (/^[wubrgc]$/.test(sym)) total += 1;
      else if (sym === "t" || sym === "q") total += 0;
      else if (sym === "x") total += 0;
      else total += 1;
    }
    return total;
  }

  const MANA_COLORS = ["w", "u", "b", "r", "g"];

  function manaCostProfile(cost, genericFallback = 0) {
    const profile = { total: 0, generic: 0, colorless: 0, colors: Object.fromEntries(MANA_COLORS.map(color => [color, 0])) };
    let sawSymbol = false;
    for (const m of String(cost || "").matchAll(/\{([^}]+)\}/g)) {
      sawSymbol = true;
      const sym = m[1].toLowerCase();
      if (/^\d+$/.test(sym)) {
        const value = parseInt(sym, 10);
        profile.generic += value;
        profile.total += value;
      } else if (MANA_COLORS.includes(sym)) {
        profile.colors[sym]++;
        profile.total++;
      } else if (sym === "c") {
        profile.colorless++;
        profile.total++;
      } else if (sym !== "x" && sym !== "t" && sym !== "q") {
        profile.generic++;
        profile.total++;
      }
    }
    if (!sawSymbol && genericFallback > 0) {
      profile.generic = genericFallback;
      profile.total = genericFallback;
    }
    return profile;
  }

  function maxManaProduced(text) {
    let best = 0;
    const s = String(text || "").toLowerCase();
    for (const m of s.matchAll(/\badd ((?:\{[wubrgc]\})+)/g)) {
      best = Math.max(best, (m[1].match(/\{/g) || []).length);
    }
    for (const m of s.matchAll(/\badd (one|two|three|four|five|six|seven|eight|nine|ten|\d+|x) (?:mana|\{[wubrgc]\})/g)) {
      const n = m[1] === "x" ? 0 : numberWordValue(m[1]);
      best = Math.max(best, n);
    }
    return best;
  }

  function tokenCountFor(text, tokenWord) {
    const re = new RegExp("\\bcreate (?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|\\d+)?[^.]{0,80}\\b" + tokenWord + " tokens?\\b");
    const s = String(text || "").toLowerCase();
    const match = s.match(re);
    if (!match) return 0;
    const count = match[0].match(/\b(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\b/);
    return numberWordValue(count && count[1]);
  }

  function artifactTokenCountFor(text) {
    const s = String(text || "").toLowerCase();
    let total = 0;
    for (const match of s.matchAll(/\bcreate\b[^.]{0,160}\btokens?\b/g)) {
      const phrase = match[0];
      if (!/\b(artifact|treasure|clue|food|blood|map)\b/.test(phrase)) continue;
      if (/\b(that many|x)\b/.test(phrase)) continue;
      const count = phrase.match(/\b(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\b/);
      total += numberWordValue(count && count[1]);
    }
    return total;
  }

  const TOKEN_COLOR_WORDS = { white: "w", blue: "u", black: "b", red: "r", green: "g" };
  function creatureTokenColors(text) {
    const s = String(text || "").toLowerCase();
    const colors = new Set();
    for (const m of s.matchAll(/\bcreate\b[^.]{0,120}\bcreature tokens?\b/g)) {
      const phrase = m[0];
      for (const [word, color] of Object.entries(TOKEN_COLOR_WORDS)) {
        if (new RegExp("\\b" + word + "\\b").test(phrase)) colors.add(color);
      }
      if (/\bcolorless\b/.test(phrase)) colors.add("colorless");
    }
    return [...colors];
  }

  function producedManaProfile(text) {
    const s = String(text || "").toLowerCase();
    const profile = { total: maxManaProduced(s), any: 0, colorless: 0, colors: Object.fromEntries(MANA_COLORS.map(color => [color, 0])) };
    if (/\badd\b.{0,40}\bmana of any (one )?color\b/.test(s)) profile.any = Math.max(profile.any, profile.total || 1);
    if (/\badd\b.{0,80}\bmana in any combination of colors\b/.test(s)) profile.any = Math.max(profile.any, profile.total || 1);
    for (const m of s.matchAll(/\badd ((?:\{[wubrgc]\})+)/g)) {
      const symbols = [...m[1].matchAll(/\{([wubrgc])\}/g)].map(match => match[1].toLowerCase());
      for (const sym of symbols) {
        if (MANA_COLORS.includes(sym)) profile.colors[sym]++;
        else if (sym === "c") profile.colorless++;
      }
      profile.total = Math.max(profile.total, symbols.length);
    }
    if (/\badd (one|two|three|four|five|six|seven|eight|nine|ten|\d+) colorless mana\b/.test(s)) {
      const match = s.match(/\badd (one|two|three|four|five|six|seven|eight|nine|ten|\d+) colorless mana\b/);
      profile.colorless = Math.max(profile.colorless, numberWordValue(match && match[1]));
    }
    return profile;
  }

  function variableManaUnitProfile(text) {
    const s = String(text || "").toLowerCase();
    const hasVariableQuantity = /\bfor each\b|\bwhere x is\b|\bequal to\b|\badd x mana\b|\badd an amount\b|\bthat much mana\b/.test(s);
    const hasMana = /\badd\b/.test(s) && (/\bmana\b/.test(s) || /\{[wubrgc]\}/.test(s));
    if (!hasVariableQuantity || !hasMana) return null;
    const profile = { total: 1, any: 0, colorless: 0, colors: Object.fromEntries(MANA_COLORS.map(color => [color, 0])) };
    if (/\bmana in any combination of colors\b|\bmana of any (one )?color\b/.test(s)) {
      profile.any = 1;
      return profile;
    }
    const symbolMatch = s.match(/\badd (?:an amount of |x )?((?:\{[wubrgc]\})+)/);
    if (symbolMatch) {
      for (const m of symbolMatch[1].matchAll(/\{([wubrgc])\}/g)) {
        const sym = m[1].toLowerCase();
        if (MANA_COLORS.includes(sym)) profile.colors[sym]++;
        else if (sym === "c") profile.colorless++;
      }
      profile.total = Math.max(1, (symbolMatch[1].match(/\{/g) || []).length);
      return profile;
    }
    profile.any = 1;
    return profile;
  }

  function addManaCostCaps(caps, prefix, profile) {
    caps.add(prefix + "-cost:" + profile.total);
    caps.add(prefix + "-generic-cost:" + profile.generic);
    caps.add(prefix + "-colorless-cost:" + profile.colorless);
    for (const color of MANA_COLORS) if (profile.colors[color]) caps.add(prefix + "-color-" + color + ":" + profile.colors[color]);
  }

  function addManaCostProfiles(...profiles) {
    return {
      total: profiles.reduce((sum, profile) => sum + (profile.total || 0), 0),
      generic: profiles.reduce((sum, profile) => sum + (profile.generic || 0), 0),
      colorless: profiles.reduce((sum, profile) => sum + (profile.colorless || 0), 0),
      colors: Object.fromEntries(MANA_COLORS.map(color => [
        color,
        profiles.reduce((sum, profile) => sum + (profile.colors[color] || 0), 0),
      ])),
    };
  }

  function addProducedManaCaps(caps, prefix, profile) {
    caps.add(prefix + "-mana-produced:" + Math.max(1, profile.total));
    if (profile.any) caps.add(prefix + "-mana-any:" + profile.any);
    if (profile.colorless) caps.add(prefix + "-mana-c:" + profile.colorless);
    for (const color of MANA_COLORS) if (profile.colors[color]) caps.add(prefix + "-mana-" + color + ":" + profile.colors[color]);
  }

  function addVariableManaUnitCaps(caps, profile) {
    caps.add("variable-mana-unit-produced:" + Math.max(1, profile.total));
    if (profile.any) caps.add("variable-mana-unit-any:" + profile.any);
    if (profile.colorless) caps.add("variable-mana-unit-c:" + profile.colorless);
    for (const color of MANA_COLORS) if (profile.colors[color]) caps.add("variable-mana-unit-" + color + ":" + profile.colors[color]);
  }

  const NON_ACCESS_EXILE_COUNTERS = new Set([
    "age", "charge", "coin", "experience", "flying", "indestructible", "lifelink",
    "loyalty", "oil", "poison", "shield", "stun", "time", "verse", "vigilance"
  ]);
  function exiledCardAccessMarkers(text) {
    if (!/\bexil/.test(text || "")) return [];
    const markers = new Set();
    for (const m of String(text).matchAll(/\b([a-z][a-z-]*) counters?\b/g)) {
      const marker = m[1];
      if (!NON_ACCESS_EXILE_COUNTERS.has(marker)) markers.add(marker);
    }
    return [...markers];
  }

  function selfNamePattern(name) {
    const simple = String(name || "")
      .split("//")[0]
      .replace(/[^\p{L}\p{N}' -]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    if (!simple) return null;
    return simple.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  }

  function capsOf(segments, classified, isLand) {
    const caps = new Set();
    const allText = segments.map(s => s.raw).join(" ");
    const hasCheapInstantImprint = /\bexile an? instant card\b.{0,80}\bmana value 2 or less\b/.test(allText);
    const typeText = classified._type || "";
    const cmc = Number.isFinite(classified._cmc) ? classified._cmc : null;
    if (/\bequipment\b/.test(typeText) || /\bequip\b/.test(allText) || /\bfor mirrodin!\b/.test(allText)) {
      caps.add("is-equipment-attachment-source");
      caps.add("is-creature-attachment-source");
    }
    if (/\baura\b/.test(typeText) && /\benchant (?:creature|permanent)\b/.test(allText)) {
      caps.add("is-aura-attachment-source");
      caps.add("is-creature-attachment-source");
    }
    if (/\baura\b/.test(typeText) && /\benchant (?:player|opponent)\b/.test(allText))
      caps.add("is-player-attachment-source");
    if (/\bwhenever [^.]{0,100} becomes (?:attached|equipped)\b/.test(allText)
        || /\bwhenever an? aura [^.]{0,100} is attached\b/.test(allText)
        || /\bwhenever you attach\b/.test(allText)) {
      caps.add("is-attachment-payoff");
    }
    // Lands tap for mana and some untap lands; counting them as combo pieces
    // makes every basic + fetchland a "combo" node. Exclude lands entirely from
    // the tap/untap/mana enablement families.
    for (const s of segments) {
      const e = s.effect, c = s.cost;
      const effectAndRaw = e + " " + s.raw;
      const effectAndTrigger = e + " " + s.trigger;
      const triggerAndEffect = s.trigger + " " + e;
      if (isLand
          && /\bwhen this land enters\b/.test(s.trigger)
          && /\breturn (a|another) land you control to (its|their) owner'?s hand\b/.test(e)) {
        caps.add("is-self-bounce-land");
      }
      const exileAccessMarkers = exiledCardAccessMarkers(effectAndRaw);
      if (exileAccessMarkers.length) {
        const grantsMarkedExileAccess =
          /(you may|may).{0,80}\b(play|cast)\b/.test(effectAndRaw)
          || /\bplay lands and cast\b/.test(effectAndRaw)
          || /\b(play|cast)\b.{0,80}\bfrom among cards? you exiled\b/.test(effectAndRaw)
          || /\bexiled card\b.{0,120}\b(you may|may).{0,80}\b(play|cast)\b/.test(effectAndRaw);
        const createsMarkedExileAccess =
          /\bexile\b/.test(effectAndRaw)
          && !grantsMarkedExileAccess
          && exileAccessMarkers.some(marker => new RegExp(`\\b${marker} counters?\\b`).test(effectAndRaw));
        if (createsMarkedExileAccess) {
          caps.add("is-exile-access-source");
          for (const marker of exileAccessMarkers) caps.add("exile-access-source:" + marker);
        }
        if (grantsMarkedExileAccess) {
          caps.add("uses-exiled-card-access");
          for (const marker of exileAccessMarkers) caps.add("uses-exiled-card-access:" + marker);
        }
      }
      if (!isLand) {
        // taps for mana: an activated ability that taps and adds mana. Tag the
        // PERMANENT TYPE that taps, so an untapper only combos with it if the
        // untapper can actually untap that type (untapping lands ≠ re-using a rock).
        if (s.kind === "activated" && /\{t\}|\{q\}/.test(c) && /\badd \{|\badd (one|two|three|x|an amount)/.test(e)) {
          caps.add("taps-for-mana");
          caps.add("mana-produced:" + Math.max(1, maxManaProduced(e)));
          if (producedManaProfile(e).colorless > 0) caps.add("produces-colorless-mana");
          const variableMana = variableManaUnitProfile(e);
          if (variableMana) {
            caps.add("is-variable-count-mana-source");
            addVariableManaUnitCaps(caps, variableMana);
            let proofEligibleBoardCount = false;
            const countMatch = e.match(/(?:for each|equal to the number of) ([a-z][a-z-]*)s? (?:you control|on the battlefield)/);
            if (countMatch) {
              const subject = countMatch[1].replace(/s$/, "");
              caps.add("variable-mana-counts:" + subject);
              caps.add("board-count-scope:" + subject);
              proofEligibleBoardCount = true;
            }
            if (/\bgreatest power among creatures you control\b/.test(e)) {
              caps.add("variable-mana-counts:greatest-creature-power");
              caps.add("board-count-scope:greatest-creature-power");
              proofEligibleBoardCount = true;
            }
            if (/\bequal to\b.{0,80}\b(this|its|this creature|[a-z' -]+)'?s power\b/.test(e)) {
              caps.add("variable-mana-counts:source-power");
              caps.add("board-count-scope:source-power");
              proofEligibleBoardCount = true;
            }
            if (proofEligibleBoardCount) {
              caps.add("is-variable-board-count-mana-source");
              if (/creature/.test(classified._type || "")) caps.add("is-variable-creature-mana-source");
            }
          }
          const mt = classified._type || "";
          if (/creature/.test(mt)) caps.add("mana-from-creature");
          else if (/artifact/.test(mt)) caps.add("mana-from-artifact");
          // (lands are excluded from caps entirely; other types are rare)
        }
        // a repeatable activated ability worth untapping for (has {T} in cost)
        if (s.kind === "activated" && /\{t\}/.test(c)) caps.add("has-tap-ability");
        if (s.kind === "activated" && !/\badd \{|\badd (one|two|three|x|an amount)/.test(e))
          caps.add("has-nonmana-activated-ability");
        if (s.kind === "activated"
            && /\{t\}/.test(c)
            && /\bmay cast\b/.test(e)
            && /\bwithout paying its mana cost\b/.test(e)
            && /\b(exile|top|library)\b/.test(e)) {
          caps.add("is-tap-free-cast-engine");
          caps.add("tap-free-cast-payment:free");
          if (/\blibrary\b|\btop\b/.test(e)) caps.add("tap-free-cast-origin:library");
          if (/\bexile\b/.test(e)) caps.add("tap-free-cast-origin:exile");
          if (manaCostValue(c) > 0) caps.add("tap-free-cast-requires:mana");
        }
        if (s.kind === "activated"
            && /\{t\}/.test(c)
            && /\bcopy target instant or sorcery spell you control\b/.test(e)
            && /\bactivate only if you(?:'| have)ve cast (?:three|3) or more spells this turn\b/.test(e)) {
          caps.add("is-cast-threshold-spell-copy-engine");
          caps.add("spell-copy-engine-requires:spell-count");
          caps.add("spell-copy-engine-threshold:3");
          caps.add("spell-copy-engine-target:own-instant-or-sorcery");
        }
        if (s.kind === "activated"
            && /\{t\}/.test(c)
            && !/\{[^}]*[1-9wubrgcx][^}]*\}/.test(c)
            && !/\bsacrifice\b|\bpay\b|\bdiscard\b|\bexile\b|\bremove\b/.test(c)
            && /\bthis creature deals? 1 damage to (any target|target creature)\b/.test(e))
          caps.add("has-free-creature-ping");
        if (s.kind === "activated"
            && /remove a \+1\/\+1 counter from (this|it|this creature)/.test(c)
            && /\bdeals? \d+ damage to (any target|target|target player|each opponent|an opponent)/.test(e)) {
          caps.add("is-counter-to-damage-source");
        }
        if (s.kind === "activated"
            && /\bpay \d+ life\b/.test(c)
            && !/\{t\}|\{q\}|\bsacrifice\b|\bdiscard\b|\bexile\b/.test(c)
            && !/\bactivate (this ability )?only once\b|only once each turn|\bactivate only as a sorcery\b/.test(effectAndRaw)
            && /\bdeals? \d+ damage to (any target|target opponent|target player|an opponent|each opponent)\b/.test(e)) {
          const lifeCost = c.match(/\bpay (\d+) life\b/);
          const damageAmount = e.match(/\bdeals? (\d+) damage\b/);
          const paid = lifeCost ? Number(lifeCost[1]) : 0;
          const damage = damageAmount ? Number(damageAmount[1]) : 0;
          if (paid > 0 && damage > 0 && damage >= paid) {
            caps.add("is-life-paid-damage-source");
            caps.add("life-paid-damage-life-cost:" + paid);
            caps.add("life-paid-damage-amount:" + damage);
            caps.add("life-paid-damage-can-hit-opponent");
          }
        }
        if (s.kind === "activated" && /\bartifact\b/.test(classified._type || "") && /draw a card/.test(e) && /put .* on top of (its owner.?s|your) library/.test(e + " " + c))
          caps.add("is-self-top-draw-artifact");
        // activated ability on a creature. Creature-scoped reducers must not
        // fan out to mana rocks merely because those artifacts have tap abilities.
        if (s.kind === "activated" && /\bcreature\b/.test(classified._type || "")) caps.add("has-creature-activated-ability");
        // untapper: untaps OTHER permanents (not just itself). Track if it's
        // free AND what TYPE it untaps — a combo only forms if the untapper can
        // actually untap the thing that taps for mana (untapping lands does NOT
        // re-enable a mana rock; that was the dominant false positive).
        const um = e.match(/untap (?:target |another target |that |each |all |enchanted |up to (?:one|two|\w+) )?(creature|land|artifact|permanent)/);
        if (um && !/doesn't untap|don't untap/.test(e)) {
          caps.add("is-untapper");
          // Only a REPEATABLE (activated) free untap can drive a combo loop —
          // ETB / one-shot / each-other-turn untaps were the audit's false
          // hasCombo source, so they get is-untapper but NOT is-free-untapper.
          if (s.kind === "activated" && isFreeUntap(c)) {
            caps.add("is-free-untapper");
            const tgt = um[1];
            caps.add(tgt === "permanent" ? "untaps-any" : "untaps-" + tgt);  // untaps-creature / untaps-land / untaps-artifact / untaps-any
          }
        }
        const isCheapEngineUntapInstant = /\binstant\b/.test(typeText)
          && (cmc == null || cmc <= 2 || (cmc <= 3 && /\bdraw a card\b/.test(e)));
        if (isCheapEngineUntapInstant && /untap all nonland permanents you control/.test(e)) {
          caps.add("is-cheap-instant-nonland-permanent-untap-spell");
          caps.add("is-cheap-instant-engine-untap-spell");
          if (/\bdraw a card\b/.test(e)) caps.add("is-cheap-instant-cantrip-engine-untap-spell");
          caps.add("untap-spell-target:nonland");
          caps.add("untap-spell-target:artifact");
          caps.add("untap-spell-target:creature");
        }
        if (isCheapEngineUntapInstant && /\buntap\b/.test(e)) {
          const allTextForUntap = `${e} ${s.raw || ""}`;
          if (/\buntap target permanent\b/.test(allTextForUntap) || /\btap or untap target permanent\b/.test(allTextForUntap)) {
            caps.add("is-cheap-instant-engine-untap-spell");
            caps.add("untap-spell-target:permanent");
            caps.add("untap-spell-target:artifact");
            caps.add("untap-spell-target:creature");
          }
          if (/\buntap target artifact\b/.test(allTextForUntap) || /\btap or untap target artifact\b/.test(allTextForUntap) || /\b(?:tap or )?untap target artifact, creature, or land\b/.test(allTextForUntap)) {
            caps.add("is-cheap-instant-engine-untap-spell");
            caps.add("untap-spell-target:artifact");
          }
          if (/\buntap target creature\b/.test(allTextForUntap) || /\btap or untap target creature\b/.test(allTextForUntap) || /\b(?:tap or )?untap target artifact, creature, or land\b/.test(allTextForUntap)) {
            caps.add("is-cheap-instant-engine-untap-spell");
            caps.add("untap-spell-target:creature");
          }
          if (/\btarget creatures?\b/.test(allTextForUntap)
              && /\buntap (?:it|that creature|those creatures|target creatures?)\b/.test(allTextForUntap)) {
            caps.add("is-cheap-instant-engine-untap-spell");
            caps.add("untap-spell-target:creature");
          }
          if ((caps.has("is-cheap-instant-engine-untap-spell") || caps.has("is-cheap-instant-nonland-permanent-untap-spell"))
              && /\bdraw a card\b/.test(allTextForUntap))
            caps.add("is-cheap-instant-cantrip-engine-untap-spell");
        }
        if (s.kind === "activated" && /\buntap (this|it|this artifact|this creature|this permanent)/.test(e)) {
          caps.add("is-self-untapper");
          caps.add("self-untap-cost:" + manaCostValue(c));
          addManaCostCaps(caps, "self-untap", manaCostProfile(c));
        }
        if (s.kind === "activated" && /\buntap target creature\b/.test(e)) {
          caps.add("is-repeatable-creature-untap-ability");
          addManaCostCaps(caps, "creature-untap-ability", manaCostProfile(c));
          if (/\{t\}|\{q\}/.test(c)) caps.add("creature-untap-ability-taps-source");
        }
        if (s.kind === "activated" && /\{t\}|\{q\}/.test(c) && /\bdraw (a card|two cards|three cards)\b/.test(e)) {
          caps.add("is-repeatable-tap-draw-ability");
          addManaCostCaps(caps, "tap-draw-ability", manaCostProfile(c));
        }
        if (s.kind === "activated" && /\{t\}|\{q\}/.test(c) && /\byou gain \d+ life\b/.test(e)) {
          caps.add("is-repeatable-tap-lifegain-ability");
          addManaCostCaps(caps, "tap-lifegain-ability", manaCostProfile(c));
        }
        if (s.kind === "etb") {
          const lm = e.match(/untap (?:up to )?(one|two|three|four|five|six|seven|eight|nine|ten|\d+)? ?(?:target )?lands?/);
          if (lm) {
            caps.add("etb-untaps-land");
            caps.add("etb-untaps-land:" + numberWordValue(lm[1]));
          }
          if (/untap (target|up to one target|that) permanent/.test(e))
            caps.add("etb-untaps-permanent");
        }
      }
      // ETB: a trigger that fires when this permanent enters
      if (s.kind === "triggered" || s.kind === "etb") caps.add("has-trigger");
      if (s.kind === "etb" && /\bthis\b|^when [a-z]+ enters|enters the battlefield/.test(s.trigger)) caps.add("has-etb");
      if (s.kind === "triggered"
          && /\bwhenever a creature dies\b/.test(s.trigger)
          && /\buntap this creature\b/.test(e)
          && !/\bonly once (each|per) turn\b|\btriggers? only once (each|per) turn\b/.test(effectAndRaw))
        caps.add("has-death-untap-self");
      // blink/flicker: exile then return to the battlefield
      if (/exile .* return (it|them|that card|those cards|the exiled)/.test(e) && /battlefield/.test(e)) caps.add("is-blink");
      if (s.kind === "activated" && /\buntap enchanted creature\b/.test(e)) {
        caps.add("is-attached-creature-untapper");
        caps.add("attached-untap-target:enchanted-creature");
        addManaCostCaps(caps, "attached-creature-untap", manaCostProfile(c));
      }
      {
        const grantedAbility = effectAndRaw.match(/equipped creature has ["“]([^"”]+)["”]/);
        const grantedSelfUntap = grantedAbility && grantedAbility[1].match(/^((?:\{[^}]+\}|,\s*)+):([\s\S]*)$/);
        if (grantedSelfUntap && (/\{q\}/.test(grantedSelfUntap[1]) || /\buntap (this|equipped) creature\b/.test(grantedSelfUntap[2]))) {
          const grantedCost = grantedSelfUntap[1].replace(/\{q\}/g, "");
          caps.add("is-attached-creature-untapper");
          caps.add("attached-untap-target:equipped-creature");
          if (/\{q\}/.test(grantedSelfUntap[1])) caps.add("attached-untap-uses-untap-symbol");
          addManaCostCaps(caps, "attached-creature-untap", manaCostProfile(grantedCost));
          if (/gets \+\d+\/\+\d+/.test(grantedSelfUntap[2])) caps.add("attached-untap-adds-pump");
        }
      }
      if (s.kind === "etb"
          && /exile (another target |target |up to one target )?(non-angel )?(creature|permanent)( you control)?/.test(effectAndRaw)
          && /return (that card|it|the exiled card|the exiled cards|them) to the battlefield/.test(effectAndRaw)) {
        caps.add("is-etb-blink");
        if (/permanent/.test(effectAndRaw)) caps.add("etb-blinks-permanent");
        if (/creature/.test(effectAndRaw)) caps.add("etb-blinks-creature");
      }
      // Repeatable blink engines can turn ETB land-untappers into loops. This is
      // capability-based, not a card-name exception: it covers granted
      // activated blink abilities as well as native activated flicker text.
      if (/exile (this creature|target creature|another target creature|target permanent|another target permanent|it|them|that card).{0,80}return (it|them|that card|the exiled|this creature) to the battlefield/.test(effectAndRaw)) {
        const quoted = effectAndRaw.match(/has\s+"([^"]+):[^"]*exile [^"]*return [^"]*battlefield[^"]*"/);
        const blinkCost = s.kind === "activated" ? manaCostValue(c) : quoted ? manaCostValue(quoted[1]) : 0;
        if (s.kind === "activated" || quoted) {
          caps.add("is-repeatable-blink");
          caps.add("blink-cost:" + blinkCost);
        }
      }
      // sac outlet: an activated ability whose COST sacrifices a creature/permanent
      if (s.kind === "activated" && /sacrifice (a|an|another|two|three|x|that) (creature|permanent|artifact|token)|sacrifice x [a-z]+s?/.test(c)) {
        caps.add("is-sac-outlet");
        addManaCostCaps(caps, "sac-outlet-activation", manaCostProfile(c));
        if (/sacrifice (a|an|another|two|three|x|that) creature|sacrifice x [a-z]+s?/.test(c)) caps.add("is-creature-sac-outlet");
        if (/sacrifice x [a-z]+s?/.test(c)) caps.add("is-creature-token-sac-outlet");
        if (/sacrifice (a|an|another|two|three|x|that) (artifact|token)/.test(c)) caps.add("is-artifact-sac-outlet");
        if (/pay \d+ life/.test(c)
            && /sacrifice (a|an|another|two|three|x|that) creature/.test(c)
            && /create .*treasure/.test(e)) {
          const lifeCost = c.match(/pay (\d+) life/);
          const treasureCount = Math.max(1, tokenCountFor(e, "treasure"));
          caps.add("is-life-paid-treasure-sac-outlet");
          caps.add("life-sac-outlet-life-cost:" + (lifeCost ? lifeCost[1] : "1"));
          caps.add("life-sac-outlet-mana-produced:" + treasureCount);
          caps.add("life-sac-outlet-mana-any:" + treasureCount);
        }
        if (/\badd \{|\badd (one|two|three|x|an amount)/.test(e)) {
          caps.add("is-mana-sac-outlet");
          addProducedManaCaps(caps, "sac-outlet", producedManaProfile(e));
        }
      }
      const artifactExtraTurnSacMatch = c.match(/\bsacrifice (one|two|three|four|five|six|seven|eight|nine|ten|\d+) artifacts?\b/);
      if (s.kind === "activated"
          && artifactExtraTurnSacMatch
          && /\btake an extra turn\b/.test(e)
          && !/activate only once (each|per) turn/.test(effectAndRaw)) {
        const sacCount = numberWordValue(artifactExtraTurnSacMatch[1]);
        caps.add("is-artifact-sacrifice-extra-turn-engine");
        caps.add("is-artifact-sac-outlet");
        caps.add("artifact-extra-turn-sac-count:" + sacCount);
      }
      const counterThresholdExtraTurnMatch = c.match(/\bremove (one|two|three|four|five|six|seven|eight|nine|ten|\d+) charge counters? from (?:this artifact|this permanent|it)\b/);
      if (s.kind === "activated"
          && counterThresholdExtraTurnMatch
          && /\btake an extra turn\b/.test(e)
          && !/activate only once (each|per) turn/.test(effectAndRaw)) {
        const threshold = numberWordValue(counterThresholdExtraTurnMatch[1]);
        caps.add("is-counter-threshold-extra-turn-engine");
        caps.add("counter-threshold-extra-turn-threshold:" + threshold);
        caps.add("counter-threshold-extra-turn-type:charge");
        caps.add("counter-threshold-extra-turn-target:self-artifact");
        if (/\{t\}/.test(c)) caps.add("counter-threshold-extra-turn-activation-taps-source");
      }
      if (s.kind === "activated"
          && /\bdouble the number of each kind of counter on target (artifact|creature|land|permanent)\b/.test(e)
          && !/activate only once (each|per) turn/.test(effectAndRaw)) {
        const target = e.match(/\bdouble the number of each kind of counter on target (artifact|creature|land|permanent)\b/)[1];
        caps.add("is-repeatable-counter-doubler");
        caps.add(target === "permanent" ? "counter-doubler-target:any-permanent" : "counter-doubler-target:" + target);
        addManaCostCaps(caps, "counter-doubler", manaCostProfile(c));
        if (/\{t\}/.test(c)) caps.add("counter-doubler-activation-taps-source");
      }
      if (/\bproliferate\b/.test(e)) {
        const proliferateCount =
          /\bproliferate twice\b/.test(e) ? 2
            : /\bproliferate three times\b/.test(e) ? 3
              : 1;
        if (s.kind === "activated" && !/activate only once (each|per) turn/.test(effectAndRaw)) {
          caps.add("is-repeatable-proliferator");
          caps.add("proliferate-count-per-turn:" + proliferateCount);
          addManaCostCaps(caps, "proliferate", manaCostProfile(c));
          if (/\{t\}/.test(c)) caps.add("proliferate-activation-taps-source");
        }
        if ((s.kind === "triggered" || s.kind === "etb")
            && /\bat the beginning of (?:your|each) (?:upkeep|combat|end step)\b/.test(s.trigger)
            && !/only once (each|per) turn|triggers? only once/.test(effectAndRaw)) {
          caps.add("is-turn-cycle-proliferator");
          caps.add("proliferate-count-per-turn:" + proliferateCount);
        }
      }
      if (/\bif you would proliferate, proliferate twice instead\b|\bproliferate an additional time\b/.test(effectAndRaw)) {
        caps.add("is-proliferate-multiplier");
        caps.add("proliferate-multiplier:2");
      }
      // cost reducer (Round-3 gate): only a reducer of ACTIVATED ABILITIES is
      // relevant to the cost-reduction→ability family. Scope-specific reducers
      // (creatures, Foods, etc.) must not fan out to all tap abilities.
      const artifactAbilityCostReducer = /activated abilities of artifacts?.{0,60}cost \{?\d* ?[^ ]* ?less|enchanted artifacts?'?s activated abilities cost \{?\d* ?[^ ]* ?less/.test(e);
      if (/activated abilities (of |that )?foods?.{0,30}cost \{?\d* ?[^ ]* ?less|activated abilities of foods/.test(e))
        caps.add("is-food-ability-cost-reducer");
      else if (/activated abilities (of |that )?creatures?.{0,30}cost \{?\d* ?[^ ]* ?less|activated abilities of creatures/.test(e))
        caps.add("is-creature-ability-cost-reducer");
      else if (artifactAbilityCostReducer)
        caps.add("is-artifact-activated-ability-cost-reducer");
      else if (/activated abilities (of |that |you )?.{0,30}cost \{?\d* ?[^ ]* ?less|abilities (you activate )?.{0,60}cost \{?\d* ?[^ ]* ?less/.test(e))
        caps.add("is-cost-reducer");
      if (/activated abilities (of |that |you |of artifacts?|of creatures?)?.{0,80}cost|abilities (you activate )?.{0,80}cost|enchanted artifacts?'?s activated abilities cost/.test(e)) {
        const reduction = e.match(/cost \{?(\d+)\}? less/);
        if (reduction) caps.add("activated-ability-cost-reduction:" + reduction[1]);
        if (/can't reduce .*cost to less than (one|1) mana|can't reduce the mana in that cost to less than (one|1) mana/.test(e))
          caps.add("activated-ability-cost-reduction-minimum:1");
      }
      else if (/(spells?|creature spells?) .* cost \{?\d* ?[^ ]* ?less|costs? \{\d+\} less to cast/.test(e))
        caps.add("is-spell-cost-reducer");
      if (/(spells?|creature spells?|instant and sorcery spells?) .* cost \{?\d* ?[^ ]* ?less|costs? \{\d+\} less to cast/.test(e)) {
        const spellReduction = e.match(/cost \{?(\d+)\}? less|costs? \{(\d+)\} less to cast/);
        caps.add("spell-cost-reduction:" + (spellReduction ? (spellReduction[1] || spellReduction[2]) : "1"));
        if (/\bred spells?\b/.test(e)) caps.add("spell-cost-reduction-scope:r");
        if (/\binstant and sorcery spells?\b|\binstant or sorcery spells?\b/.test(e)) caps.add("spell-cost-reduction-scope:instant-sorcery");
      }
      if (/(another target |target )creature.{0,40}gains? lifelink until end of turn/.test(e))
        caps.add("grants-lifelink-to-creature");
      if (/\bartifact spells? you cast cost \{?\d* ?[^ ]* ?less|artifact spells? cost \{?\d* ?[^ ]* ?less/.test(e)
          || /\bhistoric spells? you cast cost \{?\d* ?[^ ]* ?less/.test(e)
          || /choose .*artifact.{0,80}spells? you cast of the chosen type cost \{?\d* ?[^ ]* ?less/.test(effectAndRaw))
        caps.add("is-artifact-spell-cost-reducer");
      if (/whenever you tap (a|an) (permanent|artifact) for \{c\}|whenever you tap (a|an) (permanent|artifact) for colorless mana/.test(effectAndRaw)
          || /(?:tap|tapped).{0,80}(?:permanent|artifact).{0,80}(?:\{c\}|colorless mana).{0,80}(?:add an additional \{c\}|add one additional colorless mana|produces? an additional \{c\})/.test(effectAndRaw)
          || /whenever you tap (a|an) nonland permanent for mana.{0,80}add one mana of any type that permanent produced/.test(effectAndRaw)) {
        caps.add("is-colorless-mana-amplifier");
        caps.add("colorless-mana-amplifier:1");
      }
      // copy effects. Split generic copy text from permanent-copy scope so
      // spell-copy/self-copy does not trigger arbitrary ETB cards.
      if (/copy (target|that)/.test(e) || /create a token that.?s a copy/.test(e) || /token that.?s a copy/.test(e) || /copy it/.test(e)) {
        caps.add("is-copy");
        const permanentCopy =
          /copy target (creature|permanent|artifact)|copy of (?:up to one )?(?:other )?target|copy of target (?:nonlegendary |nontoken )?(?:artifact or )?creature|copy of (?:a|another) creature|copy of a permanent/.test(e);
        if (permanentCopy) {
          caps.add("is-permanent-copy");
          if (/creature/.test(e) || /equipped creature|enchanted creature/.test(effectAndRaw))
            caps.add("permanent-copy-target:creature");
          else if (/artifact/.test(e))
            caps.add("permanent-copy-target:artifact");
          else
            caps.add("permanent-copy-target:permanent");
          if (s.kind === "activated"
              || (s.kind === "triggered"
                && !/when\b.{0,80}\benters\b/.test(s.trigger)
                && /\b(whenever|at the beginning of|at the end of)\b/.test(s.trigger))) {
            caps.add("is-repeatable-permanent-copy");
          }
        }
      }
      if (s.kind === "activated"
          && /\bdiscard your hand\b/.test(c)
          && /\bsacrifice (this|this artifact|this permanent|it)\b/.test(c)
          && /\badd\b/.test(e)) {
        caps.add("is-discard-hand-sac-mana-source");
        addProducedManaCaps(caps, "discard-hand-sac", producedManaProfile(e));
        addManaCostCaps(caps, "discard-hand-sac-source", manaCostProfile(classified._manaCost, Math.max(0, cmc == null ? 0 : cmc)));
      }
      if (s.kind === "activated" && /create .*token that.?s a copy of target .*creature/.test(e) && /haste/.test(e)) {
        caps.add("is-repeatable-hasty-creature-copy");
        caps.add("hasty-copy-target-creature");
        if (/target nonlegendary creature/.test(e)) caps.add("hasty-copy-target-requires-nonlegendary");
        caps.add("hasty-copy-token-has-haste");
        if (/(?:token (?:isn'?t|is not) legendary|except (?:it|that token) (?:isn'?t|is not) legendary)/.test(e))
          caps.add("hasty-copy-token-nonlegendary");
        if (/\{t\}/.test(c)) caps.add("hasty-copy-activation-taps-source");
        caps.add(/activate only as a sorcery/.test(effectAndRaw)
          ? "hasty-copy-activation-window:sorcery"
          : "hasty-copy-activation-window:instant");
        if (/(sacrifice|exile) (?:it|that token|those tokens) at the beginning of the next end step/.test(effectAndRaw))
          caps.add("hasty-copy-token-expires-next-end-step");
      }
      if (/\baura\b/.test(typeText)
          && /enchanted creature has/.test(effectAndRaw)
          && /\{t\}:\s*create .*token that.?s a copy of this creature/.test(effectAndRaw)
          && /haste/.test(effectAndRaw)) {
        caps.add("is-attached-self-hasty-creature-copy");
        caps.add("attached-copy-target-creature");
        caps.add("attached-copy-token-has-haste");
        caps.add("attached-copy-activation-taps-enchanted-creature");
        caps.add("attached-copy-activation-window:instant");
        if (/(sacrifice|exile) (?:it|that token|those tokens) at the beginning of the next end step/.test(effectAndRaw))
          caps.add("attached-copy-token-expires-next-end-step");
      }
      const precombatCopyText = effectAndRaw;
      const precombatCopyCreatesHastyToken = /beginning of combat on your turn/.test(precombatCopyText)
          && /create\b.{0,140}\btokens?\b.{0,100}\bcop(?:y|ies) of (?:equipped creature|(?:another )?target creature you control)/.test(precombatCopyText)
          && /\b(?:gains?|have) haste\b/.test(precombatCopyText)
          && !/\btapped and attacking\b|\broll a d20\b|\brandom\b|\bcoin flip\b/.test(precombatCopyText)
          && (!/\bcreate x tokens?\b/.test(precombatCopyText) || /\bwhere x is one plus\b/.test(precombatCopyText));
      if (precombatCopyCreatesHastyToken) {
        caps.add("is-precombat-hasty-creature-copy-source");
        caps.add("precombat-copy-target-creature");
        caps.add("precombat-copy-token-has-haste");
        caps.add("precombat-copy-created-before-attack");
        caps.add("precombat-copy-repeatable-each-combat");
        caps.add("precombat-copy-min-tokens:1");
        if (/token (?:isn'?t|is not) legendary|it'?s not legendary|except (?:the )?token isn'?t legendary/.test(precombatCopyText))
          caps.add("precombat-copy-token-nonlegendary");
      }
      if (/beginning of combat on your turn/.test(effectAndRaw)
          && /create .*token that.?s a copy of equipped creature/.test(effectAndRaw)
          && /token (isn'?t|is not) legendary/.test(effectAndRaw)
          && /token gains? haste/.test(effectAndRaw)) {
        caps.add("is-combat-copy-token-equipment");
        caps.add("combat-copy-token-haste");
        caps.add("combat-copy-token-nonlegendary");
      }
      const extraCombatAttackOnceLimited = /this ability triggers? only once|triggers? only once (each|per) turn|only triggers? once/.test(effectAndRaw);
      const extraCombatAttackConditional = /\bif (?:it'?s|it is|this is|there are|you pay|you do|.*attacking the player|.*first combat phase|.*delirium)\b/.test(effectAndRaw);
      const attackExtraCombatUntapsAll = /\buntap (?:all|each) creatures? you control\b/.test(effectAndRaw);
      const attackExtraCombatUntapsOther = /\buntap all other creatures? you control\b/.test(effectAndRaw);
      if (/attacks? for the first time each turn/.test(effectAndRaw)
          && /additional combat phase/.test(effectAndRaw)
          && !extraCombatAttackOnceLimited
          && !extraCombatAttackConditional) {
        caps.add("is-attack-extra-combat-source");
        caps.add("extra-combat-repeatable-with-fresh-token");
        caps.add("attack-extra-combat-trigger:declared-attack");
        caps.add("fresh-token-unused-attack-trigger");
        caps.add("attack-trigger-can-be-declared");
        caps.add("attack-extra-combat-adds-combat");
        if (attackExtraCombatUntapsAll) caps.add("attack-extra-combat-untaps-creatures");
        if (attackExtraCombatUntapsOther) caps.add("attack-extra-combat-untaps-other-creatures");
      }
      if (/hasn'?t been exerted this turn/.test(allText)
          && /as it attacks/.test(allText)
          && /additional combat phase/.test(allText)) {
        caps.add("is-attack-extra-combat-source");
        caps.add("extra-combat-repeatable-with-fresh-token");
        caps.add("attack-extra-combat-trigger:declared-attack");
        caps.add("fresh-token-unused-attack-trigger");
        caps.add("fresh-token-unused-exert-state");
        caps.add("attack-trigger-can-be-declared");
        caps.add("attack-extra-combat-adds-combat");
        if (/\buntap (?:all|each) creatures? you control\b/.test(allText)) caps.add("attack-extra-combat-untaps-creatures");
        if (/\buntap all other creatures? you control\b/.test(allText)) caps.add("attack-extra-combat-untaps-other-creatures");
      }
      const selfPattern = selfNamePattern(classified._name);
      const selfDealsCombatDamageToPlayer = new RegExp("\\b(?:this creature" + (selfPattern ? "|" + selfPattern : "") + ") deals? combat damage to (?:a |an |one or more )?(?:players?|opponents?)\\b").test(effectAndRaw);
      const combatDamageToPlayer = selfDealsCombatDamageToPlayer;
      const combatDamageExtraCombat = combatDamageToPlayer && /additional combat phase/.test(effectAndRaw);
      const combatDamageExtraCombatRestricted = /only [^.]{0,80} can attack during that combat phase/.test(effectAndRaw);
      const combatDamageExtraCombatOptionalPayment = /\bmay pay\b|\bif you pay\b/.test(effectAndRaw);
      if (combatDamageExtraCombat) {
        caps.add("combat-damage-extra-combat-requires-connect");
        if (combatDamageExtraCombatRestricted) caps.add("combat-damage-extra-combat-restricts-next-combat-attackers");
        if (/can'?t attack a player it has already attacked this turn/.test(effectAndRaw))
          caps.add("combat-damage-extra-combat-fresh-token-defending-player-reset");
      }
      if (combatDamageExtraCombat
          && !combatDamageExtraCombatRestricted
          && !combatDamageExtraCombatOptionalPayment
          && !extraCombatAttackOnceLimited) {
        caps.add("is-combat-damage-extra-combat-source");
        caps.add("extra-combat-repeatable-with-fresh-token");
        caps.add("fresh-token-unused-combat-damage-trigger");
        caps.add("combat-damage-extra-combat-adds-combat");
        if (/\buntap (?:all|each) creatures? you control\b/.test(effectAndRaw))
          caps.add("combat-damage-extra-combat-untaps-creatures");
        if (/\buntap all attacking creatures\b/.test(effectAndRaw))
          caps.add("combat-damage-extra-combat-untaps-attacking-creatures");
      }
      const combatDamageExtraTurn = combatDamageToPlayer && /\btake an extra turn after this one\b/.test(effectAndRaw);
      const attackExtraTurn = /whenever [^.]{0,120}\battacks\b[^.]{0,160}\btake an extra turn after this one\b/.test(effectAndRaw);
      if (combatDamageExtraTurn || attackExtraTurn) {
        caps.add(combatDamageExtraTurn ? "is-combat-damage-extra-turn-source" : "is-attack-extra-turn-source");
        if (combatDamageExtraTurn) caps.add("extra-turn-requires-combat-damage-to-player");
        if (attackExtraTurn) caps.add("extra-turn-requires-declared-attack");
        if (/can'?t attack during extra turns/.test(effectAndRaw)) caps.add("extra-turn-source-cannot-attack-extra-turns");
        if (/\bmay sacrifice\b|\bif you do\b|\bmay pay\b|\bif you pay\b/.test(effectAndRaw)) caps.add("extra-turn-source-requires-optional-payment");
        if (!/can'?t attack during extra turns/.test(effectAndRaw)
            && !/\bmay sacrifice\b|\bif you do\b|\bmay pay\b|\bif you pay\b/.test(effectAndRaw)
            && !extraCombatAttackOnceLimited) {
          caps.add("extra-turn-repeatable-with-fresh-token");
          if (combatDamageExtraTurn) caps.add("fresh-token-unused-combat-damage-trigger");
          if (attackExtraTurn) {
            caps.add("fresh-token-unused-attack-trigger");
            caps.add("attack-trigger-can-be-declared");
          }
        }
      }
      const combatSacrificeAuraText = effectAndRaw;
      const isAuraType = /\baura\b/.test(typeText);
      const auraConnects = /\b(?:enchanted|equipped|attached) creature deals? combat damage to (?:a |an |one or more )?(?:players?|opponents?)/.test(combatSacrificeAuraText);
      const auraSacrificesCarrier = /\bsacrifice (?:it|that creature|enchanted creature|equipped creature|attached creature)\b/.test(combatSacrificeAuraText);
      const auraReattaches = /\battach (?:this aura|this enchantment|it|[a-z][a-z' -]{1,60}) to (?:(?:another )?target |another |a )?creature you control\b/.test(combatSacrificeAuraText);
      const auraUntapsCreatures = /\buntap all creatures you control\b/.test(combatSacrificeAuraText);
      const auraAddsCombat = /\b(?:additional combat phase|extra combat phase)\b/.test(combatSacrificeAuraText);
      const auraOnceLimited = /only once (each|per) turn|triggers? only once/.test(combatSacrificeAuraText);
      const auraOptionalReset = /\bmay (?:sacrifice|attach|untap)\b/.test(combatSacrificeAuraText);
      if (isAuraType && auraConnects) caps.add("combat-sacrifice-aura-requires-connect");
      if (isAuraType && auraSacrificesCarrier) caps.add("combat-sacrifice-aura-sacrifices-carrier");
      if (isAuraType && auraReattaches) caps.add("combat-sacrifice-aura-reattaches");
      if (isAuraType && auraUntapsCreatures) caps.add("combat-sacrifice-aura-untaps-creatures");
      if (isAuraType && auraAddsCombat) caps.add("combat-sacrifice-aura-adds-combat");
      if (isAuraType
          && auraConnects
          && auraSacrificesCarrier
          && auraReattaches
          && auraUntapsCreatures
          && auraAddsCombat
          && !auraOnceLimited
          && !auraOptionalReset) {
        caps.add("is-combat-sacrifice-extra-combat-aura");
      }
      if (!/only once (each|per) turn|triggers? only once/.test(effectAndRaw)
          && /additional combat phase|extra combat phase/.test(effectAndRaw)) {
        const extraCombatCostMatch = s.kind === "triggered"
          ? effectAndRaw.match(/\bpay\s+((?:\{[^}]+\})+)/)
          : null;
        if (s.kind === "activated" || extraCombatCostMatch) {
          caps.add("is-repeatable-extra-combat-engine");
          caps.add(s.kind === "activated" ? "is-repeatable-extra-combat-activator" : "is-repeatable-extra-combat-attack-trigger");
          caps.add(s.kind === "activated" && /activate only as a sorcery/.test(effectAndRaw) ? "extra-combat-activation-window:sorcery" : "extra-combat-activation-window:any");
          if (/additional combat phase followed by an additional main phase|followed by an additional main phase|additional main phase after/i.test(effectAndRaw)) caps.add("extra-combat-adds-main-phase");
          addManaCostCaps(caps, "extra-combat", manaCostProfile(extraCombatCostMatch ? extraCombatCostMatch[1] : c));
          if (s.kind === "activated" && /\{t\}/.test(c)) caps.add("extra-combat-activation-taps-source");
          if (s.kind === "activated" && /\{q\}/.test(c)) caps.add("extra-combat-activation-uses-untap-symbol");
          if (/untap (?:all )?(?:attacking )?creatures?|untap all creatures you control/.test(effectAndRaw)) caps.add("extra-combat-untaps-creatures");
          if (/\buntap (?:all|each) creatures? you control\b|\buntap all creatures\b/.test(effectAndRaw)) caps.add("extra-combat-untaps-activating-creature");
        }
      }
      const attackExtraCombatCostMatch = effectAndRaw.match(/\bwhenever\b[^.]{0,100}\battacks?\b[^.]{0,160}\bpay\s+((?:\{[^}]+\})+)[^.]{0,220}\badditional combat phase\b/);
      if (attackExtraCombatCostMatch && !/only once (each|per) turn|triggers? only once/.test(effectAndRaw)) {
        caps.add("is-repeatable-extra-combat-engine");
        caps.add("is-repeatable-extra-combat-attack-trigger");
        caps.add("extra-combat-activation-window:attack-trigger");
        if (/additional combat phase followed by an additional main phase|followed by an additional main phase|additional main phase after/i.test(effectAndRaw)) caps.add("extra-combat-adds-main-phase");
        addManaCostCaps(caps, "extra-combat", manaCostProfile(attackExtraCombatCostMatch[1]));
        if (/untap (?:all )?(?:attacking )?creatures?|untap all creatures you control/.test(effectAndRaw)) caps.add("extra-combat-untaps-creatures");
      }
      const combatDamageResourceText = effectAndRaw;
      const hasCombatDamageResourceTrigger = /\bdeals? combat damage to (?:a |an |one or more )?(?:players?|opponents?|planeswalkers?)/.test(combatDamageResourceText);
      if (!/only once (each|per) turn|triggers? only once/.test(combatDamageResourceText)
          && hasCombatDamageResourceTrigger
          && /\buntap all lands you control\b/.test(combatDamageResourceText)) {
        caps.add("is-combat-damage-land-untap-engine");
        caps.add("combat-resource-requires-connect");
      }
      if (!/only once (each|per) turn|triggers? only once/.test(combatDamageResourceText)
          && hasCombatDamageResourceTrigger
          && /\bcreate\b[^.]{0,120}\btreasure tokens?\b/.test(combatDamageResourceText)) {
        caps.add("combat-resource-requires-connect");
        if (/\broll (?:a )?d\d+\b|\bd\d+\b[^.]{0,80}\btreasure tokens?\b|\btreasure tokens? equal to the result\b/.test(combatDamageResourceText)) {
          caps.add("is-random-combat-damage-treasure-source");
        } else if (/\bthat many treasure tokens?\b|\bnumber of treasure tokens? equal to (?:the amount of )?(?:combat )?damage\b|\btreasure tokens? equal to (?:that|the) damage\b|\bcreate x treasure tokens?\b/.test(combatDamageResourceText)) {
          caps.add("is-combat-damage-treasure-engine");
          caps.add("combat-damage-treasure-per-damage:1");
        } else {
          caps.add("is-fixed-combat-damage-treasure-source");
          caps.add("combat-damage-treasure-produced:" + Math.max(1, tokenCountFor(combatDamageResourceText, "treasure")));
        }
      }
      if (!/only once (each|per) turn|triggers? only once/.test(effectAndRaw)
          && /\b(?:whenever|when)\b[^.]{0,80}\battacks?\b/.test(effectAndRaw)
          && /\buntap all lands you control\b/.test(effectAndRaw)) {
        caps.add("is-attack-land-untap-engine");
        caps.add("combat-resource-requires-attack");
      }
      if (/\bwhen\b.*enters\b.*copy target instant or sorcery spell/.test(s.raw))
        caps.add("is-etb-spell-copier");
      if (/target creatures? you control.*create .*tokens?.*copy of (that|those|it|them|the targeted|target) creatures?/.test(e) && /haste/.test(e)) {
        caps.add("is-hasty-creature-copy-spell");
        caps.add("hasty-copy-spell-target-creature");
        if (/target nonlegendary creatures?/.test(e)) caps.add("hasty-copy-spell-target-requires-nonlegendary");
      }
      if (/create .*tokens?.*copy of target (nonlegendary )?(artifact or )?creature( you control)?/.test(e) && /haste/.test(e)) {
        caps.add("is-hasty-creature-copy-spell");
        caps.add("hasty-copy-spell-target-creature");
        if (/target nonlegendary creatures?/.test(e)) caps.add("hasty-copy-spell-target-requires-nonlegendary");
      }
      if (/\bdestroy target creature\b/.test(e)
          && /\bif that creature dies this way\b/.test(e)
          && /\bcreates? two tokens? that (?:are|is) copies of that creature\b/.test(e)) {
        caps.add("is-death-copy-creature-spell");
        caps.add("death-copy-spell-target-creature");
      }
      if (/\btarget player\b/.test(e)
          && /\bthat player may copy this spell\b/.test(e)
          && /\bmay choose (a )?new target\b/.test(e))
        caps.add("is-self-copying-targeted-spell");
      if (/\b(instant|sorcery)\b/.test(typeText)
          && /\bbuyback\s+\{/.test(effectAndRaw)
          && /\bcopy target instant or sorcery spell\b/.test(effectAndRaw)) {
        const buyback = effectAndRaw.match(/\bbuyback\s+((?:\{[^}]+\})+)/);
        const spellCost = manaCostProfile(classified._manaCost, Math.max(0, cmc == null ? 0 : cmc));
        const buybackCost = manaCostProfile(buyback ? buyback[1] : "");
        caps.add("is-buyback-spell-copy");
        addManaCostCaps(caps, "buyback-copy", addManaCostProfiles(spellCost, buybackCost));
      }
      if (/\b(each player|target player|you) discards? (their|his or her|your) hand,? (then|and) draws? (one|two|three|four|five|six|seven|eight|nine|ten|\d+) cards?\b/.test(effectAndRaw)
          && /\b(instant|sorcery)\b/.test(typeText)) {
        const wheelDraw = effectAndRaw.match(/\b(each player|target player|you) discards? (their|his or her|your) hand,? (then|and) draws? (one|two|three|four|five|six|seven|eight|nine|ten|\d+) cards?\b/);
        caps.add("is-wheel-draw-discard-spell");
        caps.add("wheel-draw-count:" + numberWordValue(wheelDraw && wheelDraw[4]));
        addManaCostCaps(caps, "wheel-spell", manaCostProfile(classified._manaCost, Math.max(0, cmc == null ? 0 : cmc)));
      }
      if (/when .* enters\b/.test(s.raw) && /if .*number of cards in your library.*you win the game/.test(e))
        caps.add("is-empty-library-win-payoff");
      if (/name a card[\s\S]{0,180}reveal cards? from the top of your library until/.test(allText)
          || /exile the top card of your library[\s\S]{0,180}repeat this process until/.test(allText)
          || /exile (your library|the rest of your library|all other cards revealed this way|all cards revealed this way)/.test(effectAndRaw)
          || /exile cards? from the top of your library until/.test(effectAndRaw))
        caps.add("is-library-exile-source");
      if (/whenever an opponent loses life/.test(s.trigger) && /you gain that much life/.test(e))
        caps.add("is-lifegain-from-opponent-lifeloss");
      if (/whenever you gain life/.test(s.trigger) && /(target opponent|each opponent|opponents?).{0,40}loses? (that much|\d+) life/.test(e))
        caps.add("is-lifeloss-from-your-lifegain");
      if (/whenever you gain life/.test(s.trigger)
          && !/only once each turn|triggers? only once/.test(effectAndRaw)
          && /put (a|\d+) \+1\/\+1 counters? on target (creature|creature or enchantment)(?: you control)?/.test(e)) {
        caps.add("is-lifegain-to-counter-payoff");
        caps.add(e.includes("target creature or enchantment") ? "lifegain-counter-target:creature-or-enchantment" : "lifegain-counter-target:creature");
      }
      const selfCounterTrigger = /\bwhenever one or more \+1\/\+1 counters are put on this creature\b/.test(s.trigger)
        || /\bwhenever one or more \+1\/\+1 counters are put on this creature\b/.test(effectAndRaw)
        || (selfNamePattern(classified._name)
          && new RegExp("\\bwhenever one or more \\+1\\/\\+1 counters are put on " + selfNamePattern(classified._name) + "\\b").test(s.trigger));
      if (selfCounterTrigger
          && /\bcreate\b[^.]{0,120}\bcreature tokens?\b/.test(e)) {
        caps.add("is-counter-to-creature-token-engine");
        const colors = creatureTokenColors(e);
        if (colors.length) {
          for (const color of colors) caps.add("counter-token-color:" + color);
        } else {
          caps.add("counter-token-color:unknown");
        }
      }
      {
        const etbCounter = effectAndRaw.match(/\bwhenever (?:another |a |one or more )?(white|blue|black|red|green)? ?creatures? you control enters?[^.]{0,160}\bput (?:a|one|\d+) \+1\/\+1 counters? on target creature(?: you control)?\b/);
        if (etbCounter) {
          caps.add("is-creature-etb-counter-granter");
          caps.add("etb-counter-granter-token-color:" + (TOKEN_COLOR_WORDS[etbCounter[1]] || "any"));
          caps.add("etb-counter-targets-creature");
        }
      }
      if (s.kind === "triggered" || s.kind === "etb") {
        const creatureEtbLifegain =
          /\bwhenever (?:another |one or more |one or more other )?creatures? (?:you control )?enters?(?: the battlefield)?(?: under your control)?\b/.test(s.trigger)
          || /\bwhenever (?:another |one or more |one or more other )?creatures? enters? the battlefield under your control\b/.test(s.trigger);
        if (creatureEtbLifegain
            && !/\bnontoken\b/.test(s.trigger)
            && !/only once each turn|triggers? only once/.test(effectAndRaw)
            && /\byou gain \d+ life\b/.test(e))
          caps.add("is-creature-etb-lifegain-payoff");
      }
      if (/\bwhenever a creature dies\b[^.]{0,120}\bif it had a -1\/-1 counter on it\b/.test(effectAndRaw)
          && /\bput a -1\/-1 counter on target creature\b/.test(effectAndRaw))
        caps.add("is-minus-counter-death-spreader");
      if (/\bwhenever (?:you put one or more -1\/-1 counters on|a -1\/-1 counter is put on) a creature\b/.test(s.trigger)
          && /\bcreate\b[^.]{0,80}\b1\/1\b[^.]{0,80}\bcreature tokens?\b/.test(e))
        caps.add("is-minus-counter-to-1-1-token-engine");
      if ((s.kind === "triggered" || /\bwhenever\b/.test(s.trigger))
          && /\bwhenever\b[^.]{0,100}\b(you|a player|an opponent) draws?\b/.test(s.trigger)
          && /\bdeals? (that much|\d+|x)? ?damage\b|\bdeals? damage equal\b/.test(e)) {
        caps.add("is-draw-to-damage-payoff");
        if (/\byou draws?\b/.test(s.trigger)) caps.add("draw-to-damage-subject:you");
        else if (/\ba player draws?\b/.test(s.trigger)) caps.add("draw-to-damage-subject:each");
        else if (/\ban opponent draws?\b/.test(s.trigger)) caps.add("draw-to-damage-subject:opp");
      }
      if ((s.kind === "triggered" || /\bwhenever\b/.test(s.trigger))
          && /\bdeals? (noncombat |combat )?damage to (a player|an opponent|one of your opponents|that player|any target)\b/.test(s.trigger)
          && /draw (a card|two cards|three cards|that many cards?)/.test(e)) {
        caps.add("is-damage-to-draw-payoff");
        if (/source you control deals? noncombat damage/.test(s.trigger)) caps.add("damage-to-draw-scope:source-you-control");
        else if (/enchanted creature deals?/.test(s.trigger)) caps.add("damage-to-draw-scope:enchanted-creature");
        else if (/equipped creature deals?/.test(s.trigger)) caps.add("damage-to-draw-scope:equipped-creature");
        else if (/this creature deals?/.test(s.trigger)) caps.add("damage-to-draw-scope:this-creature");
      }
      if (/each of those creatures has ["“]?whenever this creature deals? damage to an opponent, (you may )?draw a card/.test(allText)) {
        caps.add("is-damage-to-draw-payoff");
        caps.add("damage-to-draw-scope:paired-creature-grant");
      }
      if ((s.kind === "triggered" || /\bwhenever\b/.test(s.trigger))
          && /\bwhenever\b[^.]{0,100}\b(an opponent|a player) draws?\b/.test(s.trigger)
          && /(loses? \d+ life|deals? \d+ damage|loses? that much life|deals? that much damage)/.test(e)) {
        caps.add("is-opponent-draw-punisher");
        if (/loses? \d+ life|deals? \d+ damage/.test(e)) {
          const amount = e.match(/(?:loses?|deals?) (\d+)/);
          if (amount) caps.add("opponent-draw-punisher-damage:" + amount[1]);
        }
      }
      if (s.kind === "triggered"
          && /\bat the beginning of (?:each|every) (?:player'?s|opponent'?s) (?:draw step|upkeep|end step)\b/.test(s.trigger)
          && /\b(?:that player|each player|each opponent|active player) draws? (?:a card|an additional card|two cards)\b/.test(e)) {
        caps.add("is-repeatable-opponent-draw-source");
      }
      if (s.kind === "triggered"
          && /\bwhenever (?:an opponent|a player) (?:casts?|attacks?|deals? combat damage)\b/.test(s.trigger)
          && /\bthat player draws? a card\b/.test(e)) {
        caps.add("is-repeatable-opponent-draw-source");
      }
      if (/target player draws? cards? equal to half (the number of cards in )?(their|that player'?s?) library/.test(effectAndRaw)
          || /target opponent draws? cards? equal to half (the number of cards in )?(their|that opponent'?s?) library/.test(effectAndRaw)) {
        caps.add("is-mass-opponent-draw-source");
        caps.add("mass-opponent-draw-count:20");
      }
      if (/whenever you activate an ability/.test(s.trigger) && /copy that ability/.test(e)) {
        caps.add("is-activated-ability-copier");
        const pay = e.match(/pay \{([^}]+)\}/);
        caps.add("ability-copy-cost:" + (pay ? manaCostValue("{" + pay[1] + "}") : 0));
      }
      if (/\b(look at|play with) the top card of your library\b/.test(effectAndRaw)
          && (/\bcast\b.{0,100}\bartifact spells?\b.{0,120}\b(from|off) the top of your library\b/.test(effectAndRaw)
              || /\bplay artifact cards? from the top of your library\b/.test(effectAndRaw)))
        caps.add("is-artifact-cast-from-top-enabler");
      if (/\beach nonland card in your graveyard has escape\b/.test(effectAndRaw)) {
        const escapeFuel = effectAndRaw.match(/\b(?:exile|exiling) (one|two|three|four|five|six|seven|eight|nine|ten|\d+) other cards? from your graveyard\b/);
        caps.add("is-graveyard-escape-enabler");
        caps.add("graveyard-escape-extra-card-cost:" + numberWordValue(escapeFuel && escapeFuel[1]));
      }
      if (/\bcreature\b/.test(typeText)
          && /\byou may cast this card from your graveyard\b|\bcast this card from your graveyard\b/.test(effectAndRaw)) {
        caps.add("is-recursive-body");
        caps.add("is-recursive-cast-body");
        if (/\b(as long as|if) you control another creature\b/.test(effectAndRaw))
          caps.add("recursive-body-requires-another-creature");
        addManaCostCaps(caps, "recursive-body", manaCostProfile(classified._manaCost, Math.max(0, cmc == null ? 0 : cmc)));
      }
      const castFromExileText = /\b(?:you may )?cast (?:this card|[^.]{1,80}) from (?:your graveyard or )?exile\b/.test(effectAndRaw)
        || /\bcast this card from exile\b/.test(effectAndRaw);
      const conditionalExilePermission = /\b(if|as long as|for as long as|during|until|with|using)\b|exiled with|exiled it/.test(effectAndRaw);
      if (/\bcreature\b/.test(typeText) && castFromExileText && !conditionalExilePermission) {
        caps.add("is-recursive-exile-cast-body");
        addManaCostCaps(caps, "recursive-exile-body", manaCostProfile(classified._manaCost, Math.max(0, cmc == null ? 0 : cmc)));
      } else if (/\bcreature\b/.test(typeText) && castFromExileText) {
        caps.add("is-origin-bound-exile-cast-body");
      }
      if (s.kind === "activated"
          && /\bchoose target artifact card in your graveyard\b/.test(effectAndRaw)
          && /\byou may cast that card this turn\b/.test(effectAndRaw)) {
        caps.add("is-graveyard-artifact-cast-support");
        caps.add("graveyard-cast-support-target:artifact");
        caps.add("graveyard-cast-support-window:your-turn");
        addManaCostCaps(caps, "graveyard-cast-support", manaCostProfile(c));
        if (/\{t\}/.test(c)) caps.add("graveyard-cast-support-activation-taps-source");
      }
      if (s.kind === "triggered"
          && /\bdeals combat damage to a player\b/.test(triggerAndEffect)
          && /\bchoose target artifact card in your graveyard\b/.test(effectAndRaw)
          && /\byou may cast that card this turn\b/.test(effectAndRaw)) {
        caps.add("is-graveyard-artifact-cast-support");
        caps.add("graveyard-cast-support-target:artifact");
        caps.add("graveyard-cast-support-requires-combat-damage");
      }
      if (/\bduring each of your turns, you may\b[^.]{0,120}\bcast a permanent spell of each permanent type from your graveyard\b/.test(effectAndRaw)) {
        caps.add("is-graveyard-permanent-cast-support");
        caps.add("graveyard-cast-support-target:permanent");
        caps.add("graveyard-cast-support-window:your-turn");
      }
      if (s.kind === "activated"
          && /\bchoose target nonland permanent card in your graveyard\b/.test(effectAndRaw)
          && /\byou may cast that card\b/.test(effectAndRaw)) {
        caps.add("is-graveyard-permanent-cast-support");
        caps.add("graveyard-cast-support-target:permanent");
        caps.add("graveyard-cast-support-window:your-turn");
        if (/\bif you haven'?t cast a spell this turn\b/.test(effectAndRaw)) caps.add("graveyard-cast-support-precondition:no-spell-yet");
        if (/\byou can'?t cast additional spells this turn\b/.test(effectAndRaw)) caps.add("graveyard-cast-support-postcondition:no-more-spells");
        addManaCostCaps(caps, "graveyard-cast-support", manaCostProfile(c));
        if (/\{t\}/.test(c)) caps.add("graveyard-cast-support-activation-taps-source");
      }
      const forcedCastFromExile =
        /\bwhenever a player casts a spell from (?:their|his or her|your) hand\b/.test(effectAndRaw)
        && /\bexiles? it\b/.test(effectAndRaw)
        && /\bmay cast\b[^.]{0,180}\bfrom among\b[^.]{0,180}\bexiled\b/.test(effectAndRaw)
        && /\bwithout paying its mana cost\b/.test(effectAndRaw);
      const forcedDrawStepCast =
        /\bat the beginning of each player'?s draw step\b/.test(effectAndRaw)
        && /\bexiles? the top card of (?:their|that player'?s|his or her|your) library\b/.test(effectAndRaw)
        && /\bcasts? it without paying its mana cost if able\b/.test(effectAndRaw);
      if (forcedCastFromExile || forcedDrawStepCast) {
        caps.add("is-forced-nonhand-cast-engine");
        caps.add("forced-cast-payment:free");
        caps.add("forced-cast-window:trigger-resolution");
        caps.add("forced-cast-origin:exile");
        if (forcedCastFromExile) caps.add("forced-cast-trigger:spell-from-hand");
        if (forcedDrawStepCast) {
          caps.add("forced-cast-trigger:draw-step");
          caps.add("forced-cast-origin:library-top");
        }
      }
      if (/\{t\}/.test(allText)
          && /\bwhen you (?:cast your next|next cast a) spell this turn\b/.test(allText)
          && /\bmay cast\b/.test(allText)
          && /\bwithout paying its mana cost\b/.test(allText)
          && /\b(exile|top|library)\b/.test(allText)) {
        caps.add("is-tap-free-cast-engine");
        caps.add("tap-free-cast-payment:free");
        if (/\blibrary\b|\btop\b/.test(allText)) caps.add("tap-free-cast-origin:library");
        if (/\bexile\b/.test(allText)) caps.add("tap-free-cast-origin:exile");
        if (/\{[1-9xwubrgc]/.test(allText)) caps.add("tap-free-cast-requires:mana");
      }
      if (/\bat the beginning of each player'?s draw step\b/.test(allText)
          && /\bputs? the cards? in (?:their|his or her|that player'?s) hand on the (?:bottom of|bottom into) (?:their|his or her|that player'?s) library\b/.test(allText)
          && /\bdraws? that many cards\b/.test(allText)) {
        caps.add("is-draw-step-hand-cycler");
      }
      if (/\beach opponent can'?t draw more than one card each turn\b/.test(allText)
          || /\bopponents? can'?t draw more than one card each turn\b/.test(allText)) {
        caps.add("is-draw-limit-lockpiece");
        caps.add("draw-limit-scope:opponents");
        caps.add("draw-limit-count:1");
      }
      if (/\beach player can'?t draw more than one card each turn\b/.test(allText)
          || /\bplayers can'?t draw more than one card each turn\b/.test(allText)) {
        caps.add("is-draw-limit-lockpiece");
        caps.add("draw-limit-scope:players");
        caps.add("draw-limit-count:1");
      }
      if (/\bif an opponent would draw a card except the first one they draw in each of their draw steps\b/.test(allText)
          && /\binstead\b/.test(allText)
          && /\bskips? that draw\b/.test(allText)) {
        caps.add("is-draw-limit-lockpiece");
        caps.add("draw-limit-scope:opponents");
        caps.add("draw-limit-count:1");
        caps.add("draw-limit-replacement:skip");
      }
      if (/\bplayers can'?t draw cards\b/.test(allText)
          && /\bat the beginning of each player'?s draw step\b/.test(allText)
          && /\bsearches? (?:their|his or her|that player'?s) library for a card\b/.test(allText)
          && /\bputs? it into (?:their|his or her|that player'?s) hand\b/.test(allText)) {
        caps.add("is-no-draw-search-step-engine");
      }
      if (/\b(players?|opponents?) can'?t search libraries\b/.test(allText)) {
        caps.add("is-search-lockpiece");
        caps.add(/\bopponents?\b/.test(allText) ? "search-lock-scope:opponents" : "search-lock-scope:players");
      }
      if (/\byou control your opponents while they'?re searching their libraries\b/.test(allText)
          && /\bthey exile each card they find\b/.test(allText)) {
        caps.add("is-search-lockpiece");
        caps.add("search-lock-scope:opponents");
        caps.add("search-lock-mode:controlled-search-exile");
      }
      if (/\bcreatures without flying can'?t attack you\b/.test(allText)) {
        caps.add("is-attack-lockpiece");
        caps.add("attack-lock-axis:no-flying");
        caps.add("attack-lock-scope:you");
      }
      if (/\bcreatures without flying can'?t attack\b/.test(allText)) {
        caps.add("is-attack-lockpiece");
        caps.add("attack-lock-axis:no-flying");
        caps.add("attack-lock-scope:players");
      }
      if (/\bcreatures with flying can'?t attack you\b/.test(allText)) {
        caps.add("is-attack-lockpiece");
        caps.add("attack-lock-axis:flying-only");
        caps.add("attack-lock-scope:you");
      }
      if (/\bexcept by creatures with flying and\/or islandwalk\b/.test(allText)) {
        caps.add("is-attack-lockpiece");
        caps.add("attack-lock-axis:flying-or-islandwalk-only");
        caps.add("attack-lock-scope:you");
      }
      if (/\bcreatures without flying or islandwalk can'?t attack\b/.test(allText)) {
        caps.add("is-attack-lockpiece");
        caps.add("attack-lock-axis:flying-or-islandwalk-only");
        caps.add("attack-lock-scope:players");
      }
      if (/\bcreatures your opponents control lose flying\b/.test(allText)
          && /\bcan'?t have or gain flying\b/.test(allText)) {
        caps.add("is-evasion-removal-lock-support");
        caps.add("evasion-removal:flying");
        caps.add("evasion-removal-scope:opponents");
      }
      if (/\ball creatures lose flying and islandwalk\b/.test(allText)) {
        caps.add("is-evasion-removal-lock-support");
        caps.add("evasion-removal:flying");
        caps.add("evasion-removal:islandwalk");
        caps.add("evasion-removal-scope:players");
      } else if (/\ball creatures lose flying\b/.test(allText)) {
        caps.add("is-evasion-removal-lock-support");
        caps.add("evasion-removal:flying");
        caps.add("evasion-removal-scope:players");
      }
      if (/\b(opponents?|players?) can'?t cast spells? from anywhere other than their hands\b/.test(effectAndRaw)) {
        caps.add("is-cast-origin-lockpiece");
        caps.add("cast-lock-origin:non-hand");
        caps.add(/\bopponents?\b/.test(effectAndRaw) ? "cast-lock-scope:opponents" : "cast-lock-scope:players");
      }
      if (/\b(players?|opponents?) can'?t cast(?: noncreature)? spells? from (?:graveyards? or )?exile\b/.test(effectAndRaw)) {
        caps.add("is-cast-origin-lockpiece");
        caps.add("cast-lock-origin:exile");
        caps.add(/\bnoncreature spells?\b/.test(effectAndRaw) ? "cast-lock-origin-exile-noncreature-only" : "cast-lock-origin-exile-any");
        caps.add(/\bopponents?\b/.test(effectAndRaw) ? "cast-lock-scope:opponents" : "cast-lock-scope:players");
      }
      if (/\beach player can'?t cast more than one spell each turn\b/.test(effectAndRaw)
          || /\bplayers can'?t cast more than one spell each turn\b/.test(effectAndRaw)) {
        caps.add("is-cast-origin-lockpiece");
        caps.add("cast-lock-axis:spell-count");
        caps.add("cast-lock-spell-count:1");
        caps.add("cast-lock-scope:players");
      }
      if (/\beach opponent can cast spells only any time they could cast a sorcery\b/.test(effectAndRaw)
          || /\byour opponents can cast spells only any time they could cast a sorcery\b/.test(effectAndRaw)) {
        caps.add("is-cast-origin-lockpiece");
        caps.add("cast-lock-axis:timing-sorcery");
        caps.add("cast-lock-scope:opponents");
      }
      if (/\bwhenever a player casts a spell, if no mana was spent to cast it, counter that spell\b/.test(effectAndRaw)) {
        caps.add("is-cast-origin-lockpiece");
        caps.add("cast-lock-axis:free-cast");
        caps.add("cast-lock-scope:players");
      }
      if (/\bwhenever an opponent casts a spell, if no mana was spent to cast it, counter that spell\b/.test(effectAndRaw)) {
        caps.add("is-cast-origin-lockpiece");
        caps.add("cast-lock-axis:free-cast");
        caps.add("cast-lock-scope:opponents");
      }
      if (/\bwhenever a player casts a spell, if no colored mana was spent to cast it, counter that spell\b/.test(effectAndRaw)) {
        caps.add("is-cast-origin-lockpiece");
        caps.add("cast-lock-axis:no-colored-mana");
        caps.add("cast-lock-scope:players");
      }
      if (/\bplayers can'?t get counters\b/.test(effectAndRaw)
          || /\bcounters can'?t be put on (artifacts|creatures|enchantments|lands)/.test(effectAndRaw)) {
        caps.add("is-counter-suppression-static");
        if (/\bplayers can'?t get counters\b/.test(effectAndRaw)) caps.add("counter-suppression:players");
        if (/\bartifacts\b/.test(effectAndRaw)) caps.add("counter-suppression:artifacts");
        if (/\bcreatures\b/.test(effectAndRaw)) caps.add("counter-suppression:creatures");
        if (/\benchantments\b/.test(effectAndRaw)) caps.add("counter-suppression:enchantments");
        if (/\blands\b/.test(effectAndRaw)) caps.add("counter-suppression:lands");
      }
      if ((/\bprevent that damage and put\b[^.]{0,100}\bcounters? on (this|that|[a-z][a-z' -]{1,60})\b/.test(effectAndRaw)
          || /\bif damage would be dealt to you, put that many [a-z]+ counters? on (this|that|[a-z][a-z' -]{1,60}) instead\b/.test(effectAndRaw)
          || /\bif a source would deal damage to you, put that many [a-z]+ counters? on (this|that|[a-z][a-z' -]{1,60}) instead\b/.test(effectAndRaw))) {
        caps.add("is-damage-prevention-counter-burden");
        if (/\bprevent all damage that would be dealt to you\b/.test(effectAndRaw)) caps.add("damage-prevention-scope:self-all");
        if (/\bif a source would deal damage to you, prevent that damage\b/.test(effectAndRaw)
            || /\bif damage would be dealt to you, prevent that damage\b/.test(effectAndRaw)
            || /\bif damage would be dealt to you, put that many [a-z]+ counters? on (this|that|[a-z][a-z' -]{1,60}) instead\b/.test(effectAndRaw)
            || /\bif a source would deal damage to you, put that many [a-z]+ counters? on (this|that|[a-z][a-z' -]{1,60}) instead\b/.test(effectAndRaw)) caps.add("damage-prevention-scope:self-any-damage");
        if (/\bincarnation counters?\b/.test(effectAndRaw)) caps.add("counter-burden-type:incarnation");
        if (/\bdelay counters?\b/.test(effectAndRaw)) caps.add("counter-burden-type:delay");
        if (/\bwhen there are [^.]{0,80} counters? on (?:this|that|[a-z][a-z' -]{1,60})\b/.test(effectAndRaw)
            || /\bwhen there are [^.]{0,80} [a-z]+ counters? on (?:this|that|[a-z][a-z' -]{1,60})\b/.test(effectAndRaw))
          caps.add("counter-burden-threshold-failure");
        if (/\bat the beginning of your upkeep\b/.test(effectAndRaw)
            && /\bfor each [a-z]+ counter removed this way, you lose 1 life unless you pay\b/.test(effectAndRaw))
          caps.add("counter-burden-upkeep-loss");
      }
      if (/\bwhenever an opponent casts a spell, counter that spell and put\b[^.]{0,100}\bcounters? on (this|that|[a-z][a-z' -]{1,60})\b/.test(effectAndRaw)
          && /\bif there are [^.]{0,80} counters? on (this|that|[a-z][a-z' -]{1,60}), sacrifice\b/.test(effectAndRaw)) {
        caps.add("is-spell-counter-depletion-lockpiece");
        if (/\bdepletion counters?\b/.test(effectAndRaw)) caps.add("counter-burden-type:depletion");
      }
      if (/\byou don'?t lose the game for having 0 or less life\b/.test(effectAndRaw)
          && /\ball damage is dealt to you as though its source had infect\b/.test(effectAndRaw)) {
        caps.add("is-zero-life-poison-shield");
      }
      if (/\bcumulative upkeep\b/.test(allText)
          && /\bput an age counter on this permanent\b/.test(allText)) {
        caps.add("is-cumulative-upkeep-counter-burden");
        caps.add("counter-burden-type:age");
        if (/\bprevent all damage that would be dealt to you\b/.test(allText)) {
          caps.add("is-full-self-damage-prevention-source");
          caps.add("damage-prevention-scope:self-all");
        }
      }
      if (/\bland\b/.test(typeText)
          && /\bcumulative upkeep\b/.test(allText)
          && /\bwhen this (?:land|permanent) enters, sacrifice a land\b/.test(allText)
          && /\bprevent all damage that would be dealt to you\b/.test(allText)) {
        caps.add("is-replayable-prevention-land-lockpiece");
      }
      if (/\bplayers skip their untap steps\b/.test(allText)) {
        caps.add("is-global-untap-skipper");
      }
      if (/\ball permanents are artifacts in addition to their other types\b/.test(allText)) {
        caps.add("is-all-permanents-artifacts");
      }
      if (/\bactivated abilities of [^.]{0,120}\bartifacts?\b[^.]{0,120}can'?t be activated\b/.test(allText)) {
        caps.add("is-artifact-activation-lockpiece");
        caps.add(/\byour opponents control\b/.test(allText)
          ? "artifact-activation-lock-scope:opponents"
          : "artifact-activation-lock-scope:players");
      }
      if (/\ball lands are islands in addition to their other types\b/.test(allText)) {
        caps.add("is-all-lands-are-islands");
      }
      if (/\bnonbasic lands are islands\b/.test(allText)) {
        caps.add("is-nonbasic-lands-are-islands");
      }
      if (/\bislands don'?t untap during their controllers'? untap steps\b/.test(allText)) {
        caps.add("is-island-untap-lockpiece");
      }
      if (/\bwhen this enchantment enters, tap all islands\b/.test(allText)) {
        caps.add("island-untap-lockpiece-taps-islands-on-entry");
      }
      const morphText = [allText, effectAndRaw, c].filter(Boolean).join(' ');
      const morphMatch = morphText.match(/\bmorph ((?:\{[^}]+\})+)/);
      if (/\bwhen (?:this creature|this permanent|it) is turned face up, each opponent skips? their next untap step\b/.test(allText)) {
        caps.add("is-face-up-opponent-next-untap-skipper");
        if (morphMatch) addManaCostCaps(caps, "face-up", manaCostProfile(morphMatch[1]));
      }
      if (/\bat the beginning of your upkeep, you may turn (?:this creature|this permanent|it) face down\b/.test(allText)) {
        caps.add("is-upkeep-face-down-resetter");
        if (morphMatch) addManaCostCaps(caps, "face-up", manaCostProfile(morphMatch[1]));
      }
      if (/\bas (?:this creature|this permanent|it) enters or is turned face up, you may choose another creature on the battlefield\b/.test(allText)
          && /\buntil (?:this creature|this permanent|it) is turned face down, (?:it|this creature|this permanent) becomes a copy of that creature\b/.test(allText)) {
        caps.add("is-face-up-copy-creature");
        caps.add("face-up-copy-target:another-creature");
        if (morphMatch) addManaCostCaps(caps, "face-up", manaCostProfile(morphMatch[1]));
      }
      if (/\bplayers skip their upkeep steps\b/.test(allText)) {
        caps.add("is-global-upkeep-skipper");
      }
      if (/\bat the beginning of your end step, untap all nonland permanents you control\b/.test(allText)) {
        caps.add("is-self-end-step-nonland-untapper");
      }
      if (/\bthis land doesn'?t untap during your untap step\b/.test(allText)
          && /\bat the beginning of your upkeep, you may exile a card from your hand\.\s*if you do, untap this land\b/.test(allText)
          && /\{t\}: add one mana of any color\b/.test(allText)) {
        caps.add("is-upkeep-self-untap-mana-land");
        caps.add("upkeep-self-untap-mana-land-produces:any");
        caps.add("upkeep-self-untap-mana-land-requires-hand-card");
      }
      if (/\bwhen\b[^.]{0,80}\benters\b[^.]{0,160}\bif you cast\b[^.]{0,120}\byou gain protection from everything until your next turn\b/.test(allText)) {
        caps.add("is-cast-gated-opponent-turn-protection-source");
        if (/\bartifact\b/.test(typeText)) caps.add("protection-source-type:artifact");
      }
      if (s.kind === "activated"
          && /\breturn target artifact you control to its owner'?s hand\b/.test(effectAndRaw)) {
        caps.add("is-repeatable-self-bounce-support");
        caps.add("self-bounce-target:artifact-you-control");
        addManaCostCaps(caps, "self-bounce", manaCostProfile(c));
        if (/\{t\}/.test(c)) caps.add("self-bounce-activation-taps-source");
      }
      if (s.kind === "activated"
          && /\breturn target permanent you control to its owner'?s hand\b/.test(effectAndRaw)) {
        caps.add("is-repeatable-self-bounce-support");
        caps.add("self-bounce-target:permanent-you-control");
        addManaCostCaps(caps, "self-bounce", manaCostProfile(c));
        if (/\{t\}/.test(c)) caps.add("self-bounce-activation-taps-source");
        if (/activate only during your turn/.test(effectAndRaw)) caps.add("self-bounce-window:your-turn");
      }
      if (s.kind === "activated"
          && /\breturn target permanent(?: that isn'?t enchanted)? to its owner'?s hand\b/.test(effectAndRaw)) {
        caps.add("is-repeatable-self-bounce-support");
        caps.add(/\breturn target permanent that isn'?t enchanted to its owner'?s hand\b/.test(effectAndRaw)
          ? "self-bounce-target:any-permanent-not-enchanted"
          : "self-bounce-target:any-permanent");
        addManaCostCaps(caps, "self-bounce", manaCostProfile(c));
        if (/\{t\}/.test(c)) caps.add("self-bounce-activation-taps-source");
        const extraTapMatch = c.match(/\btap (\d+) untapped (creatures|birds)\b/);
        if (extraTapMatch) caps.add("self-bounce-additional-tap-" + extraTapMatch[2] + ":" + extraTapMatch[1]);
        if (/\bdiscard a card\b/.test(c)) caps.add("self-bounce-additional-cost:discard");
        const snowMatch = effectAndRaw.match(/activate only if you control (\d+) or more snow permanents/);
        if (snowMatch) caps.add("self-bounce-requires-snow-permanents:" + snowMatch[1]);
      }
      if (s.kind === "activated"
          && /\breturn target permanent you control to its owner'?s hand\b/.test(effectAndRaw)
          && /\bdiscard a card\b/.test(c)) {
        caps.add("self-bounce-additional-cost:discard");
      }
      if (/\bprevent all damage that would be dealt to you\b/.test(effectAndRaw)
          && !caps.has("is-damage-prevention-counter-burden")) {
        caps.add("is-full-self-damage-prevention-source");
        caps.add("damage-prevention-scope:self-all");
      }
      if (/\bcreature\b/.test(typeText)
          && s.kind === "activated"
          && /\breturn (this card|this creature|[^.,:]{1,60}) from your graveyard to (the )?battlefield\b/.test(effectAndRaw)
          && !/\breturn target\b/.test(effectAndRaw)) {
        caps.add("is-recursive-body");
        caps.add("is-recursive-return-body");
        addManaCostCaps(caps, "recursive-body", manaCostProfile(c));
      }
      if (s.kind === "activated"
          && (hasCheapInstantImprint || /exiled card|the exiled card|copy the exiled card/.test(effectAndRaw))
          && /\bcast\b/.test(effectAndRaw)
          && (hasCheapInstantImprint || /\binstant\b/.test(effectAndRaw) || /mana value 2 or less/.test(effectAndRaw))) {
        caps.add("is-repeatable-cheap-instant-caster");
      }
      if (/\bexile (a|another|target)? ?creature you control\s*:?\s*add x mana of any one color\b/.test(effectAndRaw)
          && /\bwhere x is 1 plus (the )?exiled creature'?s mana value\b/.test(effectAndRaw)
          && /\bspend this mana only to cast creature spells\b/.test(effectAndRaw)) {
        caps.add("is-creature-exile-cast-mana-outlet");
        caps.add("creature-exile-cast-mana-surplus:1");
      }
      const freshCarrierText = effectAndRaw;
      const freshCarrierAtBeginningOfCombat = /\bat the beginning of combat on your turn\b/.test(freshCarrierText);
      const freshCarrierCreatesCreature = /\bcreate\b[^.]{0,160}\bcreature tokens?\b/.test(freshCarrierText);
      const freshCarrierTokenHasHaste =
        /\bcreate\b[^.]{0,180}\bcreature tokens?\b[^.]{0,80}\bwith haste\b/.test(freshCarrierText)
        || /\bcreate\b[\s\S]{0,220}\bcreature tokens?\b[\s\S]{0,180}\b(?:that token|those tokens|they|it|tokens?) gains? haste\b/.test(freshCarrierText);
      const freshCarrierTappedAttacking = /\btapped and attacking\b/.test(freshCarrierText);
      const freshCarrierConditionText = freshCarrierText
        .replace(/\b(?:it|that token|those tokens|they|tokens?) attacks? this combat if able\b/g, " ")
        .replace(/\battacks? this combat if able\b/g, " ");
      const freshCarrierConditional = /\bif\b|\bunless\b|\bas long as\b|\bfor as long as\b|\bonly if\b|\bfirst combat phase\b/.test(freshCarrierConditionText);
      const freshCarrierRandom = /\broll (?:a )?d\d+\b|\bd\d+\b|\bflip a coin\b|\bat random\b|\brandom\b|\bwhere x is\b|\bcreate x\b|\bfor each\b/.test(freshCarrierText);
      if (freshCarrierAtBeginningOfCombat
          && freshCarrierCreatesCreature
          && freshCarrierTokenHasHaste
          && !freshCarrierTappedAttacking
          && !freshCarrierConditional
          && !freshCarrierRandom
          && !/only once (each|per) turn|triggers? only once/.test(freshCarrierText)) {
        const freshCarrierTokens = Math.max(1, tokenCountFor(freshCarrierText, "creature"));
        caps.add("is-fresh-attack-carrier-source");
        caps.add("fresh-carrier-token-attacks");
        caps.add("fresh-carrier-token-has-haste");
        caps.add("fresh-carrier-continuity");
        caps.add("fresh-carrier-repeatable-each-combat");
        caps.add("fresh-carrier-legal-next-reattach-target");
        caps.add("fresh-carrier-timing:beginning-of-combat");
        caps.add("fresh-carrier-tokens-created:" + freshCarrierTokens);
      }

      // --- Wave 2: directional payoff engines the audit found missing ---
      // aristocrats DEATH triggers. Keep the generic trigger cap plus effect
      // subtypes so per-card audits can distinguish death→drain from death→draw
      // and other death-triggered engines.
      if ((s.kind === "triggered" || s.kind === "etb") &&
          /\bdies\b|is put into (a|your) graveyard/.test(s.trigger)) {
        caps.add("has-death-trigger");
        if (/(each opponent|target opponent|each player|that player).{0,30}loses?.{0,10}life|loses? \d+ life|drains?/.test(e))
          caps.add("is-death-drain-payoff");
        if (/draw (a card|two cards|three cards|that many cards?)/.test(e))
          caps.add("is-death-draw-payoff");
        if (/create .*token|create .*treasure/.test(e))
          caps.add("is-death-token-payoff");
        if (/create .*treasure/.test(e)) {
          const treasureCount = Math.max(1, tokenCountFor(e, "treasure"));
          caps.add("is-death-mana-payoff");
          caps.add("death-mana-produced:" + treasureCount);
          caps.add("death-mana-any:" + treasureCount);
        }
      }
      // Sacrifice payoffs are related to death engines but not identical: an
      // artifact/treasure sacrifice trigger must not be fed by every creature
      // death/sac outlet. Keep a separate typed signal for audits and future
      // precise families instead of reusing death→draw/drain.
      if ((s.kind === "triggered" || s.kind === "etb") && /whenever .*sacrific/.test(s.trigger)) {
        caps.add("has-sacrifice-trigger");
        if (/creature/.test(s.trigger)) caps.add("is-creature-sacrifice-payoff");
        if (/artifact|treasure|clue|food|blood/.test(s.trigger)) caps.add("is-artifact-sacrifice-payoff");
        if (/draw (a card|two cards|three cards|that many cards?)/.test(e)) caps.add("is-sacrifice-draw-payoff");
        if (/create .*token|create .*treasure/.test(e)) caps.add("is-sacrifice-token-payoff");
      }
      // go-wide payoff (audit #1 FP fix): must scale with board WIDTH, not be a
      // single-attacker / Voltron / defensive trigger. Overrun = team pump+evasion;
      // width-payoff = effect that references "each creature" / per-creature count.
      if ((/creatures you control get \+\d+\/\+\d+/.test(e) && /(attack|combat|until end of turn)/.test(e + s.trigger))
           || (/\btrample\b/.test(e) && /creatures you control/.test(e)))
        caps.add("is-overrun");
      // width payoff: rewards having/attacking with MANY creatures (count-scaling)
      if (/for each (creature|attacking creature|other creature) you control/.test(e)
          || /(equal to|number of) (the number of )?(creatures|attacking creatures) you control/.test(e)
          || /whenever (a creature|one or more creatures) you control attacks?/.test(s.trigger)
          || /whenever you attack with (three|four|\d+|two or more)/.test(s.trigger))
        caps.add("is-width-payoff");
      // Generic token production stays visible for artifact/treasure/food/clue
      // payoffs, but creature-token production is a separate body/go-wide
      // signal so noncreature tokens do not imply attackers or deaths.
      if (/create (a|an|one|two|three|four|five|six|x|\d{1,2}|that many) .*tokens?/.test(e)
          || /create .*tokens?/.test(e)
          || /populate|amass|\bfabricate \d+|\bgo wide\b/.test(e)) {
        caps.add("is-token-producer");
        if (/\d+\/\d+ .*creature tokens?|creature tokens?|creature token with|populate|amass|\bfabricate \d+/.test(e))
          caps.add("is-creature-token-producer");
        const artifactTokenCount = artifactTokenCountFor(e);
        if (artifactTokenCount > 0) {
          caps.add("is-artifact-token-producer");
          caps.add("artifact-tokens-produced:" + artifactTokenCount);
          if (/\bbeginning of (?:your|each) upkeep\b/.test(s.trigger)
              && !/triggers? only once (each|per) turn|only once (each|per) turn/.test(effectAndRaw)) {
            caps.add("is-turn-cycle-artifact-token-engine");
            caps.add("artifact-tokens-per-turn:" + artifactTokenCount);
            caps.add("artifact-token-turn-trigger:upkeep");
          }
        }
      }
      if (/\bconvoke\b/.test(e) || /\bconvoke\b/.test(s.trigger))
        caps.add("is-convoke-spell");
      if (/whenever you cast .*convoke/.test(s.trigger) || /whenever you cast .*convoke/.test(e))
        caps.add("is-convoke-cast-payoff");
      if (/if one or more tokens? would be created under your control|if .* would create .* tokens?.* instead|tokens? plus .* token .* created instead|twice that many tokens|double .* tokens/.test(e))
        caps.add("is-token-doubler");
      if (/if .*tokens? would be created under your control.*tokens?.*created instead/.test(e)
          || /if .*would create .*tokens?.*instead create .*tokens?/.test(e)
          || /tokens? plus .*tokens?.*created instead/.test(e))
        caps.add("is-token-replacement-modifier");
      if (/tokens? plus that many .*creature tokens? .* created instead|tokens? plus .*creature tokens? .* created instead|create that many .*creature tokens? in addition/.test(e))
        caps.add("is-token-to-creature-token-replacer");

      // --- Round-4: the COMBAT axis (biggest missing payoff class, ~30 decks) ---
      // combat-trigger PAYOFF: "whenever ~ attacks / deals combat damage to a
      // player → draw / drain / token / counter / steal". The actual finisher of
      // every aggro/go-wide/Voltron deck.
      if (s.kind === "triggered"
          && /(attacks|attack|deals combat damage to a (player|creature))/.test(s.trigger)
          && /(draw|create|loses? .*life|put .* counter|gain control|each opponent|deals? \d|that much)/.test(e))
        caps.add("is-combat-payoff");
      // combat ENABLER: grants evasion / double strike / extra combat to your team
      // (the thing that makes the combat payoff fire harder).
      if (/(creatures? you control|target creature|equipped creature|enchanted creature) .*(gains?|have|has) .*(double strike|trample|flying|menace|can't be blocked|unblockable)/.test(e)
          || /(additional combat phase|extra combat|untap all creatures you control)/.test(e))
        caps.add("is-combat-enabler");

      // --- political / forced-combat axis (goad decks scored as good-stuff
      // piles: every edge weak, no engine detected — yet "force attacks → punish
      // attackers" is a real, directed build-around). Two halves:
      // GOAD SOURCE: forces opponents' creatures to attack (the setup).
      if (/goad/.test(e)
          || /creatures? your opponents control attack each combat if able/.test(e))
        caps.add("is-goad-source");
      // ATTACK PUNISHER: a triggered payoff that fires when a creature attacks
      // YOU / a player, when a GOADED creature attacks, or when an attacking
      // creature dies, and punishes (life loss / damage / sacrifice / destroy).
      // This is what turns forced combat into the deck's actual engine.
      if (s.kind === "triggered"
          && (/goaded creature attacks/.test(s.trigger)
              || /attacking creature dies/.test(s.trigger)
              || /(a|an|one or more|each) creatures?.{0,40}attacks? (you|a player)/.test(s.trigger))
          && /(loses? \d* ?life|deals? \d+ damage|sacrifices?|destroy|controller loses)/.test(e))
        caps.add("is-attack-punisher");

      // land recursion feeds landfall engines more specifically than the
      // generic graveyard family.
      if (/play lands? from your graveyard|land cards? from your graveyard|return .* land cards? .* graveyard .* battlefield/.test(effectAndRaw))
        caps.add("is-land-recursion");
      if (/\byou may play an additional land on each of your turns\b/.test(effectAndRaw)) {
        caps.add("is-extra-land-drop");
        caps.add("extra-land-drops:1");
      }
      const extraLandMatch = effectAndRaw.match(/\byou may play (one|two|three|four|five|\d+) additional lands on each of your turns\b/);
      if (extraLandMatch) {
        caps.add("is-extra-land-drop");
        caps.add("extra-land-drops:" + numberWordValue(extraLandMatch[1]));
      }
      if (/\blandfall\b|whenever a land (you control )?enters/.test(triggerAndEffect)) {
        caps.add("is-landfall-payoff");
        if (/\badd\b/.test(e)) {
          caps.add("is-landfall-mana-payoff");
          addProducedManaCaps(caps, "landfall", producedManaProfile(e));
        }
        if (/\bcreate\b[^.]{0,120}\btokens?\b/.test(e)) {
          caps.add("is-landfall-token-payoff");
          if (/\bcreature tokens?\b/.test(e)) caps.add("is-landfall-creature-token-payoff");
          if (/\btreasure tokens?\b/.test(e)) {
            const treasureCount = Math.max(1, tokenCountFor(e, "treasure"));
            caps.add("is-landfall-treasure-payoff");
            addProducedManaCaps(caps, "landfall-token", { total: treasureCount, any: treasureCount, colorless: 0, colors: Object.fromEntries(MANA_COLORS.map(color => [color, 0])) });
          }
        }
      }
      if ((s.kind === "triggered" || s.kind === "etb")
          && /\bwhenever another permanent you control enters\b/.test(s.trigger)
          && /\bput a permanent card with equal or lesser mana value from your hand onto the battlefield\b/.test(e)) {
        caps.add("is-permanent-etb-hand-dropper");
      }

      // ETB / trigger doublers: multiplicative hubs that should be explicit
      // rather than hidden as generic copy/ETB text.
      if (/entering the battlefield causes .* triggered ability .* triggers? an additional time|triggers? an additional time/.test(effectAndRaw))
        caps.add(/enters?|entering the battlefield/.test(effectAndRaw) ? "is-etb-doubler" : "is-trigger-doubler");

      // Vehicles need their own axis instead of relying on generic
      // artifact/tap/lord edges.
      if (/vehicle/.test(classified._type || "")) caps.add("is-vehicle");
      if (/vehicle/.test(effectAndTrigger) && /(get \+|put .* into your hand|return .* battlefield|crew|becomes tapped|draw|create)/.test(effectAndTrigger))
        caps.add("is-vehicle-payoff");

      // Cast-opponents'-cards decks need a separate axis from control-change
      // theft: these cards often exile or play cards an opponent owns without
      // ever gaining control of a permanent.
      if (/opponent (owns|owned)|opponents? own|cards? exiled .* opponents?|mana .* any color .* cast spells you don.?t own/.test(effectAndRaw))
        caps.add("is-theft-cast-source");

      // proliferate CONSUMER: a card that puts/uses counters benefits from
      // proliferate (the audit: proliferate had producers but no consumer).
      if (/\+1\/\+1 counter|loyalty counter|charge counter|\bpoison\b|\bfabricate \d+/.test(e + " " + c) && !/proliferate/.test(e))
        caps.add("has-counters");
      if (/\bproliferate\b/.test(e)) caps.add("is-proliferator");
      // counter MULTIPLIER (doublers): much stronger than a single counter source
      if (/(twice that many|double the number of|for each .* counter .* put that many|additional \+1\/\+1 counter|if .* would (have|get) .* counters? .* instead)/.test(e))
        caps.add("is-counter-multiplier");
      // tribe-specific deployment/recruitment payoff: a card that explicitly
      // turns a referenced creature type into cards or battlefield presence
      // should link to matching bodies even when it is not a lord/anthem.
      if (/put a[n]? [a-z]+ creature card .* onto the battlefield|put a[n]? [a-z]+ creature card .* into your hand|reveal .* put .* [a-z]+ creature card .* (onto the battlefield|into your hand)/.test(effectAndRaw))
        caps.add("is-tribal-payoff");

      // --- Round 3: high-coverage missing archetypes (the too-low bucket) ---
      // ENCHANTRESS / CONSTELLATION: "whenever you cast/an enchantment enters → draw/trigger"
      if (/(whenever you cast an enchantment|whenever an enchantment( or aura)? you control enters|constellation)/.test(s.trigger + e))
        caps.add("is-enchantress-payoff");
      // MAGECRAFT / spell-cast payoff (Round-4 tightened): a REPEATABLE payoff
      // that triggers on YOU casting an instant/sorcery. Excludes prowess (a
      // combat keyword, not an engine), opponent-turn / first-spell-only riders,
      // and the over-broad "noncreature spell" catch-all that pulled in non-
      // spellslinger commanders. Must be a triggered ability that mentions you
      // casting an instant or sorcery (magecraft is exactly this).
      // (matched on raw line: the "Magecraft —" keyword prefix prevents the line
      // from parsing as a clean trigger segment, so we test s.raw.)
      if (/magecraft|whenever you cast (an instant or sorcery|or copy an instant or sorcery) spell/.test(s.raw))
        caps.add("is-spellcast-payoff");
      if (/(magecraft|whenever you cast or copy an instant or sorcery spell)/.test(s.raw)
          && /(each opponent|opponents?).{0,40}loses? \d+ life/.test(s.raw)
          && /you gain \d+ life/.test(s.raw)) {
        caps.add("is-magecraft-drain-payoff");
        const amount = s.raw.match(/(?:each opponent|opponents?).{0,40}loses? (\d+) life/);
        if (amount) caps.add("magecraft-drain-amount:" + amount[1]);
      }
      if ((s.kind === "triggered" || /\bwhenever\b/.test(s.trigger))
          && /\bwhenever you cast (a |an |one or more )?(spell|instant or sorcery spell|instant or sorcery)\b/.test(s.trigger)
          && /\badd\b/.test(e)) {
        caps.add("is-spellcast-mana-payoff");
        addProducedManaCaps(caps, "spellcast", producedManaProfile(e));
      }
      if (/\b(instant|sorcery)\b/.test(typeText) && /\badd\b/.test(e)) {
        const ritualMana = producedManaProfile(e);
        if (ritualMana.total > 0) {
          caps.add("is-ritual-mana-spell");
          addProducedManaCaps(caps, "ritual-spell", ritualMana);
          addManaCostCaps(caps, "ritual-spell", manaCostProfile(classified._manaCost, Math.max(0, cmc == null ? 0 : cmc)));
        }
      }
      // MILL as engine: opponent/self-mill can be fuel, a win axis, or both.
      // Preserve explicit counts for proof search; "mill three" is very
      // different from "mill half" when escape fuel has to close locally.
      {
        const millCount = e.match(/\bmills? (one|two|three|four|five|six|seven|eight|nine|ten|\d+) cards?\b/)
          || e.match(/\bputs? the top (one|two|three|four|five|six|seven|eight|nine|ten|\d+) cards? .* into (?:your|their|that player'?s?|a) graveyard\b/);
        if (millCount) caps.add("mill-count:" + numberWordValue(millCount[1]));
      }
      if (/\bstorm\b/.test(s.raw)) caps.add("has-storm");
      if (/(target (player|opponent)|each opponent|that player) (mills?|puts? the top)/.test(e) || /\bmills? (a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+|that many)/.test(e)) {
        caps.add("is-mill-source");
        if (/\b(instant|sorcery)\b/.test(typeText)) {
          caps.add("is-mill-spell");
          addManaCostCaps(caps, "mill-spell", manaCostProfile(classified._manaCost, Math.max(0, cmc == null ? 0 : cmc)));
        }
      }
      if (/\bmills?\b|\bsurveil\b|put .* (top|cards?) .* into (your|a) graveyard/.test(e))
        caps.add("is-graveyard-fuel");
      if (/return .* from (your|a|their) graveyard|return .* graveyard .* battlefield|put .* creature card .* graveyard onto the battlefield|cast .* from your graveyard|play .* from your graveyard|you may (cast|play) .* from your graveyard/.test(effectAndRaw))
        caps.add("is-graveyard-recursion");
      if (/if (an|a) opponent would mill|if .* would mill one or more cards?.*mill twice that many|mills? twice that many cards? instead/.test(effectAndRaw))
        caps.add("is-mill-multiplier");
      if (/beginning of each end step/.test(effectAndRaw)
          && /mills? x cards?/.test(effectAndRaw)
          && /x is the number of cards put into (enchanted player'?s?|that player'?s?|their) graveyard from anywhere this turn/.test(effectAndRaw))
        caps.add("is-delayed-same-turn-mill-payoff");
      if (/(target (player|opponent)|each opponent|that player) mills? half (their|that player'?s?|that opponent'?s?) library/.test(effectAndRaw)
          || /mills? half (their|that player'?s?|that opponent'?s?) library/.test(effectAndRaw))
        caps.add("is-half-library-mill-source");
      if (s.kind === "triggered"
          && /(cards?|one or more cards?).{0,80}(opponents?|opponent'?s|their).{0,80}graveyards?/.test(s.trigger)
          && /(loses? \d+ life|loses? that much life|you gain \d+ life|you gain that much life)/.test(e))
        caps.add("is-mill-to-lifeloss-payoff");
      if (s.kind === "triggered"
          && /\bwhenever (an opponent|one or more opponents|a player|that player) loses life\b/.test(s.trigger)
          && /(mills? that many cards?|that player mills?|they mill|mills? \d+ cards?)/.test(e))
        caps.add("is-lifeloss-to-mill-payoff");
      if (/(power|equal to|number of cards).{0,40}(cards? in|graveyard)|for each card in (a|target|their) (player'?s? )?graveyard/.test(e))
        caps.add("is-graveyard-size-payoff");
      // TRIBAL-COUNT / X-per-type payoff (Distant Melody, Lathril). Round-3 gate:
      // only a CREATURE-count payoff feeds bodies. "for each Swamp/land/artifact
      // you control" (Mutilate, Avenger) is a different axis and was wrongly
      // fanned to every creature — exclude noncreature nouns.
      {
        const tcm = e.match(/(?:for each|equal to the number of) (\w+)s? you control/);
        const noncreatureNoun = /^(land|swamp|island|plains|mountain|forest|artifact|enchantment|permanent|instant|sorcery|card|token|treasure)$/;
        if (tcm && (tcm[1] === "creature" || !noncreatureNoun.test(tcm[1])))
          caps.add("is-typecount-payoff");
      }
    }
    // enchantress producer = the card itself IS an enchantment/aura (a cast trigger source)
    if (/\benchantment\b|\baura\b/.test(classified._type || "")) caps.add("is-enchantment");
    // spell producer = an instant/sorcery (feeds magecraft)
    if (/\b(instant|sorcery)\b/.test(classified._type || "")) caps.add("is-noncreature-spell");
    // derived from the existing flat classification (lands already have mana stripped)
    if (classified.produces.mana) caps.add("is-ramp");
    if (classified.consumes.mana) caps.add("is-mana-sink");
    // lord vs generic anthem: a TYPED lord ("Goblins you control get +1/+1") is a
    // real synergy; a generic team anthem ("creatures you control get +1/+1")
    // links to everything, so it's only a weak signal. GATE (audit #1): a real
    // lord is a STATIC buff on a PERMANENT — exclude instants/sorceries (one-shot
    // pumps like Return of the Wildspeaker) and "get +X UNTIL END OF TURN" lines.
    // Round-3 lord tightening: a lord requires an actual STATIC buff to
    // creatures (a permanent's continuous "… you control get +N/+N" or keyword
    // grant), NOT merely being a creature that happens to name a type. Excludes
    // one-shot pumps, "until end of turn", and aristocrats/drain payoffs.
    const isPermanent = !/\b(instant|sorcery)\b/.test(classified._type || "");
    const buffsTeam = segments.some(s => (s.kind === "static")
      && /(creatures?|[a-z]+s) you control (get \+\d|have |gain )/.test(s.effect)
      && !/until end of turn/.test(s.effect));
    const isDrainPayoff = caps.has("is-death-drain-payoff");
    if (isPermanent && buffsTeam && !isDrainPayoff && classified.tribalRefs.length) {
      caps.add("is-lord");
      if (classified.tribalRefs.some(r => r !== "creature")) caps.add("is-typed-lord");
    }
    if (!isLand && /\bcreature\b/.test(typeText)) caps.add("is-creature-permanent");
    if (!isLand && isPermanent) {
      if (/\blegendary\b/.test(typeText)) caps.add("is-legendary-permanent");
      else caps.add("is-nonlegendary-permanent");
    }
    if (!isLand && /\bcreature\b/.test(typeText) && /\bdeathtouch\b/.test(allText))
      caps.add("has-deathtouch");
    if (/\bequipped creature (?:gets [^.]* and has|has) deathtouch\b/.test(allText))
      caps.add("grants-deathtouch-to-equipped-creature");
    if (/\bequipped creature has ["“]\{t\}: this creature deals? 1 damage to (any target|target creature)\b/.test(allText))
      caps.add("grants-free-ping-to-equipped-creature");
    if (/\bequipped creature has [^.]*whenever a creature dies, untap this creature/.test(allText)
        && !/\bonly once (each|per) turn\b|\btriggers? only once (each|per) turn\b/.test(allText))
      caps.add("grants-death-untap-to-equipped-creature");
    if (caps.has("is-damage-prevention-counter-burden")
        && /\bwhen there are [^.]{0,120} counters? on (?:this|that|[a-z][a-z' -]{1,60})\b/.test(allText))
      caps.add("counter-burden-threshold-failure");
    if (caps.has("is-damage-prevention-counter-burden")
        && /\bat the beginning of your upkeep\b/.test(allText)
        && /\bfor each [a-z]+ counter removed this way, you lose 1 life unless you pay\b/.test(allText))
      caps.add("counter-burden-upkeep-loss");
    if (/\bcumulative upkeep\b/.test(allText)) {
      caps.add("is-cumulative-upkeep-counter-burden");
      caps.add("counter-burden-type:age");
      if (/\bprevent all damage that would be dealt to you\b/.test(allText)) {
        caps.add("is-full-self-damage-prevention-source");
        caps.add("damage-prevention-scope:self-all");
      }
    }
    // sac fodder / blink target: real creatures and produced creature tokens
    // are bodies; noncreature tokens such as Treasure are not attackers/deaths.
    if (!isLand && (caps.has("is-creature-token-producer") || /creature/.test((classified._type || "")))) caps.add("is-body");
    if (caps.has("grants-lifelink-to-creature") && caps.has("is-lifegain-to-counter-payoff"))
      caps.add("is-lifelink-counter-engine");
    return [...caps];
  }

  function classify(card) {
    const o = rulesText(card.oracle_text).toLowerCase();
    const eff = effectText(o);
    const isLand = isLandType(card.type_line);
    const produces = {}, consumes = {};
    for (const ev of EVENTS) {
      const ps = subjectsFor(ev.produce, eff); if (ps.length) produces[ev.id] = [...new Set(ps)];
      const cs = subjectsFor(ev.consume, o); if (cs.length) consumes[ev.id] = [...new Set(cs)];
    }
    // Lands tap for mana too, but counting them as `mana` producers makes the
    // whole manabase a hub. Ramp we care about lives on nonland cards (dorks,
    // rocks, rituals, doublers), so drop the land mana producer.
    if (isLand) delete produces.mana;
    const zones = [];
    if (!isLand) for (const z of ZONE_RULES) if (z.re.test(o)) zones.push(z.id);
    const result = {
      produces, consumes, zones,
      role: roleOf(card.type_line, card.oracle_text),
      myTypes: creatureSubtypes(card.type_line),   // this card's own creature subtypes
      tribalRefs: tribalRefs(o),                    // creature types this card scales on
      _type: (card.type_line || "").toLowerCase(),
      _name: (card.name || card.id || "").toLowerCase(),
      _cmc: typeof card.cmc === "number" ? card.cmc : null,
      _manaCost: (card.mana_cost || "").toLowerCase(),
    };
    // pipeline layers: segment → capability tags (used by interactionsBetween)
    result.segments = segmentOracle(card.oracle_text);
    result.caps = capsOf(result.segments, result, isLand);
    return attachSemanticIR(result, card);
  }

  // do produced-subjects overlap consumed-subjects?  any matches anything; each = {you,opp}
  function subjectsOverlap(P, C) {
    if (P.includes(A) || C.includes(A)) return true;
    const expand = arr => new Set(arr.flatMap(s => s === E ? [Y, O] : [s]));
    const ep = expand(P), ec = expand(C);
    for (const x of ep) if (ec.has(x)) return true;
    return false;
  }

  // events through which `prodMap` (producer) feeds `consMap` (consumer)
  function feeds(prodMap, consMap) {
    const out = [];
    for (const ev in prodMap) if (consMap[ev] && subjectsOverlap(prodMap[ev], consMap[ev])) out.push(ev);
    return out;
  }

  // Does a tribal scaler `refs` apply to a creature with subtypes `types`?
  // "creature" is a wildcard team reference (links to any of your creatures);
  // otherwise the referenced type must be one the creature actually has.
  function tribalMatch(refs, types) {
    if (!refs || !refs.length || !types || !types.length) return false;
    for (const r of refs) {
      if (r === "creature") return true;
      if (types.includes(r)) return true;
    }
    return false;
  }

  // ============================ PIPELINE: MATCH =============================
  // Directed enablement families: producer-capability -> consumer-capability.
  // Each yields a classified Interaction (kind/family/strength) when card X has
  // `from` and card Y has `to`. `kind` enablement edges feed loop detection.
  // Enablement families. Strengths are deliberately conservative after the
  // 100-precon audit: families that fire in most decks (generic sacrifice,
  // ramp→sink)
  // are WEAK so they don't inflate cohesion; only genuinely deck-defining,
  // directed enablement (blink→etb, free-untap loops) earns strong/combo.
  const ENABLEMENT = [
    // untap→tap-ability: only meaningful when the untap is FREE (gated below to
    // is-free-untapper). A costed untapper just trades mana.
    { family: "untap→tap-ability", from: "is-free-untapper", to: "has-tap-ability", kind: "enablement", strength: "strong",
      manaLoop: "taps-for-mana" },     // free untap re-tapping a MANA ability = combo-critical
    { family: "etb→blink",         from: "is-blink",    to: "has-etb",          kind: "enablement", strength: "strong" },
    { family: "cost-reduction→ability", from: "is-creature-ability-cost-reducer", to: "has-creature-activated-ability", kind: "enablement", strength: "weak" },
    { family: "cost-reduction→ability", from: "is-cost-reducer", to: "has-nonmana-activated-ability", kind: "enablement", strength: "weak" },
    { family: "cost-reduction→ability", from: "is-artifact-activated-ability-cost-reducer", to: "has-nonmana-activated-ability", kind: "enablement", strength: "weak" },
    { family: "copy→trigger",      from: "is-repeatable-permanent-copy", to: "has-etb",     kind: "synergy",     strength: "moderate" },
    { family: "etb-doubler",       from: "is-etb-doubler", to: "has-etb",       kind: "synergy",     strength: "strong" },
    { family: "token-production→amplifier", from: "is-token-producer", to: "is-token-doubler", kind: "synergy", strength: "strong" },
    { family: "token-production→replacement", from: "is-token-producer", to: "is-token-replacement-modifier", kind: "synergy", strength: "moderate" },
    { family: "vehicle→payoff",    from: "is-vehicle", to: "is-vehicle-payoff", kind: "synergy",     strength: "moderate" },
    { family: "land-recursion→landfall", from: "is-land-recursion", to: "is-landfall-payoff", kind: "synergy", strength: "moderate" },
    { family: "kodama-bounce-land-landfall-loop", from: "is-permanent-etb-hand-dropper", to: "is-self-bounce-land", kind: "enablement", strength: "strong" },
    { family: "kodama-bounce-land-landfall-loop", from: "is-self-bounce-land", to: "is-landfall-payoff", kind: "enablement", strength: "strong" },
    { family: "variable-board-count-mana-loop", from: "is-variable-board-count-mana-source", to: "is-repeatable-creature-untap-ability", kind: "enablement", strength: "strong" },
    { family: "variable-board-count-mana-loop", from: "is-variable-board-count-mana-source", to: "is-attached-creature-untapper", kind: "enablement", strength: "strong" },
    { family: "combat-resource→extra-combat-loop", from: "is-combat-damage-land-untap-engine", to: "is-repeatable-extra-combat-engine", kind: "enablement", strength: "strong" },
    { family: "combat-resource→extra-combat-loop", from: "is-attack-land-untap-engine", to: "is-repeatable-extra-combat-engine", kind: "enablement", strength: "strong" },
    { family: "combat-resource→extra-combat-loop", from: "is-combat-damage-treasure-engine", to: "is-repeatable-extra-combat-engine", kind: "enablement", strength: "strong" },
    { family: "artifact-token→extra-turn-loop", from: "is-turn-cycle-artifact-token-engine", to: "is-artifact-sacrifice-extra-turn-engine", kind: "enablement", strength: "strong" },
    // --- Wave 2 payoff engines (the two biggest missed archetypes) ---
    // aristocrats: creature-token makers/sacrifice outlets feed death payoffs;
    // noncreature tokens do not.
    { family: "death→drain",       from: "is-sac-outlet", to: "is-death-drain-payoff", kind: "synergy", strength: "strong" },
    { family: "death→drain",       from: "is-creature-token-producer", to: "is-death-drain-payoff", kind: "synergy", strength: "moderate" },
    { family: "death→draw",        from: "is-sac-outlet", to: "is-death-draw-payoff", kind: "synergy", strength: "strong" },
    { family: "death→draw",        from: "is-creature-token-producer", to: "is-death-draw-payoff", kind: "synergy", strength: "moderate" },
    { family: "death→tokens",      from: "is-sac-outlet", to: "is-death-token-payoff", kind: "synergy", strength: "strong" },
    { family: "death→tokens",      from: "is-creature-token-producer", to: "is-death-token-payoff", kind: "synergy", strength: "moderate" },
    // go-wide (Round-3 tightened): a creature-token producer feeds a WIDTH-scaling
    // payoff or an overrun. No longer "any body → any attack trigger".
    { family: "go-wide→payoff",    from: "is-creature-token-producer", to: "is-overrun",       kind: "synergy", strength: "strong" },
    { family: "go-wide→payoff",    from: "is-creature-token-producer", to: "is-width-payoff",  kind: "synergy", strength: "moderate" },
    { family: "convoke-fodder→payoff", from: "is-creature-token-producer", to: "is-convoke-cast-payoff", kind: "synergy", strength: "weak" },
    { family: "convoke-spell→payoff", from: "is-convoke-spell", to: "is-convoke-cast-payoff", kind: "synergy", strength: "moderate" },
    { family: "lifegain-source→drain-payoff", from: "is-creature-etb-lifegain-payoff", to: "is-lifeloss-from-your-lifegain", kind: "synergy", strength: "strong" },
    { family: "lifegain-source→drain-payoff", from: "is-repeatable-tap-lifegain-ability", to: "is-lifeloss-from-your-lifegain", kind: "synergy", strength: "moderate" },
    { family: "lifegain-source→drain-payoff", from: "grants-lifelink-to-creature", to: "is-lifeloss-from-your-lifegain", kind: "synergy", strength: "moderate" },
    // counters: proliferate / multipliers amplify any counter source
    { family: "proliferate→counters", from: "is-proliferator",     to: "has-counters", kind: "synergy", strength: "moderate" },
    { family: "counter-multiplier",   from: "is-counter-multiplier", to: "has-counters", kind: "synergy", strength: "strong" },
    // --- Round-3 new engines (rescue the too-low monothematic decks) ---
    { family: "enchantress",       from: "is-enchantment",      to: "is-enchantress-payoff", kind: "synergy", strength: "strong" },
    { family: "magecraft",         from: "is-noncreature-spell", to: "is-spellcast-payoff",  kind: "synergy", strength: "moderate" },
    { family: "mill→graveyard-payoff", from: "is-mill-source",  to: "is-graveyard-size-payoff", kind: "synergy", strength: "moderate" },
    { family: "graveyard-fuel→recursion", from: "is-graveyard-fuel", to: "is-graveyard-recursion", kind: "synergy", strength: "moderate" },
    { family: "tribal-count→payoff",   from: "is-body",          to: "is-typecount-payoff",  kind: "synergy", strength: "moderate" },
    // --- Round-4: the combat axis (biggest missing payoff class) ---
    // attackers feed a combat-trigger payoff — WEAK: "I have creatures + an
    // attack-trigger card" is near-universal, so the bare body→payoff link is
    // incidental (audit clique-fanout warning). The real synergy is a combat
    // ENABLER (evasion/double-strike/extra-combat) amplifying the payoff: strong.
    { family: "combat→payoff",     from: "is-creature-token-producer", to: "is-combat-payoff",    kind: "synergy", strength: "weak" },
    { family: "combat-enabler",    from: "is-combat-enabler", to: "is-combat-payoff",    kind: "synergy", strength: "strong" },
    { family: "attachment-source→payoff", from: "is-creature-attachment-source", to: "is-attachment-payoff", kind: "synergy", strength: "moderate" },
    // --- political / forced-combat engine: goad sources force opponents to
    // attack INTO your attack-punisher payoffs. A real directed build-around
    // (the pillowfort/group-slug archetype), so moderate — not a combo loop.
    { family: "goad→punisher",     from: "is-goad-source",    to: "is-attack-punisher", kind: "synergy", strength: "moderate" },
    // EDHREC / Commander Spellbook combo archetypes. These remain capability-
    // based: no card names, only text-derived roles that appear in the combo
    // detail prerequisites/steps/results shape.
    { family: "library-exile→empty-library-win", from: "is-library-exile-source", to: "is-empty-library-win-payoff", kind: "enablement", strength: "combo-critical" },
    { family: "lifeloss→lifegain-loop", from: "is-lifegain-from-opponent-lifeloss", to: "is-lifeloss-from-your-lifegain", kind: "enablement", strength: "combo-critical" },
    { family: "lifegain→lifeloss-loop", from: "is-lifeloss-from-your-lifegain", to: "is-lifegain-from-opponent-lifeloss", kind: "enablement", strength: "combo-critical" },
    { family: "mill-lifeloss-feedback-loop", from: "is-mill-to-lifeloss-payoff", to: "is-lifeloss-to-mill-payoff", kind: "enablement", strength: "combo-critical" },
    { family: "mill-lifeloss-feedback-loop", from: "is-lifeloss-to-mill-payoff", to: "is-mill-to-lifeloss-payoff", kind: "enablement", strength: "combo-critical" },
    { family: "opponent-draw-punisher-win", from: "is-mass-opponent-draw-source", to: "is-opponent-draw-punisher", kind: "enablement", strength: "combo-critical" },
    { family: "mill-multiplier-finite-mill", from: "is-half-library-mill-source", to: "is-mill-multiplier", kind: "enablement", strength: "combo-critical" },
    { family: "delayed-mill-equalizer-finite-mill", from: "is-half-library-mill-source", to: "is-delayed-same-turn-mill-payoff", kind: "enablement", strength: "combo-critical" },
    { family: "opponent-draw→punisher", from: "is-repeatable-opponent-draw-source", to: "is-opponent-draw-punisher", kind: "synergy", strength: "strong" },
    { family: "mutual-etb-blink-reset-loop", from: "is-etb-blink", to: "is-etb-blink", kind: "enablement", strength: "combo-critical" },
    { family: "self-untap-mana-loop", from: "is-colorless-mana-amplifier", to: "is-self-untapper", kind: "enablement", strength: "combo-critical" },
    { family: "lifelink-counter-damage-loop", from: "is-lifelink-counter-engine", to: "is-counter-to-damage-source", kind: "enablement", strength: "combo-critical" },
    { family: "token-replacement-sacrifice-mana-loop", from: "is-token-to-creature-token-replacer", to: "is-death-mana-payoff", kind: "enablement", strength: "combo-critical" },
    { family: "imprint-untap-spell-loop", from: "is-cheap-instant-nonland-permanent-untap-spell", to: "is-repeatable-cheap-instant-caster", kind: "enablement", strength: "combo-critical" },
    { family: "tap-free-cast→untap-engine", from: "is-cheap-instant-engine-untap-spell", to: "is-tap-free-cast-engine", kind: "enablement", strength: "strong" },
    { family: "spell-count→spell-copy-engine", from: "is-noncreature-spell", to: "is-cast-threshold-spell-copy-engine", kind: "synergy", strength: "moderate" },
    { family: "spell-copy-engine→cantrip-untap-loop", from: "is-cheap-instant-cantrip-engine-untap-spell", to: "is-cast-threshold-spell-copy-engine", kind: "enablement", strength: "combo-critical" },
    { family: "spell-copy-engine→untap-reset", from: "is-cheap-instant-engine-untap-spell", to: "is-cast-threshold-spell-copy-engine", kind: "enablement", strength: "strong" },
    { family: "self-untap-mana→ability-copy-loop", from: "is-activated-ability-copier", to: "is-self-untapper", kind: "enablement", strength: "combo-critical" },
    { family: "hasty-copy→etb-untap-loop", from: "is-repeatable-hasty-creature-copy", to: "etb-untaps-permanent", kind: "enablement", strength: "combo-critical" },
    { family: "combat-copy-token→extra-combat-loop", from: "is-combat-copy-token-equipment", to: "is-attack-extra-combat-source", kind: "enablement", strength: "combo-critical" },
    { family: "combat-sacrifice-aura→extra-combat-loop", from: "is-combat-sacrifice-extra-combat-aura", to: "is-fresh-attack-carrier-source", kind: "enablement", strength: "combo-critical" },
    { family: "spell-copy-etb→creature-copy-spell-loop", from: "is-etb-spell-copier", to: "is-hasty-creature-copy-spell", kind: "enablement", strength: "combo-critical" },
    { family: "death-copy-spell-etb-copy-loop", from: "is-etb-spell-copier", to: "is-death-copy-creature-spell", kind: "enablement", strength: "combo-critical" },
    { family: "self-copy-spell→magecraft-drain-loop", from: "is-self-copying-targeted-spell", to: "is-magecraft-drain-payoff", kind: "enablement", strength: "combo-critical" },
    { family: "buyback-copy-ritual-loop", from: "is-buyback-spell-copy", to: "is-ritual-mana-spell", kind: "enablement", strength: "strong" },
    { family: "buyback-copy-ritual-loop", from: "is-spell-cost-reducer", to: "is-buyback-spell-copy", kind: "enablement", strength: "strong" },
    { family: "buyback-copy-ritual-loop", from: "is-spellcast-mana-payoff", to: "is-buyback-spell-copy", kind: "enablement", strength: "strong" },
    { family: "escape-wheel-mana-loop", from: "is-graveyard-escape-enabler", to: "is-wheel-draw-discard-spell", kind: "enablement", strength: "strong" },
    { family: "escape-wheel-mana-loop", from: "is-graveyard-escape-enabler", to: "is-discard-hand-sac-mana-source", kind: "enablement", strength: "strong" },
    { family: "escape-wheel-mana-loop", from: "is-discard-hand-sac-mana-source", to: "is-wheel-draw-discard-spell", kind: "enablement", strength: "strong" },
    { family: "escape-mill-mana-loop", from: "is-graveyard-escape-enabler", to: "is-mill-spell", kind: "enablement", strength: "strong" },
    { family: "escape-mill-mana-loop", from: "is-discard-hand-sac-mana-source", to: "is-mill-spell", kind: "enablement", strength: "strong" },
    { family: "life-paid-damage-lifeloss-recovery-loop", from: "is-life-paid-damage-source", to: "is-lifegain-from-opponent-lifeloss", kind: "enablement", strength: "combo-critical" },
    { family: "exile-recast-creature-mana-loop", from: "is-creature-exile-cast-mana-outlet", to: "is-recursive-exile-cast-body", kind: "enablement", strength: "combo-critical" },
    { family: "counter-token→etb-counter-loop", from: "is-counter-to-creature-token-engine", to: "is-creature-etb-counter-granter", kind: "enablement", strength: "combo-critical" },
    { family: "minus-counter-death→token-loop", from: "is-minus-counter-death-spreader", to: "is-minus-counter-to-1-1-token-engine", kind: "enablement", strength: "combo-critical" },
    { family: "artifact-cost-reduction→top-loop-piece", from: "is-artifact-spell-cost-reducer", to: "is-self-top-draw-artifact", kind: "enablement", strength: "strong" },
    { family: "cast-from-top→top-loop-piece", from: "is-artifact-cast-from-top-enabler", to: "is-self-top-draw-artifact", kind: "enablement", strength: "strong" },
    { family: "draw-damage-feedback-loop", from: "draw-to-damage-subject:you", to: "is-damage-to-draw-payoff", kind: "enablement", strength: "combo-critical" },
    { family: "draw-damage-feedback-loop", from: "draw-to-damage-subject:each", to: "is-damage-to-draw-payoff", kind: "enablement", strength: "combo-critical" },
    { family: "draw-damage-feedback-loop", from: "is-damage-to-draw-payoff", to: "draw-to-damage-subject:you", kind: "enablement", strength: "combo-critical" },
    { family: "draw-damage-feedback-loop", from: "is-damage-to-draw-payoff", to: "draw-to-damage-subject:each", kind: "enablement", strength: "combo-critical" },
    { family: "recursive-body-sacrifice-mana-loop", from: "is-recursive-body", to: "is-mana-sac-outlet", kind: "enablement", strength: "combo-critical" },
  ];
  const hasCap = (node, cap) => (node.caps || []).includes(cap);
  const capSuffixes = (node, prefix) => (node.caps || [])
    .filter(cap => cap.startsWith(prefix))
    .map(cap => cap.slice(prefix.length));
  const capNumbers = (node, prefix) => capSuffixes(node, prefix + ":")
    .map(x => parseInt(x, 10))
    .filter(Number.isFinite);
  const maxCapNumber = (node, prefix) => Math.max(0, ...capSuffixes(node, prefix)
    .map(x => parseInt(x, 10))
    .filter(Number.isFinite));
  const minCapNumber = (node, prefix) => {
    const values = capSuffixes(node, prefix).map(x => parseInt(x, 10)).filter(Number.isFinite);
    return values.length ? Math.min(...values) : 0;
  };
  const maxCap = (node, prefix) => Math.max(0, ...capNumbers(node, prefix));
  const recursiveCostProfile = (node) => ({
    total: minCapNumber(node, "recursive-body-cost:"),
    colorless: maxCap(node, "recursive-body-colorless-cost"),
    colors: Object.fromEntries(MANA_COLORS.map(color => [color, maxCap(node, "recursive-body-color-" + color)])),
  });
  const sacOutletManaProfile = (node) => ({
    total: maxCapNumber(node, "sac-outlet-mana-produced:"),
    any: maxCap(node, "sac-outlet-mana-any"),
    colorless: maxCap(node, "sac-outlet-mana-c"),
    colors: Object.fromEntries(MANA_COLORS.map(color => [color, maxCap(node, "sac-outlet-mana-" + color)])),
  });
  const manaCostProfileFromCaps = (node, prefix) => ({
    total: minCapNumber(node, prefix + "-cost:"),
    colorless: maxCap(node, prefix + "-colorless-cost"),
    colors: Object.fromEntries(MANA_COLORS.map(color => [color, maxCap(node, prefix + "-color-" + color)])),
  });
  const deathManaProfile = (node) => ({
    total: maxCapNumber(node, "death-mana-produced:"),
    any: maxCap(node, "death-mana-any"),
    colorless: maxCap(node, "death-mana-c"),
    colors: Object.fromEntries(MANA_COLORS.map(color => [color, maxCap(node, "death-mana-" + color)])),
  });
  const etbBlinkTargetCaps = (blinker) => {
    if (hasCap(blinker, "etb-blinks-permanent")) return ["is-etb-blink"];
    if (hasCap(blinker, "etb-blinks-creature")) return ["is-etb-blink", "is-creature-permanent"];
    return [];
  };
  const canEtbBlinkTarget = (blinker, target) => {
    const requiredCaps = etbBlinkTargetCaps(blinker);
    if (!requiredCaps.length) return false;
    if (!faceCompatibleCaps(target, requiredCaps)) return false;
    if (!target?.faceFacts?.length && requiredCaps.includes("is-creature-permanent") && !isCreaturePermanent(target)) return false;
    return true;
  };
  const canPermanentCopyEtbTarget = (copier, target) => {
    const scopes = capSuffixes(copier, "permanent-copy-target:");
    if (!scopes.length) return false;
    if (scopes.includes("permanent")) return true;
    if (scopes.includes("creature")) {
      if (faceCompatibleCaps(target, ["is-creature-permanent"])) return true;
      return !target?.faceFacts?.length && isCreaturePermanent(target);
    }
    if (scopes.includes("artifact"))
      return faceCompatibleCaps(target, ["is-artifact-permanent"]) || /\bartifact\b/i.test(target.type || target._type || "");
    return false;
  };
  const counterTokenColors = (node) => capSuffixes(node, "counter-token-color:");
  const etbCounterGranterColors = (node) => capSuffixes(node, "etb-counter-granter-token-color:");
  const counterTokenCanTriggerGranter = (tokenEngine, granter) => {
    const tokenColors = counterTokenColors(tokenEngine);
    const accepted = etbCounterGranterColors(granter);
    if (!tokenColors.length || !accepted.length) return false;
    if (accepted.includes("any")) return !tokenColors.includes("unknown");
    return accepted.some(color => tokenColors.includes(color));
  };
  const EXCLUSIVE_FACE_AVAILABILITIES = new Set(["either-face", "transforms", "separate-objects", "merged-multiface"]);
  const factSourcesForCap = (node, cap) => {
    const caps = node && node.factSources && node.factSources.caps;
    if (!caps) return [];
    if (caps[cap]) return caps[cap];
    const prefix = cap + ":";
    return Object.entries(caps).filter(([key]) => key.startsWith(prefix)).flatMap(([, sources]) => sources);
  };
  const faceConstraintKey = source => {
    if (!source || source.faceIndex == null) return null;
    if (!EXCLUSIVE_FACE_AVAILABILITIES.has(source.availability)) return null;
    return `${source.availability}:${source.faceIndex}`;
  };
  const isExclusivePhysicalCard = node => (node && node.faceFacts || []).some(face => EXCLUSIVE_FACE_AVAILABILITIES.has(face.availability));
  const capAvailable = (node, cap) => hasCap(node, cap)
    || (node?.caps || []).some(key => key.startsWith(cap + ":"))
    || factSourcesForCap(node, cap).length > 0;
  const faceCompatibleCaps = (node, caps) => {
    if (!(caps || []).every(cap => capAvailable(node, cap))) return false;
    if (!isExclusivePhysicalCard(node)) return true;
    const constrained = [];
    for (const cap of caps || []) {
      const sources = factSourcesForCap(node, cap);
      if (sources.length && sources.every(source => source.availability === "merged-multiface" && source.faceIndex == null)) return false;
      const keys = [...new Set(sources.map(faceConstraintKey).filter(Boolean))].sort();
      if (keys.length) constrained.push(keys);
    }
    if (constrained.length <= 1) return true;
    let possible = new Set(constrained[0]);
    for (const keys of constrained.slice(1)) possible = new Set(keys.filter(key => possible.has(key)));
    return possible.size > 0;
  };
  const isCreaturePermanent = (node) => capAvailable(node, "is-creature-permanent") || /\bcreature\b/i.test(node.type || "");
  const isLegendaryPermanent = (node) => hasCap(node, "is-legendary-permanent") || /\blegendary\b/i.test(node.type || "");
  const copyTokenLegendSafe = (copier, target, tokenNonlegendaryCap, targetCaps = []) => {
    if (hasCap(copier, tokenNonlegendaryCap)) return true;
    if (faceCompatibleCaps(target, [...targetCaps, "is-nonlegendary-permanent"])) return true;
    if (!target?.faceFacts?.length && !isLegendaryPermanent(target)) return true;
    return false;
  };
  const canHastyCopyTarget = (copier, target, extraTargetCaps = []) => {
    if (!hasCap(copier, "hasty-copy-target-creature")) return false;
    const targetCaps = ["is-creature-permanent", ...extraTargetCaps];
    if (hasCap(copier, "hasty-copy-target-requires-nonlegendary")) targetCaps.push("is-nonlegendary-permanent");
    if (!faceCompatibleCaps(target, targetCaps)) return false;
    if (!target?.faceFacts?.length && !isCreaturePermanent(target)) return false;
    if (!target?.faceFacts?.length && hasCap(copier, "hasty-copy-target-requires-nonlegendary") && isLegendaryPermanent(target)) return false;
    return copyTokenLegendSafe(copier, target, "hasty-copy-token-nonlegendary", targetCaps);
  };
  const canPrecombatCopyTarget = (copier, target, extraTargetCaps = []) => {
    if (!hasCap(copier, "is-precombat-hasty-creature-copy-source")) return false;
    const targetCaps = ["is-creature-permanent", ...extraTargetCaps];
    if (!faceCompatibleCaps(target, targetCaps)) return false;
    if (!target?.faceFacts?.length && !isCreaturePermanent(target)) return false;
    return copyTokenLegendSafe(copier, target, "precombat-copy-token-nonlegendary", targetCaps);
  };
  const canHastyCopySpellTarget = (copySpell, target, extraTargetCaps = []) => {
    if (!hasCap(copySpell, "hasty-copy-spell-target-creature")) return false;
    const targetCaps = ["is-creature-permanent", "is-nonlegendary-permanent", ...extraTargetCaps];
    if (!faceCompatibleCaps(target, targetCaps)) return false;
    if (!target?.faceFacts?.length && !isCreaturePermanent(target)) return false;
    if (!target?.faceFacts?.length && isLegendaryPermanent(target)) return false;
    return true;
  };
  const canDeathCopySpellTarget = (copySpell, target, extraTargetCaps = []) => {
    if (!hasCap(copySpell, "death-copy-spell-target-creature")) return false;
    const targetCaps = ["is-creature-permanent", "is-nonlegendary-permanent", ...extraTargetCaps];
    if (!faceCompatibleCaps(target, targetCaps)) return false;
    if (!target?.faceFacts?.length && !isCreaturePermanent(target)) return false;
    if (!target?.faceFacts?.length && isLegendaryPermanent(target)) return false;
    return true;
  };
  const damageToDrawAppliesToSource = (damageToDraw, source) => {
    if (hasCap(damageToDraw, "damage-to-draw-scope:source-you-control")) return true;
    if (hasCap(damageToDraw, "damage-to-draw-scope:enchanted-creature")
        || hasCap(damageToDraw, "damage-to-draw-scope:equipped-creature")
        || hasCap(damageToDraw, "damage-to-draw-scope:paired-creature-grant")) {
      return faceCompatibleCaps(source, ["is-creature-permanent", "is-draw-to-damage-payoff"]);
    }
    return false;
  };
  const recursiveBodyPreconditionSatisfiedByPair = (body, outlet) =>
    !hasCap(body, "recursive-body-requires-another-creature")
      || faceCompatibleCaps(outlet, ["is-mana-sac-outlet", "is-creature-permanent"]);
  function canPayRecursiveCost(cost, mana) {
    if ((mana.colorless || 0) < (cost.colorless || 0)) return false;
    let anyRemaining = mana.any;
    for (const color of MANA_COLORS) {
      const shortage = Math.max(0, (cost.colors[color] || 0) - (mana.colors[color] || 0));
      anyRemaining -= shortage;
      if (anyRemaining < 0) return false;
    }
    return mana.total >= cost.total;
  }

  // Build the full set of classified Interactions between two cards (both ways).
  function interactionsBetween(a, b) {
    const out = [];
    // 1) reaction edges: A produces an event B reacts to (subject-aware) — weak.
    const seen = new Set();
    const addReaction = (src, dst, srcId, dstId) => {
      for (const ev of feeds(src.produces, dst.consumes)) {
        const key = ev + "|" + srcId;
        if (seen.has(key)) continue; seen.add(key);
        out.push({ kind: "reaction", family: ev, event: ev, direction: srcId + "→" + dstId,
          strength: "weak", loops: false, evidence: { event: ev } });
      }
    };
    addReaction(a, b, "A", "B");
    addReaction(b, a, "B", "A");

    // 2) tribal synergy: a TYPED lord ↔ matching creature is a real build-around
    // (moderate); a generic team anthem links to every creature (weak). GATED to
    // the is-lord cap so mis-tagged instants/equipment (audit #1) don't fire.
    const aLordRefs = hasCap(a, "is-typed-lord") ? a.tribalRefs.filter(r => r !== "creature") : [];
    const bLordRefs = hasCap(b, "is-typed-lord") ? b.tribalRefs.filter(r => r !== "creature") : [];
    const typedTribal = tribalMatch(aLordRefs, b.myTypes) || tribalMatch(bLordRefs, a.myTypes);
    if (typedTribal)
      out.push({ kind: "synergy", family: "lord→tribe", event: "tribal", direction: "both",
        strength: "moderate", loops: false, evidence: { tribal: true, typed: true } });
    const aTribalPayoff = hasCap(a, "is-tribal-payoff") && tribalMatch(a.tribalRefs.filter(r => r !== "creature"), b.myTypes);
    const bTribalPayoff = hasCap(b, "is-tribal-payoff") && tribalMatch(b.tribalRefs.filter(r => r !== "creature"), a.myTypes);
    if (aTribalPayoff || bTribalPayoff)
      out.push({ kind: "synergy", family: "tribal-payoff→tribe", event: "tribal", direction: "both",
        strength: "moderate", loops: false, evidence: { tribal: true, recruiter: true } });

    // 3) ramp ↔ sink: near-universal in EDH (most decks ramp into a payoff), so
    // keep it weak — it's a real link but not what makes a deck cohesive.
    for (const it of out) if (it.event === "mana") { it.kind = "synergy"; it.family = "ramp→sink"; it.strength = "weak"; }

    // Marked-exile engines: one card exiles cards with a named marker counter,
    // another card lets you play/cast cards exiled with that same marker. Keep
    // the family generic while matching the marker type to avoid false links
    // between unrelated exile counters.
    const addExiledCardAccess = (src, dst, dir) => {
      const sourceMarkers = new Set(capSuffixes(src, "exile-access-source:"));
      const useMarkers = capSuffixes(dst, "uses-exiled-card-access:");
      const markers = useMarkers.filter(marker => sourceMarkers.has(marker));
      if (!markers.length) return;
      out.push({ kind: "synergy", family: "exiled-card-access", event: "enable:exiled-card-access", direction: dir,
        strength: "strong", loops: false, evidence: { markers: [...new Set(markers)].sort() } });
    };
    addExiledCardAccess(a, b, "A→B");
    addExiledCardAccess(b, a, "B→A");

    // 4) enablement families (directed, capability-based)
    for (const f of ENABLEMENT) {
      for (const [src, dst, dir] of [[a, b, "A→B"], [b, a, "B→A"]]) {
        if (hasCap(src, f.from) && hasCap(dst, f.to)) {
          let strength = f.strength;
          let family = f.family;
          let evidence = { from: f.from, to: f.to };
          // free untap re-tapping a MANA ability = combo-critical — but ONLY if
          // the untapper can actually untap the type that produces the mana
          // (untaps-any, or untaps the rock's/dork's type). Untapping lands
          // does not re-enable a creature/artifact mana source.
          if (f.manaLoop && hasCap(dst, f.manaLoop)) {
            const canRetap = hasCap(src, "untaps-any")
              || (hasCap(dst, "mana-from-creature") && hasCap(src, "untaps-creature"))
              || (hasCap(dst, "mana-from-artifact") && hasCap(src, "untaps-artifact"));
            if (canRetap) strength = "combo-critical";
          }
          if (f.family === "cost-reduction→ability" && f.from === "is-artifact-activated-ability-cost-reducer") {
            const targetIsArtifact = /\bartifact\b/i.test(dst.type || dst._type || "");
            evidence = { from: f.from, to: f.to, targetIsArtifact };
            if (!targetIsArtifact) continue;
          }
          if (f.family === "copy→trigger") {
            evidence = {
              from: f.from,
              to: f.to,
              copyTargetScopes: capSuffixes(src, "permanent-copy-target:"),
              targetIsCreature: isCreaturePermanent(dst),
              targetLegal: canPermanentCopyEtbTarget(src, dst),
            };
            if (!evidence.targetLegal) continue;
          }
          // Repeatable blink + ETB land untap is capability-based. If the
          // land-untapper refreshes at least enough lands to pay the blink
          // activation, it is a loop; exact net mana may depend on land output.
          if (f.family === "etb→blink" && hasCap(src, "is-repeatable-blink") && hasCap(dst, "etb-untaps-land")) {
            const blinkCost = maxCapNumber(src, "blink-cost:");
            const untapCount = maxCapNumber(dst, "etb-untaps-land:");
            family = "blink→land-untap-etb";
            evidence = { from: f.from, to: f.to, blinkCost, untapCount };
            if (untapCount >= blinkCost && blinkCost > 0) strength = "combo-critical";
          }
          if (f.family === "self-untap-mana→ability-copy-loop") {
            const copyCost = maxCapNumber(src, "ability-copy-cost:");
            const untapCost = maxCapNumber(dst, "self-untap-cost:");
            const manaProduced = maxCapNumber(dst, "mana-produced:");
            evidence = { from: f.from, to: f.to, copyCost, untapCost, manaProduced };
            if (!hasCap(dst, "taps-for-mana") || (2 * manaProduced) <= (untapCost + copyCost)) continue;
          }
          if (f.family === "self-untap-mana-loop" && f.from === "is-colorless-mana-amplifier") {
            const untapCost = maxCapNumber(dst, "self-untap-cost:");
            const manaProduced = maxCapNumber(dst, "mana-produced:");
            const amplification = maxCapNumber(src, "colorless-mana-amplifier:");
            evidence = { from: f.from, to: f.to, amplification, untapCost, manaProduced };
            if (!hasCap(dst, "taps-for-mana") || !hasCap(dst, "produces-colorless-mana") || manaProduced + amplification <= untapCost) continue;
          }
          if (f.family === "lifelink-counter-damage-loop") {
            evidence = {
              from: f.from,
              to: f.to,
              targetLegal: faceCompatibleCaps(dst, ["is-creature-permanent", "is-counter-to-damage-source"]),
            };
            if (!evidence.targetLegal) continue;
          }
          if (f.family === "mutual-etb-blink-reset-loop") {
            evidence = { from: f.from, to: f.to, firstCanTargetSecond: canEtbBlinkTarget(src, dst), secondCanTargetFirst: canEtbBlinkTarget(dst, src) };
            if (!evidence.firstCanTargetSecond || !evidence.secondCanTargetFirst) continue;
          }
          if (f.family === "hasty-copy→etb-untap-loop") {
            evidence = {
              from: f.from,
              to: f.to,
              copyTargetLegal: canHastyCopyTarget(src, dst, ["etb-untaps-permanent"]),
              targetIsCreature: isCreaturePermanent(dst),
              targetIsLegendary: isLegendaryPermanent(dst),
              requiresNonlegendary: hasCap(src, "hasty-copy-target-requires-nonlegendary"),
            };
            if (!evidence.copyTargetLegal) continue;
          }
          if (f.family === "combat-copy-token→extra-combat-loop") {
            evidence = {
              from: f.from,
              to: f.to,
              targetIsCreature: isCreaturePermanent(dst),
              copyTargetLegal: canPrecombatCopyTarget(src, dst, ["is-attack-extra-combat-source"]),
              createsNonlegendaryHastyToken: hasCap(src, "combat-copy-token-haste") && hasCap(src, "combat-copy-token-nonlegendary"),
              freshTokenRepeatsExtraCombat: hasCap(dst, "extra-combat-repeatable-with-fresh-token"),
            };
            if (!evidence.targetIsCreature || !evidence.copyTargetLegal || !evidence.createsNonlegendaryHastyToken || !evidence.freshTokenRepeatsExtraCombat) continue;
          }
          if (f.family === "combat-sacrifice-aura→extra-combat-loop") {
            const freshCarrierCount = maxCapNumber(dst, "fresh-carrier-tokens-created:");
            evidence = {
              from: f.from,
              to: f.to,
              auraRequiresConnect: hasCap(src, "combat-sacrifice-aura-requires-connect"),
              auraSacrificesCarrier: hasCap(src, "combat-sacrifice-aura-sacrifices-carrier"),
              auraReattaches: hasCap(src, "combat-sacrifice-aura-reattaches"),
              auraUntapsCreatures: hasCap(src, "combat-sacrifice-aura-untaps-creatures"),
              auraAddsCombat: hasCap(src, "combat-sacrifice-aura-adds-combat"),
              freshCarrierTiming: hasCap(dst, "fresh-carrier-timing:beginning-of-combat"),
              freshCarrierAttacks: hasCap(dst, "fresh-carrier-token-attacks"),
              freshCarrierContinuity: hasCap(dst, "fresh-carrier-continuity"),
              freshCarrierCount,
              legalTargetAtTriggerResolution: freshCarrierCount > 0 && hasCap(dst, "fresh-carrier-continuity"),
            };
            if (!evidence.auraRequiresConnect
                || !evidence.auraSacrificesCarrier
                || !evidence.auraReattaches
                || !evidence.auraUntapsCreatures
                || !evidence.auraAddsCombat
                || !evidence.freshCarrierTiming
                || !evidence.freshCarrierAttacks
                || !evidence.legalTargetAtTriggerResolution) continue;
          }
          if (f.family === "combat-resource→extra-combat-loop") {
            const cost = manaCostProfileFromCaps(dst, "extra-combat");
            evidence = {
              from: f.from,
              to: f.to,
              extraCombatCost: cost.total,
              extraCombatColors: cost.colors,
              extraCombatUntapsCreatures: hasCap(dst, "extra-combat-untaps-creatures"),
              activationTimingSafe: hasCap(dst, "is-repeatable-extra-combat-activator"),
              createsPostCombatMainPhase: hasCap(dst, "extra-combat-adds-main-phase"),
              activationWindow: capSuffixes(dst, "extra-combat-activation-window:")[0] || "unknown",
              activationTapsSource: hasCap(dst, "extra-combat-activation-taps-source"),
              activationUsesUntapSymbol: hasCap(dst, "extra-combat-activation-uses-untap-symbol"),
              sourceIsCreature: isCreaturePermanent(dst),
              activationSourceResetSafe: true,
              resourceRequiresConnect: hasCap(src, "combat-resource-requires-connect"),
              resourceRequiresAttack: hasCap(src, "combat-resource-requires-attack"),
            };
            const canRepeatActivation = evidence.activationTimingSafe
              && (evidence.createsPostCombatMainPhase || evidence.activationWindow !== "sorcery");
            evidence.activationSourceResetSafe = (!evidence.activationTapsSource && !evidence.activationUsesUntapSymbol)
              || (evidence.sourceIsCreature
                && (!evidence.activationTapsSource || hasCap(dst, "extra-combat-untaps-activating-creature")));
            if (!evidence.extraCombatUntapsCreatures || !canRepeatActivation || !evidence.activationSourceResetSafe || !(cost.total > 0)) continue;
          }
          if (f.family === "artifact-token→extra-turn-loop") {
            const artifactTokens = maxCapNumber(src, "artifact-tokens-per-turn:");
            const sacrificeCount = maxCapNumber(dst, "artifact-extra-turn-sac-count:");
            evidence = { from: f.from, to: f.to, artifactTokens, sacrificeCount };
            if (!(artifactTokens >= sacrificeCount && sacrificeCount > 0)) continue;
          }
          if (f.family === "spell-copy-etb→creature-copy-spell-loop") {
            evidence = {
              from: f.from,
              to: f.to,
              copyTargetLegal: canHastyCopySpellTarget(dst, src, ["is-etb-spell-copier"]),
              targetIsCreature: isCreaturePermanent(src),
              targetIsLegendary: isLegendaryPermanent(src),
              requiresNonlegendary: hasCap(dst, "hasty-copy-spell-target-requires-nonlegendary"),
            };
            if (!evidence.copyTargetLegal) continue;
          }
          if (f.family === "death-copy-spell-etb-copy-loop") {
            evidence = {
              from: f.from,
              to: f.to,
              copyTargetLegal: canDeathCopySpellTarget(dst, src, ["is-etb-spell-copier"]),
              targetIsCreature: isCreaturePermanent(src),
              targetIsLegendary: isLegendaryPermanent(src),
            };
            if (!evidence.copyTargetLegal) continue;
          }
          if (f.family === "draw-damage-feedback-loop") {
            const drawToDamage = hasCap(src, "is-draw-to-damage-payoff") ? src : dst;
            const damageToDraw = hasCap(src, "is-damage-to-draw-payoff") ? src : dst;
            evidence = {
              from: f.from,
              to: f.to,
              damageToDrawScopes: (damageToDraw.caps || []).filter(cap => cap.startsWith("damage-to-draw-scope:")),
              scopeApplies: damageToDrawAppliesToSource(damageToDraw, drawToDamage),
            };
            if (!evidence.scopeApplies) continue;
          }
          if (f.family === "counter-token→etb-counter-loop") {
            evidence = {
              from: f.from,
              to: f.to,
              targetLegal: faceCompatibleCaps(src, ["is-creature-permanent", "is-counter-to-creature-token-engine"]),
              tokenColors: counterTokenColors(src),
              acceptedTokenColors: etbCounterGranterColors(dst),
              tokenCanTriggerCounterGranter: counterTokenCanTriggerGranter(src, dst),
            };
            if (!evidence.targetLegal || !evidence.tokenCanTriggerCounterGranter) continue;
          }
          if (f.family === "token-replacement-sacrifice-mana-loop") {
            const activationCost = manaCostProfileFromCaps(src, "sac-outlet-activation");
            const deathMana = deathManaProfile(dst);
            evidence = { from: f.from, to: f.to, activationCost: activationCost.total, deathManaProduced: deathMana.total, producedAny: deathMana.any, producedColorless: deathMana.colorless, producedColors: deathMana.colors };
            if (!hasCap(src, "is-creature-sac-outlet") || !canPayRecursiveCost(activationCost, deathMana)) continue;
          }
          if (f.family === "recursive-body-sacrifice-mana-loop") {
            const cost = recursiveCostProfile(src);
            const mana = sacOutletManaProfile(dst);
            const preconditionSatisfied = recursiveBodyPreconditionSatisfiedByPair(src, dst);
            evidence = { from: f.from, to: f.to, bodyCost: cost.total, sacManaProduced: mana.total, requiredColorless: cost.colorless, requiredColors: cost.colors, producedAny: mana.any, producedColorless: mana.colorless, producedColors: mana.colors, recursionPreconditionSatisfied: preconditionSatisfied };
            if (!preconditionSatisfied || !canPayRecursiveCost(cost, mana)) continue;
          }
          out.push({ kind: f.kind, family, event: "enable:" + family, direction: dir,
            strength, loops: false, evidence });
        }
      }
    }
    return out;
  }

  function interactionProfile(node, graph) {
    const families = new Map();
    const addFamily = (family, strength, direction) => {
      if (!family) return;
      const nextStrength = strength || "weak";
      const cur = families.get(family) || { family, count: 0, strength: nextStrength, directions: new Set() };
      cur.count++;
      if (STRENGTH_WEIGHT[nextStrength] > STRENGTH_WEIGHT[cur.strength]) cur.strength = nextStrength;
      if (direction) cur.directions.add(direction);
      families.set(family, cur);
    };
    if (graph && Array.isArray(graph.edges)) {
      for (const edge of graph.edges) {
        if (edge.source !== node.id && edge.target !== node.id) continue;
        const direction = edge.source === node.id ? "source" : "target";
        for (const it of edge.interactions || []) addFamily(it.family, it.strength, it.direction);
        for (const ev of edge.events || []) addFamily(ev, "weak", direction);
      }
    }
    const ranked = [...families.values()]
      .map(x => ({ family: x.family, count: x.count, strength: x.strength, directions: [...x.directions].sort() }))
      .sort((a, b) => (STRENGTH_WEIGHT[b.strength] - STRENGTH_WEIGHT[a.strength]) || b.count - a.count || a.family.localeCompare(b.family));
    const produced = Object.keys(node.produces || {}).sort();
    const consumed = Object.keys(node.consumes || {}).sort();
    const caps = (node.caps || []).slice().sort();
    let primary = ranked[0];
    if (!primary) {
      if (caps.includes("is-ramp")) {
        primary = { family: "ramp", count: 0, strength: "weak", directions: [] };
      } else if (caps.includes("is-body")) {
        primary = { family: "body", count: 0, strength: "weak", directions: [] };
      } else {
        primary = { family: node.role || "utility", count: 0, strength: "weak", directions: [] };
      }
    }

    let surface = "utility";
    if (produced.length && consumed.length) {
      surface = "bridge";
    } else if (produced.length) {
      surface = "producer";
    } else if (consumed.length) {
      surface = "consumer";
    } else if (ranked.length) {
      surface = "linked";
    }
    const flags = [];
    if (!ranked.length && (produced.length || consumed.length || caps.length)) flags.push("unlinked-signals");
    if (ranked.some(x => x.count >= 12 && STRENGTH_WEIGHT[x.strength] <= STRENGTH_WEIGHT.weak)) flags.push("generic-hub");
    if (caps.includes("is-cost-reducer") && ranked.some(x => x.family === "cost-reduction→ability" && x.count >= 8)) flags.push("cost-reducer-fanout");
    return {
      id: node.id,
      role: node.role || "utility",
      surface,
      primary,
      secondary: ranked.slice(1, 6),
      produced,
      consumed,
      caps,
      flags,
      confidence: ranked.length ? Math.min(1, +(0.35 + ranked.length / 20 + (STRENGTH_WEIGHT[primary.strength] || 0) / 2).toFixed(2)) : 0.2,
    };
  }

  // Back-compat projection: the old string-array edge shape. Renderer + metrics
  // still consume edge.events; we derive it from the rich interactions so those
  // consumers keep working unchanged during/after migration.
  function eventsFromInteractions(list) {
    const s = new Set();
    for (const it of list) s.add(it.event || it.family);
    return [...s];
  }

  // all interaction events between two classified cards (both directions) — STRING form
  function sharedEvents(a, b) {
    return eventsFromInteractions(interactionsBetween(a, b));
  }

  const EVENT_LABEL = {};
  EVENTS.forEach(e => EVENT_LABEL[e.id] = e.label);
  EVENT_LABEL.tribal = "tribal (creature-type synergy)";
  EVENT_LABEL["enable:untap→tap-ability"] = "untap → re-use tap ability (combo)";
  EVENT_LABEL["enable:etb→blink"] = "blink → re-trigger ETB";
  EVENT_LABEL["enable:blink→land-untap-etb"] = "repeatable blink → land-untap ETB loop";
  EVENT_LABEL["enable:cost-reduction→ability"] = "cost reduction → activated ability";
  EVENT_LABEL["enable:copy→trigger"] = "copy → re-trigger";
  EVENT_LABEL["enable:etb-doubler"] = "ETB doubler → ETB trigger";
  EVENT_LABEL["enable:vehicle→payoff"] = "Vehicle → Vehicle payoff";
  EVENT_LABEL["enable:land-recursion→landfall"] = "land recursion → landfall";
  EVENT_LABEL["enable:death→drain"] = "death → drain payoff (aristocrats)";
  EVENT_LABEL["enable:death→draw"] = "death → draw payoff";
  EVENT_LABEL["enable:death→tokens"] = "death → token payoff";
  EVENT_LABEL["enable:go-wide→payoff"] = "tokens → go-wide payoff";
  EVENT_LABEL["enable:convoke-fodder→payoff"] = "creature tokens → convoke payoff";
  EVENT_LABEL["enable:convoke-spell→payoff"] = "convoke spell → cast payoff";
  EVENT_LABEL["enable:lifegain-source→drain-payoff"] = "lifegain source → drain payoff";
  EVENT_LABEL["enable:token-production→amplifier"] = "token production → token amplifier";
  EVENT_LABEL["enable:token-production→replacement"] = "token production → token replacement";
  EVENT_LABEL["enable:proliferate→counters"] = "proliferate → counters";
  EVENT_LABEL["enable:counter-multiplier"] = "counter doubler → counters";
  EVENT_LABEL["enable:enchantress"] = "enchantment → enchantress payoff";
  EVENT_LABEL["enable:magecraft"] = "spell → magecraft payoff";
  EVENT_LABEL["enable:mill→graveyard-payoff"] = "mill → graveyard-size payoff";
  EVENT_LABEL["enable:graveyard-fuel→recursion"] = "graveyard fuel → recursion";
  EVENT_LABEL["enable:tribal-count→payoff"] = "creatures → type-count payoff";
  EVENT_LABEL["enable:combat→payoff"] = "attackers → combat-trigger payoff";
  EVENT_LABEL["enable:combat-enabler"] = "evasion/extra-combat → combat payoff";
  EVENT_LABEL["enable:goad→punisher"] = "goad → punish forced attackers (political)";
  EVENT_LABEL["enable:exiled-card-access"] = "exiled card access";
  EVENT_LABEL["enable:library-exile→empty-library-win"] = "library exile → empty-library win";
  EVENT_LABEL["enable:lifeloss→lifegain-loop"] = "life loss → life gain loop";
  EVENT_LABEL["enable:lifegain→lifeloss-loop"] = "life gain → life loss loop";
  EVENT_LABEL["enable:mill-lifeloss-feedback-loop"] = "mill ↔ life loss loop";
  EVENT_LABEL["enable:opponent-draw-punisher-win"] = "opponent mass draw → punisher win";
  EVENT_LABEL["enable:opponent-draw→punisher"] = "opponent draw → punisher";
  EVENT_LABEL["enable:mill-multiplier-finite-mill"] = "mill multiplier → finite mill";
  EVENT_LABEL["enable:delayed-mill-equalizer-finite-mill"] = "same-turn mill equalizer → finite mill";
  EVENT_LABEL["enable:mutual-etb-blink-reset-loop"] = "mutual ETB blink reset loop";
  EVENT_LABEL["enable:self-untap-mana-loop"] = "self-untap mana loop";
  EVENT_LABEL["enable:lifelink-counter-damage-loop"] = "lifelink counter-damage loop";
  EVENT_LABEL["enable:token-replacement-sacrifice-mana-loop"] = "token replacement → sacrifice/death-mana loop";
  EVENT_LABEL["enable:imprint-untap-spell-loop"] = "repeatable imprinted untap spell loop";
  EVENT_LABEL["enable:tap-free-cast→untap-engine"] = "tap/free-cast engine reset";
  EVENT_LABEL["enable:spell-count→spell-copy-engine"] = "spell-count → spell-copy engine";
  EVENT_LABEL["enable:spell-copy-engine→cantrip-untap-loop"] = "spell-copy cantrip untap loop";
  EVENT_LABEL["enable:spell-copy-engine→untap-reset"] = "spell-copy engine reset";
  EVENT_LABEL["enable:self-untap-mana→ability-copy-loop"] = "self-untap mana ability copy loop";
  EVENT_LABEL["enable:hasty-copy→etb-untap-loop"] = "hasty copy → ETB untap loop";
  EVENT_LABEL["enable:combat-copy-token→extra-combat-loop"] = "combat copy token → extra combat loop";
  EVENT_LABEL["enable:combat-sacrifice-aura→extra-combat-loop"] = "combat-sacrifice Aura → extra combat loop";
  EVENT_LABEL["enable:combat-resource→extra-combat-loop"] = "combat resource trigger → extra combat loop";
  EVENT_LABEL["enable:artifact-token→extra-turn-loop"] = "turn-cycle artifact tokens → extra turn loop";
  EVENT_LABEL["enable:spell-copy-etb→creature-copy-spell-loop"] = "ETB spell copy → creature-copy spell loop";
  EVENT_LABEL["enable:death-copy-spell-etb-copy-loop"] = "ETB spell copy → death-copy creature spell loop";
  EVENT_LABEL["enable:self-copy-spell→magecraft-drain-loop"] = "self-copying spell → magecraft drain loop";
  EVENT_LABEL["enable:escape-mill-mana-loop"] = "escape mill fuel → mana/cast loop";
  EVENT_LABEL["enable:life-paid-damage-lifeloss-recovery-loop"] = "life-paid damage → opponent-loss lifegain recovery";
  EVENT_LABEL["enable:exile-recast-creature-mana-loop"] = "exile creature for creature-cast mana → exile recast loop";
  EVENT_LABEL["enable:counter-token→etb-counter-loop"] = "+1/+1 counter token engine → creature-ETB counter loop";
  EVENT_LABEL["enable:minus-counter-death→token-loop"] = "-1/-1 counter death spreader → 1/1 token loop";
  EVENT_LABEL["enable:artifact-cost-reduction→top-loop-piece"] = "artifact cost reduction → top-loop piece";
  EVENT_LABEL["enable:cast-from-top→top-loop-piece"] = "cast from top → top-loop piece";
  EVENT_LABEL["enable:draw-damage-feedback-loop"] = "draw → damage feedback loop";
  EVENT_LABEL["enable:recursive-body-sacrifice-mana-loop"] = "recursive body → mana sacrifice loop";
  EVENT_LABEL["artifact-top-cost-reduction-loop"] = "artifact top + cost reduction loop";
  EVENT_LABEL["draw-damage-feedback-loop"] = "draw/damage feedback loop";
  EVENT_LABEL["recursive-body-sacrifice-mana-loop"] = "recursive body sacrifice mana loop";
  EVENT_LABEL["lifelink-counter-damage-loop"] = "lifelink counter-damage loop";
  EVENT_LABEL["opponent-draw→punisher"] = "opponent draw → punisher";
  EVENT_LABEL["lifegain-source→drain-payoff"] = "lifegain source → drain payoff";
  EVENT_LABEL["copy→trigger"] = "copy → trigger";
  EVENT_LABEL["blink→land-untap-etb"] = "repeatable blink → land-untap ETB loop";
  EVENT_LABEL["lord→tribe"] = "tribal (creature-type synergy)";
  EVENT_LABEL["tribal-payoff→tribe"] = "tribal payoff → matching creature";
  EVENT_LABEL["exiled-card-access"] = "exiled card access";
  EVENT_LABEL["ramp→sink"] = "ramp ↔ mana sink";

  // strength → numeric weight for weighted cohesion
  const STRENGTH_WEIGHT = { weak: 0.25, moderate: 0.6, strong: 1.0, "combo-critical": 1.5 };

  const API = { EVENTS, ZONE_RULES, ZONES, EVENT_LABEL, STRENGTH_WEIGHT,
    ONTOLOGY, ENABLEMENT,
    classify, roleOf, isLandType, sharedEvents, interactionsBetween, eventsFromInteractions,
    subjectsOverlap, interactionProfile, semanticIR, typedPredicateForCap,
    faceCompatibleCaps, etbBlinkTargetCaps, canEtbBlinkTarget, recursiveBodyPreconditionSatisfiedByPair };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.INTERACTION_MODEL = API;
})(typeof window !== "undefined" ? window : globalThis);
