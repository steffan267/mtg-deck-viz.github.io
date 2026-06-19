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

    { id: "graveyard", label: "graveyard (fill ↔ use)",
      // Largely about your own yard; reanimation reaches "a graveyard" (any).
      produce: [
        { re: /put .* into (your|a) graveyard/, s: A },
        { re: /into (your|a) graveyard/, s: A },
        { re: /\bmills?\b/, s: A },
        { re: /\bsurveil\b/, s: Y },
        { re: /when(ever)? .* dies/, s: A },               // a death feeds the graveyard
      ],
      consume: [
        { re: /from (your|a|their) graveyard/, s: A },
        { re: /return .* graveyard/, s: A },
        { re: /cast .* from your graveyard/, s: A },
        { re: /creature card (in|from) (a|your|their) graveyard/, s: A },
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
        { re: /whenever a permanent .* is (destroyed|put into a graveyard)/, s: A },
        { re: /can't be destroyed/, s: A },
        { re: /\bindestructible\b/, s: A },
        { re: /if .* would be destroyed, regenerate/, s: A },
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
        { re: /\benchant (creature|permanent|player)/, s: Y },
        { re: /for mirrodin!/, s: Y },
      ],
      consume: [
        { re: /whenever .* becomes attached/, s: Y },
        { re: /whenever .* becomes equipped/, s: Y },
        { re: /whenever an aura .* is attached/, s: Y },
        { re: /equipped creature/, s: Y },
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
        { re: /\bconvoke\b/, s: Y },                        // creatures help pay = mana engine
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
        { re: /\bconvoke\b/, s: Y },
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
      [/trigger|etb/, a => a.kind === "triggered" || a.kind === "etb"],
      [/tap|activated|mana-produced|mana-from|self-untap|ability-copy/, a => a.kind === "activated"],
      [/untap/, a => /\buntap\b/.test(a.effect + " " + a.cost)],
      [/blink/, a => /\bexile\b/.test(a.effect) && /\breturn\b/.test(a.effect) && /\bbattlefield\b/.test(a.effect)],
      [/cost-reducer|cost-reduction|spell-cost/, a => /cost.*less|activated abilities|spells?.*cost/.test(a.effect)],
      [/token/, a => /\btoken/.test(a.effect + " " + a.trigger)],
      [/counter|proliferate/, a => /\bcounter|proliferate/.test(a.effect + " " + a.trigger)],
    ];
    const matched = abilities.filter(ability => checks.some(([re, fn]) => re.test(predicate) && fn(ability)));
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
  // families (untap→tap, etb→blink, sac-fodder→outlet, …). Kept deliberately
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
      } else if (sym !== "x") {
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

  function producedManaProfile(text) {
    const s = String(text || "").toLowerCase();
    const profile = { total: maxManaProduced(s), any: 0, colorless: 0, colors: Object.fromEntries(MANA_COLORS.map(color => [color, 0])) };
    if (/\badd\b.{0,40}\bmana of any (one )?color\b/.test(s)) profile.any = Math.max(profile.any, profile.total || 1);
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

  function addManaCostCaps(caps, prefix, profile) {
    caps.add(prefix + "-cost:" + profile.total);
    caps.add(prefix + "-generic-cost:" + profile.generic);
    caps.add(prefix + "-colorless-cost:" + profile.colorless);
    for (const color of MANA_COLORS) if (profile.colors[color]) caps.add(prefix + "-color-" + color + ":" + profile.colors[color]);
  }

  function addProducedManaCaps(caps, prefix, profile) {
    caps.add(prefix + "-mana-produced:" + Math.max(1, profile.total));
    if (profile.any) caps.add(prefix + "-mana-any:" + profile.any);
    if (profile.colorless) caps.add(prefix + "-mana-c:" + profile.colorless);
    for (const color of MANA_COLORS) if (profile.colors[color]) caps.add(prefix + "-mana-" + color + ":" + profile.colors[color]);
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

  function capsOf(segments, classified, isLand) {
    const caps = new Set();
    const allText = segments.map(s => s.raw).join(" ");
    const hasCheapInstantImprint = /\bexile an? instant card\b.{0,80}\bmana value 2 or less\b/.test(allText);
    const typeText = classified._type || "";
    const cmc = Number.isFinite(classified._cmc) ? classified._cmc : null;
    // Lands tap for mana and some untap lands; counting them as combo pieces
    // makes every basic + fetchland a "combo" node. Exclude lands entirely from
    // the tap/untap/mana enablement families.
    for (const s of segments) {
      const e = s.effect, c = s.cost;
      const effectAndRaw = e + " " + s.raw;
      const effectAndTrigger = e + " " + s.trigger;
      const triggerAndEffect = s.trigger + " " + e;
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
            && /remove a \+1\/\+1 counter from (this|it|this creature)/.test(c)
            && /\bdeals? \d+ damage to (any target|target|target player|each opponent|an opponent)/.test(e)) {
          caps.add("is-counter-to-damage-source");
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
        if (/\binstant\b/.test(typeText) && (cmc == null || cmc <= 2) && /untap all nonland permanents you control/.test(e))
          caps.add("is-cheap-instant-nonland-permanent-untap-spell");
        if (s.kind === "activated" && /\buntap (this|it|this artifact|this creature|this permanent)/.test(e)) {
          caps.add("is-self-untapper");
          caps.add("self-untap-cost:" + manaCostValue(c));
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
      // blink/flicker: exile then return to the battlefield
      if (/exile .* return (it|them|that card|those cards|the exiled)/.test(e) && /battlefield/.test(e)) caps.add("is-blink");
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
        if (/\badd \{|\badd (one|two|three|x|an amount)/.test(e)) {
          caps.add("is-mana-sac-outlet");
          addProducedManaCaps(caps, "sac-outlet", producedManaProfile(e));
        }
      }
      // cost reducer (Round-3 gate): only a reducer of ACTIVATED ABILITIES is
      // relevant to the cost-reduction→ability family. Scope-specific reducers
      // (creatures, Foods, etc.) must not fan out to all tap abilities.
      if (/activated abilities (of |that )?foods?.{0,30}cost \{?\d* ?[^ ]* ?less|activated abilities of foods/.test(e))
        caps.add("is-food-ability-cost-reducer");
      else if (/activated abilities (of |that )?creatures?.{0,30}cost \{?\d* ?[^ ]* ?less|activated abilities of creatures/.test(e))
        caps.add("is-creature-ability-cost-reducer");
      else if (/activated abilities (of |that |you )?.{0,30}cost \{?\d* ?[^ ]* ?less|abilities (you activate )?.{0,60}cost \{?\d* ?[^ ]* ?less/.test(e))
        caps.add("is-cost-reducer");
      else if (/(spells?|creature spells?) .* cost \{?\d* ?[^ ]* ?less|costs? \{\d+\} less to cast/.test(e))
        caps.add("is-spell-cost-reducer");
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
        if (/copy target (creature|permanent)|copy of (up to one )?(other )?target|copy of target creature|copy of (a|another) creature|copy of a permanent/.test(e))
          caps.add("is-permanent-copy");
      }
      if (s.kind === "activated" && /create .*token that.?s a copy of target .*creature/.test(e) && /haste/.test(e)) {
        caps.add("is-repeatable-hasty-creature-copy");
        caps.add("hasty-copy-target-creature");
        if (/target nonlegendary creature/.test(e)) caps.add("hasty-copy-target-requires-nonlegendary");
      }
      if (/\bwhen\b.*enters\b.*copy target instant or sorcery spell/.test(s.raw))
        caps.add("is-etb-spell-copier");
      if (/target creatures? you control.*create .*tokens?.*copy of (that|those|it|them|the targeted|target) creatures?/.test(e) && /haste/.test(e)) {
        caps.add("is-hasty-creature-copy-spell");
        caps.add("hasty-copy-spell-target-creature");
        if (/target nonlegendary creatures?/.test(e)) caps.add("hasty-copy-spell-target-requires-nonlegendary");
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
      if (/whenever you gain life/.test(s.trigger) && /put (a|\d+) \+1\/\+1 counters? on target (creature|creature or enchantment)/.test(e))
        caps.add("is-lifegain-to-counter-payoff");
      if (s.kind === "triggered"
          && /\bwhenever (you|a player|an opponent) draws?\b/.test(s.trigger)
          && /\bdeals? (that much|\d+|x)? ?damage\b|\bdeals? damage equal\b/.test(e)) {
        caps.add("is-draw-to-damage-payoff");
        if (/\bwhenever you draws?\b/.test(s.trigger)) caps.add("draw-to-damage-subject:you");
        else if (/\bwhenever a player draws?\b/.test(s.trigger)) caps.add("draw-to-damage-subject:each");
        else if (/\bwhenever an opponent draws?\b/.test(s.trigger)) caps.add("draw-to-damage-subject:opp");
      }
      if (s.kind === "triggered"
          && /\bdeals? (combat )?damage to (a player|an opponent|one of your opponents|that player|any target)\b/.test(s.trigger)
          && /draw (a card|two cards|three cards|that many cards?)/.test(e))
        caps.add("is-damage-to-draw-payoff");
      if (s.kind === "triggered"
          && /\bwhenever (an opponent|a player) draws?\b/.test(s.trigger)
          && /(loses? \d+ life|deals? \d+ damage|loses? that much life|deals? that much damage)/.test(e)) {
        caps.add("is-opponent-draw-punisher");
        if (/loses? \d+ life|deals? \d+ damage/.test(e)) {
          const amount = e.match(/(?:loses?|deals?) (\d+)/);
          if (amount) caps.add("opponent-draw-punisher-damage:" + amount[1]);
        }
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
      if (/\bcreature\b/.test(typeText)
          && /\byou may cast this card from your graveyard\b|\bcast this card from your graveyard\b/.test(effectAndRaw)) {
        caps.add("is-recursive-body");
        caps.add("is-recursive-cast-body");
        if (/\b(as long as|if) you control another creature\b/.test(effectAndRaw))
          caps.add("recursive-body-requires-another-creature");
        addManaCostCaps(caps, "recursive-body", manaCostProfile(classified._manaCost, Math.max(0, cmc == null ? 0 : cmc)));
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
      }
      if (/if one or more tokens? would be created under your control|if .* would create .* tokens?.* instead|tokens? plus .* token .* created instead|twice that many tokens|double .* tokens/.test(e))
        caps.add("is-token-doubler");
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
      if (/\blandfall\b|whenever a land (you control )?enters/.test(triggerAndEffect))
        caps.add("is-landfall-payoff");

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
      if (/\+1\/\+1 counter|loyalty counter|charge counter|\bpoison\b|counter on|\bfabricate \d+/.test(e) && !/proliferate/.test(e))
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
      // MILL as engine: opponent-mill source + graveyard-size payoff
      if (/(target (player|opponent)|each opponent|that player) (mills?|puts? the top)/.test(e) || /\bmills? (a|an|\d+|that many)/.test(e))
        caps.add("is-mill-source");
      if (/if (an|a) opponent would mill|if .* would mill one or more cards?.*mill twice that many|mills? twice that many cards? instead/.test(effectAndRaw))
        caps.add("is-mill-multiplier");
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
  // 100-precon audit: families that fire in most decks (sac-fodder, ramp→sink)
  // are WEAK so they don't inflate cohesion; only genuinely deck-defining,
  // directed enablement (blink→etb, free-untap loops) earns strong/combo.
  const ENABLEMENT = [
    // untap→tap-ability: only meaningful when the untap is FREE (gated below to
    // is-free-untapper). A costed untapper just trades mana.
    { family: "untap→tap-ability", from: "is-free-untapper", to: "has-tap-ability", kind: "enablement", strength: "strong",
      manaLoop: "taps-for-mana" },     // free untap re-tapping a MANA ability = combo-critical
    { family: "etb→blink",         from: "is-blink",    to: "has-etb",          kind: "enablement", strength: "strong" },
    { family: "sac-fodder→outlet", from: "is-body",     to: "is-sac-outlet",    kind: "enablement", strength: "weak" },
    { family: "cost-reduction→ability", from: "is-creature-ability-cost-reducer", to: "has-creature-activated-ability", kind: "enablement", strength: "weak" },
    { family: "cost-reduction→ability", from: "is-cost-reducer", to: "has-nonmana-activated-ability", kind: "enablement", strength: "weak" },
    { family: "copy→trigger",      from: "is-permanent-copy", to: "has-etb",     kind: "synergy",     strength: "moderate" },
    { family: "etb-doubler",       from: "is-etb-doubler", to: "has-etb",       kind: "synergy",     strength: "strong" },
    { family: "token-production→amplifier", from: "is-token-producer", to: "is-token-doubler", kind: "synergy", strength: "strong" },
    { family: "vehicle→payoff",    from: "is-vehicle", to: "is-vehicle-payoff", kind: "synergy",     strength: "moderate" },
    { family: "land-recursion→landfall", from: "is-land-recursion", to: "is-landfall-payoff", kind: "synergy", strength: "moderate" },
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
    // counters: proliferate / multipliers amplify any counter source
    { family: "proliferate→counters", from: "is-proliferator",     to: "has-counters", kind: "synergy", strength: "moderate" },
    { family: "counter-multiplier",   from: "is-counter-multiplier", to: "has-counters", kind: "synergy", strength: "strong" },
    // --- Round-3 new engines (rescue the too-low monothematic decks) ---
    { family: "enchantress",       from: "is-enchantment",      to: "is-enchantress-payoff", kind: "synergy", strength: "strong" },
    { family: "magecraft",         from: "is-noncreature-spell", to: "is-spellcast-payoff",  kind: "synergy", strength: "moderate" },
    { family: "mill→graveyard-payoff", from: "is-mill-source",  to: "is-graveyard-size-payoff", kind: "synergy", strength: "moderate" },
    { family: "tribal-count→payoff",   from: "is-body",          to: "is-typecount-payoff",  kind: "synergy", strength: "moderate" },
    // --- Round-4: the combat axis (biggest missing payoff class) ---
    // attackers feed a combat-trigger payoff — WEAK: "I have creatures + an
    // attack-trigger card" is near-universal, so the bare body→payoff link is
    // incidental (audit clique-fanout warning). The real synergy is a combat
    // ENABLER (evasion/double-strike/extra-combat) amplifying the payoff: strong.
    { family: "combat→payoff",     from: "is-creature-token-producer", to: "is-combat-payoff",    kind: "synergy", strength: "weak" },
    { family: "combat-enabler",    from: "is-combat-enabler", to: "is-combat-payoff",    kind: "synergy", strength: "strong" },
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
    { family: "mutual-etb-blink-reset-loop", from: "is-etb-blink", to: "is-etb-blink", kind: "enablement", strength: "combo-critical" },
    { family: "self-untap-mana-loop", from: "is-colorless-mana-amplifier", to: "is-self-untapper", kind: "enablement", strength: "combo-critical" },
    { family: "lifelink-counter-damage-loop", from: "is-lifelink-counter-engine", to: "is-counter-to-damage-source", kind: "enablement", strength: "combo-critical" },
    { family: "token-replacement-sacrifice-mana-loop", from: "is-token-to-creature-token-replacer", to: "is-death-mana-payoff", kind: "enablement", strength: "combo-critical" },
    { family: "imprint-untap-spell-loop", from: "is-cheap-instant-nonland-permanent-untap-spell", to: "is-repeatable-cheap-instant-caster", kind: "enablement", strength: "combo-critical" },
    { family: "self-untap-mana→ability-copy-loop", from: "is-activated-ability-copier", to: "is-self-untapper", kind: "enablement", strength: "combo-critical" },
    { family: "hasty-copy→etb-untap-loop", from: "is-repeatable-hasty-creature-copy", to: "etb-untaps-permanent", kind: "enablement", strength: "combo-critical" },
    { family: "spell-copy-etb→creature-copy-spell-loop", from: "is-etb-spell-copier", to: "is-hasty-creature-copy-spell", kind: "enablement", strength: "combo-critical" },
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
  const canHastyCopyTarget = (copier, target, extraTargetCaps = []) => {
    if (!hasCap(copier, "hasty-copy-target-creature")) return false;
    const targetCaps = ["is-creature-permanent", ...extraTargetCaps];
    if (hasCap(copier, "hasty-copy-target-requires-nonlegendary")) targetCaps.push("is-nonlegendary-permanent");
    if (!faceCompatibleCaps(target, targetCaps)) return false;
    if (!target?.faceFacts?.length && !isCreaturePermanent(target)) return false;
    if (!target?.faceFacts?.length && hasCap(copier, "hasty-copy-target-requires-nonlegendary") && isLegendaryPermanent(target)) return false;
    return true;
  };
  const canHastyCopySpellTarget = (copySpell, target, extraTargetCaps = []) => {
    if (!hasCap(copySpell, "hasty-copy-spell-target-creature")) return false;
    const targetCaps = ["is-creature-permanent", ...extraTargetCaps];
    if (hasCap(copySpell, "hasty-copy-spell-target-requires-nonlegendary")) targetCaps.push("is-nonlegendary-permanent");
    if (!faceCompatibleCaps(target, targetCaps)) return false;
    if (!target?.faceFacts?.length && !isCreaturePermanent(target)) return false;
    if (!target?.faceFacts?.length && hasCap(copySpell, "hasty-copy-spell-target-requires-nonlegendary") && isLegendaryPermanent(target)) return false;
    return true;
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
    const aLord = hasCap(a, "is-lord"), bLord = hasCap(b, "is-lord");
    const typedTribal = (hasCap(a, "is-typed-lord") && tribalMatch(a.tribalRefs.filter(r => r !== "creature"), b.myTypes))
      || (hasCap(b, "is-typed-lord") && tribalMatch(b.tribalRefs.filter(r => r !== "creature"), a.myTypes));
    if ((aLord && tribalMatch(a.tribalRefs, b.myTypes)) || (bLord && tribalMatch(b.tribalRefs, a.myTypes)))
      out.push({ kind: "synergy", family: "lord→tribe", event: "tribal", direction: "both",
        strength: typedTribal ? "moderate" : "weak", loops: false, evidence: { tribal: true, typed: typedTribal } });
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
  EVENT_LABEL["enable:sac-fodder→outlet"] = "sac fodder → sacrifice outlet";
  EVENT_LABEL["enable:cost-reduction→ability"] = "cost reduction → activated ability";
  EVENT_LABEL["enable:copy→trigger"] = "copy → re-trigger";
  EVENT_LABEL["enable:etb-doubler"] = "ETB doubler → ETB trigger";
  EVENT_LABEL["enable:vehicle→payoff"] = "Vehicle → Vehicle payoff";
  EVENT_LABEL["enable:land-recursion→landfall"] = "land recursion → landfall";
  EVENT_LABEL["enable:death→drain"] = "death → drain payoff (aristocrats)";
  EVENT_LABEL["enable:death→draw"] = "death → draw payoff";
  EVENT_LABEL["enable:death→tokens"] = "death → token payoff";
  EVENT_LABEL["enable:go-wide→payoff"] = "tokens → go-wide payoff";
  EVENT_LABEL["enable:token-production→amplifier"] = "token production → token amplifier";
  EVENT_LABEL["enable:proliferate→counters"] = "proliferate → counters";
  EVENT_LABEL["enable:counter-multiplier"] = "counter doubler → counters";
  EVENT_LABEL["enable:enchantress"] = "enchantment → enchantress payoff";
  EVENT_LABEL["enable:magecraft"] = "spell → magecraft payoff";
  EVENT_LABEL["enable:mill→graveyard-payoff"] = "mill → graveyard-size payoff";
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
  EVENT_LABEL["enable:mill-multiplier-finite-mill"] = "mill multiplier → finite mill";
  EVENT_LABEL["enable:mutual-etb-blink-reset-loop"] = "mutual ETB blink reset loop";
  EVENT_LABEL["enable:self-untap-mana-loop"] = "self-untap mana loop";
  EVENT_LABEL["enable:lifelink-counter-damage-loop"] = "lifelink counter-damage loop";
  EVENT_LABEL["enable:token-replacement-sacrifice-mana-loop"] = "token replacement → sacrifice/death-mana loop";
  EVENT_LABEL["enable:imprint-untap-spell-loop"] = "repeatable imprinted untap spell loop";
  EVENT_LABEL["enable:self-untap-mana→ability-copy-loop"] = "self-untap mana ability copy loop";
  EVENT_LABEL["enable:hasty-copy→etb-untap-loop"] = "hasty copy → ETB untap loop";
  EVENT_LABEL["enable:spell-copy-etb→creature-copy-spell-loop"] = "ETB spell copy → creature-copy spell loop";
  EVENT_LABEL["enable:artifact-cost-reduction→top-loop-piece"] = "artifact cost reduction → top-loop piece";
  EVENT_LABEL["enable:cast-from-top→top-loop-piece"] = "cast from top → top-loop piece";
  EVENT_LABEL["enable:draw-damage-feedback-loop"] = "draw → damage feedback loop";
  EVENT_LABEL["enable:recursive-body-sacrifice-mana-loop"] = "recursive body → mana sacrifice loop";
  EVENT_LABEL["artifact-top-cost-reduction-loop"] = "artifact top + cost reduction loop";
  EVENT_LABEL["draw-damage-feedback-loop"] = "draw/damage feedback loop";
  EVENT_LABEL["recursive-body-sacrifice-mana-loop"] = "recursive body sacrifice mana loop";
  EVENT_LABEL["lifelink-counter-damage-loop"] = "lifelink counter-damage loop";
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
