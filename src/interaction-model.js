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
  function capsOf(segments, classified, isLand) {
    const caps = new Set();
    // Lands tap for mana and some untap lands; counting them as combo pieces
    // makes every basic + fetchland a "combo" node. Exclude lands entirely from
    // the tap/untap/mana enablement families.
    for (const s of segments) {
      const e = s.effect, c = s.cost;
      const effectAndRaw = e + " " + s.raw;
      const effectAndTrigger = e + " " + s.trigger;
      const triggerAndEffect = s.trigger + " " + e;
      if (!isLand) {
        // taps for mana: an activated ability that taps and adds mana. Tag the
        // PERMANENT TYPE that taps, so an untapper only combos with it if the
        // untapper can actually untap that type (untapping lands ≠ re-using a rock).
        if (s.kind === "activated" && /\{t\}|\{q\}/.test(c) && /\badd \{|\badd (one|two|three|x|an amount)/.test(e)) {
          caps.add("taps-for-mana");
          const mt = classified._type || "";
          if (/creature/.test(mt)) caps.add("mana-from-creature");
          else if (/artifact/.test(mt)) caps.add("mana-from-artifact");
          // (lands are excluded from caps entirely; other types are rare)
        }
        // a repeatable activated ability worth untapping for (has {T} in cost)
        if (s.kind === "activated" && /\{t\}/.test(c)) caps.add("has-tap-ability");
        if (s.kind === "activated" && !/\badd \{|\badd (one|two|three|x|an amount)/.test(e))
          caps.add("has-nonmana-activated-ability");
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
      }
      // ETB: a trigger that fires when this permanent enters
      if (s.kind === "triggered" || s.kind === "etb") caps.add("has-trigger");
      if (s.kind === "etb" && /\bthis\b|^when [a-z]+ enters|enters the battlefield/.test(s.trigger)) caps.add("has-etb");
      // blink/flicker: exile then return to the battlefield
      if (/exile .* return (it|them|that card|those cards|the exiled)/.test(e) && /battlefield/.test(e)) caps.add("is-blink");
      // sac outlet: an activated ability whose COST sacrifices a creature/permanent
      if (s.kind === "activated" && /sacrifice (a|an|another|two|three|x|that) (creature|permanent|artifact|token)/.test(c)) {
        caps.add("is-sac-outlet");
        if (/sacrifice (a|an|another|two|three|x|that) creature/.test(c)) caps.add("is-creature-sac-outlet");
        if (/sacrifice (a|an|another|two|three|x|that) (artifact|token)/.test(c)) caps.add("is-artifact-sac-outlet");
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
      // copy effects. Split generic copy text from permanent-copy scope so
      // spell-copy/self-copy does not trigger arbitrary ETB cards.
      if (/copy (target|that)/.test(e) || /create a token that.?s a copy/.test(e) || /token that.?s a copy/.test(e) || /copy it/.test(e)) {
        caps.add("is-copy");
        if (/copy target (creature|permanent)|copy of (up to one )?(other )?target|copy of target creature|copy of (a|another) creature|copy of a permanent/.test(e))
          caps.add("is-permanent-copy");
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
    // sac fodder / blink target: real creatures and produced creature tokens
    // are bodies; noncreature tokens such as Treasure are not attackers/deaths.
    if (!isLand && (caps.has("is-creature-token-producer") || /creature/.test((classified._type || "")))) caps.add("is-body");
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
    };
    // pipeline layers: segment → capability tags (used by interactionsBetween)
    result.segments = segmentOracle(card.oracle_text);
    result.caps = capsOf(result.segments, result, isLand);
    return result;
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
  ];
  const hasCap = (node, cap) => (node.caps || []).includes(cap);

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

    // 3) ramp ↔ sink: near-universal in EDH (most decks ramp into a payoff), so
    // keep it weak — it's a real link but not what makes a deck cohesive.
    for (const it of out) if (it.event === "mana") { it.kind = "synergy"; it.family = "ramp→sink"; it.strength = "weak"; }

    // 4) enablement families (directed, capability-based)
    for (const f of ENABLEMENT) {
      for (const [src, dst, dir] of [[a, b, "A→B"], [b, a, "B→A"]]) {
        if (hasCap(src, f.from) && hasCap(dst, f.to)) {
          let strength = f.strength;
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
          out.push({ kind: f.kind, family: f.family, event: "enable:" + f.family, direction: dir,
            strength, loops: false, evidence: { from: f.from, to: f.to } });
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
  EVENT_LABEL["copy→trigger"] = "copy → trigger";
  EVENT_LABEL["lord→tribe"] = "tribal (creature-type synergy)";
  EVENT_LABEL["ramp→sink"] = "ramp ↔ mana sink";

  // strength → numeric weight for weighted cohesion
  const STRENGTH_WEIGHT = { weak: 0.25, moderate: 0.6, strong: 1.0, "combo-critical": 1.5 };

  const API = { EVENTS, ZONE_RULES, ZONES, EVENT_LABEL, STRENGTH_WEIGHT,
    classify, roleOf, isLandType, sharedEvents, interactionsBetween, eventsFromInteractions, subjectsOverlap, interactionProfile };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.INTERACTION_MODEL = API;
})(typeof window !== "undefined" ? window : globalThis);
