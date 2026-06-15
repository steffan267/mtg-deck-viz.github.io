/*
 * metrics.js — deck cohesion metrics from an interaction graph.
 *
 * Shared by the CLI and the browser so the numbers are computed identically.
 * Input: a graph {nodes, edges} where nodes have {role, degree, qty} and edges
 * are card-to-card interaction edges. Zone nodes (role "zone") and lands are
 * excluded from cohesion — we only score the deck's "spell engine".
 */
(function (root) {
  const STRENGTH_WEIGHT = { weak: 0.25, moderate: 0.6, strong: 1.0, "combo-critical": 1.5 };
  const clamp01 = x => Math.max(0, Math.min(1, x));
  const sat = (value, target) => clamp01(value / target);
  const round1 = value => +value.toFixed(1);

  // GAME CHANGERS — the official WotC "Commander Brackets" power list. This is
  // authoritative reference data (a versioned, curated list maintained by the
  // rules committee), NOT a heuristic guess: a card is a Game Changer iff WotC
  // says so. The bracket system keys off the COUNT of these in a deck
  // (0 = casual brackets 1-2, 1-3 = bracket 3 "upgraded", 4+ = bracket 4/cEDH),
  // so the count is both a strong win-tuning signal AND a fully human-auditable
  // attribute — we always surface the actual card names, never just the number.
  // Source: Commander Brackets Beta (transcribe verbatim; update when WotC does).
  const normalizeName = s => (s || "").toLowerCase().replace(/[‘’ʼ`']/g, "'").trim();
  const GAME_CHANGERS = new Set([
    // White
    "drannith magistrate", "enlightened tutor", "farewell", "humility",
    "serra's sanctum", "smothering tithe", "teferi's protection",
    // Blue
    "consecrated sphinx", "cyclonic rift", "force of will", "fierce guardianship",
    "gifts ungiven", "intuition", "mystical tutor", "narset, parter of veils",
    "rhystic study", "thassa's oracle",
    // Black
    "ad nauseam", "bolas's citadel", "braids, cabal minion", "demonic tutor",
    "imperial seal", "necropotence", "opposition agent", "orcish bowmasters",
    "tergrid, god of fright", "vampiric tutor",
    // Red
    "gamble", "jeska's will", "underworld breach",
    // Green
    "biorhythm", "crop rotation", "gaea's cradle", "natural order",
    "seedborn muse", "survival of the fittest", "worldly tutor",
    // Multicolor
    "aura shards", "coalition victory", "grand arbiter augustin iv", "notion thief",
    // Colorless
    "ancient tomb", "chrome mox", "field of the dead", "glacial chasm",
    "grim monolith", "lion's eye diamond", "mana vault", "mishra's workshop",
    "mox diamond", "panoptic mirror", "the one ring", "the tabernacle at pendrell vale",
  ].map(normalizeName));
  const isGameChanger = n => GAME_CHANGERS.has(normalizeName(n.id));

  // CARD POWER — a per-card standalone-strength weight (~0–4), the single-card
  // analogue of the deck-level self-sufficiency axis. It answers "how powerful
  // is THIS card on its own?" and is used by the graph layout to give powerful
  // cards more gravity/mass (so they pull toward the centre) independent of how
  // many synergy links they have. Reuses the same oracle-text heuristics as
  // selfSufficiency() so the two never tell different stories, then adds the two
  // authoritative power proxies: Game-Changer membership and EDHREC staple rank.
  function cardPower(n) {
    if (!n || n.role === "zone") return 0;
    const text = (n.text || "").toLowerCase();
    const has = re => re.test(text);
    let p = 0;
    // efficient answers (removal / counters / wipes / burn)
    if (has(/destroy target|exile target|counter target spell|return target .* to (its|their|your) owner.s hand|fight|deals? \d+ damage to (target|any target|each)|destroy all|exile all|each (player|opponent).* sacrifices/)) p += 1.0;
    // card advantage / velocity
    if (has(/draw (a|two|three|four|five|\d+|that many|x) cards?|investigate|create .*treasure|exile the top .* you may (play|cast)/)) p += 0.9;
    // tutors / consistency (non-land library search)
    if (has(/search your library for (a|an|up to|two|that)/) && !has(/basic land|forest|island|swamp|mountain|plains/)) p += 0.9;
    // resilience / protection / recursion
    if (has(/hexproof|indestructible|protection from|return .* from your graveyard|regenerate|\bward\b|can.t be countered|shroud/)) p += 0.7;
    // raw closing power (a card that just wins / drains the table)
    if (n.role === "finisher" || has(/you win the game|target player loses the game|each opponent loses|loses half (their|that player.s) life/)) p += 1.1;
    // mana acceleration (cheap producers are stronger)
    if ((n.produces && n.produces.mana) || (n.caps || []).includes("is-ramp")) p += (n.cmc == null ? 0 : n.cmc) <= 1 ? 0.7 : 0.4;
    // authoritative power proxies
    if (isGameChanger(n)) p += 1.4;                       // WotC says this card defines power level
    if (n.edh != null && n.edh <= 1500) p += 0.5;         // widely-played staple (popularity proxy)
    else if (n.edh != null && n.edh <= 4000) p += 0.2;
    return +Math.min(4, p).toFixed(2);
  }

  function edgeWeight(e) {
    if (e.interactions && e.interactions.length)
      return Math.max(...e.interactions.map(it => STRENGTH_WEIGHT[it.strength] || 0.25));
    return 0.5;  // legacy edges with no interaction metadata
  }

  // Detect combo/engine structure from enablement interactions. A directed
  // enablement edge that closes a cycle (A enables B and B enables A, etc.) is a
  // candidate loop; combo-critical strength marks a mana-positive untap loop.
  function detectCombos(real, edges) {
    const idset = new Set(real.map(n => n.id));
    const dir = {}; real.forEach(n => dir[n.id] = []);
    const comboPairs = [];
    for (const e of edges) {
      if (!idset.has(e.source) || !idset.has(e.target)) continue;
      for (const it of (e.interactions || [])) {
        if (it.kind !== "enablement") continue;
        // direction encoded as "A→B"/"B→A" relative to (source,target)
        const ab = it.direction === "B→A" ? [e.target, e.source] : [e.source, e.target];
        dir[ab[0]].push(ab[1]);
        if (it.strength === "combo-critical") comboPairs.push({ a: e.source, b: e.target, family: it.family });
      }
    }
    // 2-cycles (mutual enablement) = simplest real loop
    const loops = [];
    for (const u of Object.keys(dir)) for (const v of dir[u]) if (u < v && dir[v] && dir[v].includes(u)) loops.push([u, v]);
    return { loops, comboCriticalPairs: comboPairs };
  }

  // SELF-SUFFICIENCY: standalone (non-synergy) power, from oracle text + rank.
  // `real` = nonland card nodes (each has .text oracle, .cmc, .edh EDHREC rank).
  // Six signals, each saturated against a target count so a deck maxes out at a
  // realistic amount; combined with formula A (balanced density). Returns the
  // 0-100 score plus the per-signal raw values so the UI can explain the number.
  function selfSufficiency(real) {
    const N = real.length || 1;
    const txt = n => (n.text || "").toLowerCase();
    const has = (n, re) => re.test(txt(n));
    // efficient ANSWERS: targeted removal, counters, wipes, burn, bounce, fight
    const interaction = real.filter(n => has(n,
      /destroy target|exile target|counter target spell|return target .* to (its|their|your) owner.s hand|fight|deals? \d+ damage to (target|any target|each)|destroy all|exile all|each (player|opponent).* sacrifices/)).length;
    // CARD ADVANTAGE: draw, impulse, investigate, treasure, card-search
    const cardAdv = real.filter(n => has(n,
      /draw (a|two|three|four|five|\d+|that many|x) cards?|investigate|create .*treasure|exile the top .* you may (play|cast)/)).length;
    // MANA foundation: reuse the classifier's mana-producer signal
    const ramp = real.filter(n => n.produces && n.produces.mana).length;
    // CONSISTENCY: tutors (library search that isn't pure ramp/land-fetch)
    const tutors = real.filter(n => has(n, /search your library for (a|an|up to|two|that)/) && !has(n, /basic land|forest|island|swamp|mountain|plains/)).length;
    // RESILIENCE: protection / recursion / uncounterability
    const resilience = real.filter(n => has(n,
      /hexproof|indestructible|protection from|return .* from your graveyard|regenerate|\bward\b|can.t be countered|shroud/)).length;
    // CARD QUALITY: share of nonland cards that are widely-played staples
    // (EDHREC rank within the top tier). Popularity proxy — tiebreaker weight only.
    const ranks = real.map(n => n.edh).filter(x => x);
    const premium = ranks.filter(r => r <= 1500).length;
    const premiumShare = ranks.length ? premium / N : 0;

    const sat = (count, target) => Math.min(1, count / target);
    const score = Math.round(100 * (
      0.22 * sat(interaction, 12) +
      0.20 * sat(cardAdv, 14) +
      0.15 * sat(ramp, 12) +
      0.10 * sat(tutors, 6) +
      0.10 * sat(resilience, 8) +
      0.23 * premiumShare
    ));
    return {
      score,
      signals: {
        interaction, cardAdvantage: cardAdv, ramp, tutors, resilience,
        premiumStaples: premium, premiumShare: +(premiumShare * 100).toFixed(0),
      },
    };
  }

  // WIN TUNING: how directly the list is tuned to convert resources into wins.
  //
  // Cohesion and self-sufficiency are intentionally descriptive axes: a deck can
  // be fun/cohesive but slow, or full of good standalone cards but short on
  // closing power. This score asks a different deckbuilding question: does the
  // deck have the speed, consistency, velocity, answers, resilience, efficiency,
  // compact finishers and raw power cards that usually translate into wins?
  //
  // DESIGN: detection is HEURISTIC (oracle text + role + mana value), not a
  // curated name dictionary. Hardcoded card lists looked precise but degraded
  // invisibly — any card off the list scored zero — and were a maintenance
  // treadmill. The only curated list we keep is GAME_CHANGERS, which is not a
  // heuristic guess but authoritative WotC reference data. Every signal records
  // the specific cards that drove it (`cards`) so a human can audit the number
  // and the engine produces a plain-English "how this deck wins" summary.
  function winTuning(real, allNodes, combos) {
    const allCards = allNodes.filter(n => n.role !== "zone");
    const lands = allCards.filter(n => n.role === "land");
    const txt = n => (n.text || "").toLowerCase();
    const mv = n => n.cmc == null ? 0 : n.cmc;
    const hasCap = (n, cap) => (n.caps || []).includes(cap);
    const totalQty = allCards.reduce((sum, n) => sum + (n.qty || 1), 0);
    // "Free" spells — both the commander-tax pitch family ("…without paying its
    // mana cost") AND the alternative-cost pitch family ("…rather than pay this
    // spell's mana cost", e.g. Force of Will / Force of Negation / Misdirection).
    const freeCast = n => /without paying its mana cost|rather than pay (this spell.s |its )?mana cost/.test(txt(n));

    // Run a per-card weight function over a card pool, accumulating the raw total
    // and the list of contributing cards (descending by weight) so each signal is
    // card-grounded and auditable. Returns { raw, cards } where cards is sorted.
    function collect(pool, weightFn) {
      let raw = 0; const cards = [];
      for (const n of pool) {
        const w = weightFn(n);
        if (w > 0.001) { raw += w; cards.push({ id: n.id, w: round1(w) }); }
      }
      cards.sort((a, b) => b.w - a.w);
      return { raw, cards };
    }
    const topNames = (cards, k = 6) => cards.slice(0, k).map(c => c.id);

    // SPEED — fast mana and acceleration. mv-tiered: rituals/0-1cmc rocks beat
    // 3-cmc ramp; land-ramp counts less than mana that comes off lands.
    function speedWeight(n) {
      let weight = 0;
      const text = txt(n);
      if (n.role === "land") {
        // lands that produce >1 mana or scale (Ancient Tomb, Cradle, Sanctum…).
        // The "for each" form must be tied to adding mana, else utility lands
        // with unrelated "for each" clauses get full fast-mana credit.
        if (/add \{c\}\{c\}|add \{[wubrg]\}\{[wubrg]\}|add two mana|add an amount of|add \{[^}]+\} for each /.test(text)) weight = Math.max(weight, 1.1);
        return weight;
      }
      const manaProducer = (n.produces && n.produces.mana) || hasCap(n, "is-ramp") || hasCap(n, "taps-for-mana");
      const landRamp = /search your library for .*?(basic land|land card|forest|plains|island|swamp|mountain)/.test(text);
      const treasure = /create .*?(treasure|gold) token/.test(text);
      if (manaProducer) {
        if (mv(n) <= 0) weight = Math.max(weight, 1.5);       // zero-mana fast-mana class
        else if (mv(n) <= 1) weight = Math.max(weight, 1.25); // one-mana fast-mana / ritual class
        else if (mv(n) <= 2) weight = Math.max(weight, 1.0);
        else if (mv(n) <= 3) weight = Math.max(weight, 0.6);
        else weight = Math.max(weight, 0.3);
      }
      if (landRamp) {
        if (mv(n) <= 2) weight = Math.max(weight, 0.8);
        else if (mv(n) <= 3) weight = Math.max(weight, 0.5);
        else weight = Math.max(weight, 0.3);
      }
      if (treasure) weight = Math.max(weight, mv(n) <= 3 ? 0.65 : 0.4);
      // produces ≥2 mana for ≤ its own cost (rocks that net mana / rituals)
      if (/add \{[^}]+\}\{[^}]+\}/.test(text) && mv(n) <= 3) weight = Math.max(weight, 1.05);
      return weight;
    }

    // CONSISTENCY — tutors. Unrestricted "search for a card" beats narrow
    // type-restricted search beats land-only fetch (which is speed, not tutoring).
    function consistencyWeight(n) {
      const text = txt(n);
      if (!/search your library/.test(text)) return 0;
      const landOnly = /(basic land|land card|forest card|plains card|island card|swamp card|mountain card)/.test(text)
        && !/(nonland|creature|artifact|enchantment|instant|sorcery|planeswalker|card, put that card)/.test(text);
      if (landOnly) return 0;
      let weight;
      if (/search your library for a card/.test(text)) weight = /graveyard/.test(text) ? 0.9 : 1.4;
      else if (/search your library for .*creature card/.test(text)) weight = 0.7;
      else if (/search your library for .*(artifact|enchantment|instant|sorcery|planeswalker)/.test(text)) weight = 0.85;
      else weight = 0.65;
      if (mv(n) <= 1) weight += 0.2;                          // cheap tutors are far better
      return weight;
    }

    // CARD FLOW — refill engines and velocity: wheels, big draw, repeatable draw,
    // impulse/cast-from-exile, graveyard recursion.
    function cardFlowWeight(n) {
      let weight = 0;
      const text = txt(n);
      if (/each player[\s\S]{0,90}discards?[\s\S]{0,90}draws? seven/.test(text) || /discards? their hand[\s\S]{0,90}draws? seven/.test(text))
        weight = Math.max(weight, 1.35);                      // wheels
      if (/draws? cards? equal to half/.test(text) || /draw x cards?/.test(text) || /draws? seven cards?/.test(text))
        weight = Math.max(weight, 1.3);
      else if (/draw (three|four|five|\d+) cards?/.test(text)) weight = Math.max(weight, 0.95);
      else if (/draw two cards?/.test(text)) weight = Math.max(weight, 0.7);
      else if (/draw a card/.test(text)) {
        // repeatable/triggered draw (engines) beats one-shot cantrips. Match
        // recurring-trigger phrasing only — NOT a bare "each", which fires on
        // one-shot cantrips that merely mention "each opponent".
        weight = Math.max(weight, /whenever|at the beginning|each (turn|upkeep|end step|combat|time)|combat damage|pay \d* ?life/.test(text) ? 0.85 : 0.4);
      }
      if (/skip your draw step|exile the top card[\s\S]{0,60}put that card into your hand/.test(text)) weight = Math.max(weight, 1.4); // Necropotence-class
      if (/take an extra turn|take (two|an additional) .* turns?|extra turn after this one/.test(text)) weight = Math.max(weight, 1.1); // Time Warp / Expropriate-class tempo+velocity
      if (/exile the top[\s\S]{0,90}you may (play|cast)/.test(text) || /you may (play|cast) (it|them|those cards|the top)/.test(text))
        weight = Math.max(weight, 0.85);                      // impulse / cast-from-top
      if (/return .* from your graveyard to your hand/.test(text)) weight = Math.max(weight, 0.45);
      return weight;
    }

    // ANSWERS — interaction: removal, wipes, free interaction, stax/hatebears.
    function interactionWeight(n) {
      let weight = 0;
      const text = txt(n);
      if (n.role === "wipe" || /destroy all|exile all|all creatures get [-−]|deals? .* damage to each creature/.test(text))
        weight = Math.max(weight, mv(n) <= 3 ? 1.25 : 1.05);
      if (n.role === "removal" || /destroy target|exile target|counter target spell|counter target|return target .* owner.s hand|fight target|deals? \d+ damage to (target|any target)/.test(text))
        weight = Math.max(weight, mv(n) <= 2 ? 1.1 : 0.9);
      // stax / hatebears — opponent-facing only. Require an opponent qualifier on
      // "enter tapped" so a card's OWN enters-tapped drawback isn't scored as
      // interaction (e.g. "Creatures you control enter the battlefield tapped").
      if (/can't cast|can.t cast|can't activate|can.t activate|can't search|can.t search|each player can.t cast more than|opponents can.t|spells your opponents cast cost|(opponents?|their) [^.]*enter (the battlefield )?tapped|enter (the battlefield )?tapped[^.]* opponents?/.test(text))
        weight = Math.max(weight, 0.85);
      if (freeCast(n) && weight > 0) weight += 0.4;            // free interaction is premium
      if (/\bgoad\b/.test(text)) weight = Math.max(weight, 0.35);
      return weight;
    }

    // RESILIENCE — protect the engine: phasing/total protection, hexproof/
    // indestructible grants, uncounterability, recursion.
    function resilienceWeight(n) {
      let weight = 0;
      const text = txt(n);
      if (/phase out|protection from everything|your life total can.t change/.test(text)) weight = Math.max(weight, 1.7);
      if (/hexproof|indestructible|protection from|can.t be countered|\bward\b|shroud/.test(text))
        weight = Math.max(weight, 0.9);
      if (freeCast(n) && /(indestructible|hexproof|protection|counter|choose new targets)/.test(text))
        weight = Math.max(weight, 1.2);                       // free protection (Maneuver/Swat-class)
      if (/return .* from your graveyard|regenerate/.test(text)) weight = Math.max(weight, 0.5);
      return weight;
    }

    // CLOSURE — split into COMPACT (noncombat: you-win effects, mass life loss,
    // X-drains, mill/poison kills) and COMBAT (board-dependent beatdown). Combat
    // is discounted because it needs a board and a turn cycle to convert.
    function closureWeights(n) {
      const text = txt(n);
      let compact = 0, combat = 0;
      if (n.role === "finisher") compact = Math.max(compact, 1.1);
      if (/you win the game|target player loses the game|that player loses the game|each opponent loses the game/.test(text)) compact += 1.7;
      if (/each opponent loses|target opponent loses|opponent loses|each player loses|loses half (their|that player.s) life/.test(text)) compact += 1.3;
      if (/deals? .* damage to each opponent|deals? .* damage to each player/.test(text)) compact += 1.0;
      if ((/whenever an opponent draws/.test(text) || /whenever a player draws/.test(text))
        && /(loses? \d+ life|loses? .* life|deals? \d+ damage|deals? .* damage)/.test(text)) compact += 0.65;
      if ((/whenever an opponent discards/.test(text) || /whenever a player discards/.test(text))
        && /(loses? .* life|deals? .* damage)/.test(text)) compact += 0.45;
      if (/whenever an opponent loses life|whenever a player loses life/.test(text)) compact += 0.65;
      if (/poison counters?|mill .* opponent|mills? .* opponent|each opponent mills/.test(text)) compact += 0.9;
      // X-spell scaling bonus: require a real {X} in the mana cost (the bare
      // "x " substring matched far too much, e.g. "exile x" / hyphenated words).
      if ((n.consumes && n.consumes.mana) && /\{x\}/.test(((n.mana || "") + " " + text).toLowerCase()) && compact > 0) compact += 0.6;
      // mass pump finishers: "creatures you control get +N/+N" OR the common
      // "...gain trample and get +X/+X" overrun phrasing (Craterhoof, Overwhelming
      // Stampede, Triumph of the Hordes) where words sit between "gain" and "get +".
      if (/creatures you control get \+|creatures you control gain [^.]*get \+|additional combat|extra combat|double strike|triple strike/.test(text)) combat += 0.55;
      if (/whenever .* attacks|deals combat damage to a player|create .* creature token/.test(text)) combat += 0.35;
      if (/\bgoad\b/.test(text)) combat += 0.2;
      return { compact: Math.min(compact, 2.5), combat: Math.min(combat, 2.0) };
    }

    // GAME CHANGERS — authoritative WotC power list (see GAME_CHANGERS above).
    // Count is card-grounded (we keep the names) and maps to the official bracket
    // system. Each Game Changer is meaningful, so the count saturates slowly.
    const gameChangerCards = [...real, ...lands].filter(isGameChanger).map(n => n.id);
    const gameChangerCount = gameChangerCards.length;

    const speed = collect([...real, ...lands], speedWeight);
    const consistency = collect(real, consistencyWeight);
    const cardFlow = collect(real, cardFlowWeight);
    const interaction = collect(real, interactionWeight);
    const resilience = collect(real, resilienceWeight);

    let compactClosureRaw = 0, combatClosureRaw = 0; const closureCards = [];
    for (const n of real) {
      const w = closureWeights(n);
      compactClosureRaw += w.compact;
      combatClosureRaw += w.combat;
      if (w.compact > 0.001 || w.combat > 0.001)
        closureCards.push({ id: n.id, w: round1(Math.max(w.compact, w.combat * 0.5)), kind: w.compact >= w.combat ? "compact" : "combat" });
    }
    closureCards.sort((a, b) => b.w - a.w);
    const comboClosureRaw = Math.min(2, (combos.comboCriticalPairs || []).length * 0.8 + (combos.loops || []).length * 0.25);
    const closureRaw = compactClosureRaw + comboClosureRaw + Math.min(2.25, combatClosureRaw * 0.4);

    const ranks = real.map(n => n.edh).filter(Boolean);
    const premiumShare = ranks.length ? ranks.filter(r => r <= 1500).length / (real.length || 1) : 0;
    const nonlandQty = real.reduce((sum, n) => sum + (n.qty || 1), 0) || 1;
    const avgMv = real.reduce((sum, n) => sum + mv(n) * (n.qty || 1), 0) / nonlandQty;
    const curveScore = 100 * clamp01((4.25 - avgMv) / 2.25); // 2.0 MV ≈ max, 4.25+ ≈ 0
    const efficiencyScore = Math.round(0.6 * curveScore + 0.4 * premiumShare * 100);
    const legalityScore = Math.max(0, 100 - Math.abs(totalQty - 100) * 25);

    const signals = {
      speed: { score: Math.round(100 * sat(speed.raw, 11)), raw: round1(speed.raw), label: "speed", cards: topNames(speed.cards) },
      consistency: { score: Math.round(100 * sat(consistency.raw, 7)), raw: round1(consistency.raw), label: "tutors", cards: topNames(consistency.cards) },
      cardFlow: { score: Math.round(100 * sat(cardFlow.raw, 12)), raw: round1(cardFlow.raw), label: "card flow", cards: topNames(cardFlow.cards) },
      interaction: { score: Math.round(100 * sat(interaction.raw, 12)), raw: round1(interaction.raw), label: "answers", cards: topNames(interaction.cards) },
      closure: {
        score: Math.round(100 * sat(closureRaw, 8)),
        raw: round1(closureRaw),
        compact: round1(compactClosureRaw + comboClosureRaw),
        combat: round1(combatClosureRaw),
        label: "closure",
        cards: topNames(closureCards),
      },
      resilience: { score: Math.round(100 * sat(resilience.raw, 8)), raw: round1(resilience.raw), label: "resilience", cards: topNames(resilience.cards) },
      efficiency: { score: efficiencyScore, raw: round1(avgMv), label: "efficiency", cards: [] },
      gameChangers: { score: Math.round(100 * sat(gameChangerCount, 7)), raw: gameChangerCount, label: "game changers", cards: gameChangerCards },
      legality: { score: legalityScore, raw: totalQty, label: "deck size", cards: [] },
    };

    const score = Math.round(
      0.16 * signals.speed.score +
      0.13 * signals.consistency.score +
      0.13 * signals.cardFlow.score +
      0.12 * signals.interaction.score +
      0.18 * signals.closure.score +
      0.06 * signals.resilience.score +
      0.06 * signals.efficiency.score +
      0.12 * signals.gameChangers.score +
      0.04 * signals.legality.score
    );

    // Plain-English "how this deck wins" — leads with the win path, then names
    // the strongest supporting signals so the score reads as a sentence, not a
    // bare number. Card-grounded throughout.
    const summary = winSummary(signals, {
      compactClosureRaw,                                       // card-based compact closure ONLY (no combo mass)
      combatClosureRaw,
      comboPairs: (combos.comboCriticalPairs || []).length,
      loops: (combos.loops || []).length,
    });
    return { score, signals, summary };
  }

  // Build the one-line archetype/how-it-wins summary from the win-tuning signals.
  function winSummary(sig, closure) {
    let path;
    if (closure.comboPairs > 0 || closure.loops > 0) path = "Wins through a combo";
    else if (closure.compactClosureRaw >= 1.5 && closure.compactClosureRaw >= closure.combatClosureRaw) path = "Wins with a compact noncombat finisher";
    else if (closure.combatClosureRaw >= 1.5) path = "Wins through combat / going wide";
    else if (sig.closure.score >= 35) path = "Has some closing power";
    else path = "No clear win condition — grindy/value plan";

    const support = [];
    if (sig.speed.score >= 60) support.push("fast mana");
    if (sig.consistency.score >= 55) support.push("tutor consistency");
    if (sig.cardFlow.score >= 55) support.push("strong card flow");
    if (sig.interaction.score >= 55) support.push("dense interaction");
    if (sig.resilience.score >= 55) support.push("protection");
    if (sig.gameChangers.raw >= 4) support.push(`${sig.gameChangers.raw} Game Changers`);
    else if (sig.gameChangers.raw >= 1) support.push(`${sig.gameChangers.raw} Game Changer${sig.gameChangers.raw > 1 ? "s" : ""}`);

    const tail = support.length ? `, backed by ${support.slice(0, 3).join(", ")}` : "";
    return path + tail + ".";
  }

  function compute(graph) {
    const nodes = graph.nodes.filter(n => n.role !== "zone");
    const real = nodes.filter(n => n.role !== "land");          // nonland cards
    const N = real.length || 1;
    const edges = graph.edges;                                   // card-card only

    // --- basic counts ---
    const interactive = real.filter(n => (n.degree || 0) > 0);
    const islands = real.filter(n => (n.degree || 0) === 0);
    const totalDegree = real.reduce((s, n) => s + (n.degree || 0), 0);
    const avgDegree = totalDegree / N;
    const pctInteractive = interactive.length / N;

    // --- density: actual edges vs. max possible among nonland cards ---
    const maxEdges = (N * (N - 1)) / 2;
    const density = maxEdges ? edges.length / maxEdges : 0;

    // --- largest connected component (are the interactive cards one web?) ---
    const idset = new Set(real.map(n => n.id));
    const adj = {}; real.forEach(n => adj[n.id] = []);
    for (const e of edges) {
      if (idset.has(e.source) && idset.has(e.target)) { adj[e.source].push(e.target); adj[e.target].push(e.source); }
    }
    const seen = new Set(); let largest = 0; let componentsOfInteractive = 0;
    for (const n of real) {
      if (seen.has(n.id) || (n.degree || 0) === 0) continue;
      componentsOfInteractive++;
      let size = 0; const stack = [n.id];
      while (stack.length) { const x = stack.pop(); if (seen.has(x)) continue; seen.add(x); size++; for (const y of adj[x]) if (!seen.has(y)) stack.push(y); }
      if (size > largest) largest = size;
    }
    const lccShare = largest / N;                                // share of nonland deck in the biggest web

    // --- event spread: how many distinct interaction themes carry edges ---
    const eventCounts = {};
    for (const e of edges) for (const ev of (e.events || [])) eventCounts[ev] = (eventCounts[ev] || 0) + 1;

    // --- weighted degree (raw, kept for display/back-compat) ---
    const wdeg = {}; real.forEach(n => wdeg[n.id] = 0);
    for (const e of edges) {
      if (!idset.has(e.source) || !idset.has(e.target)) continue;
      const w = edgeWeight(e); wdeg[e.source] += w; wdeg[e.target] += w;
    }
    const totalWeighted = real.reduce((s, n) => s + (wdeg[n.id] || 0), 0);
    const weightedAvgDegree = totalWeighted / N;

    // --- SATURATED weighted degree: the inflation fix.
    // The 100-deck audit showed cohesion was dominated by fan-out volume — one
    // anthem produces N edges, one sac outlet N edges, every rock×X-spell N×M
    // edges — all reading as "many synergies" when each is ONE redundant
    // relationship. Fix: per node, group incident edges BY FAMILY and apply
    // diminishing returns within each family (sqrt of count), so the 20th
    // lord→tribe edge adds almost nothing. Cross-family breadth still counts.
    const famWeightOf = e => (e.interactions && e.interactions.length)
      ? Math.max(...e.interactions.map(it => STRENGTH_WEIGHT[it.strength] || 0.25)) : 0.5;
    const famOf = e => (e.interactions && e.interactions.length)
      ? e.interactions.reduce((b, it) => (STRENGTH_WEIGHT[it.strength] || 0) > (STRENGTH_WEIGHT[b.strength] || 0) ? it : b).family
      : (e.events && e.events[0]) || "misc";
    const byNodeFam = {}; real.forEach(n => byNodeFam[n.id] = {});
    for (const e of edges) {
      if (!idset.has(e.source) || !idset.has(e.target)) continue;
      const f = famOf(e), w = famWeightOf(e);
      for (const nid of [e.source, e.target]) {
        const slot = byNodeFam[nid][f] || (byNodeFam[nid][f] = { count: 0, w });
        slot.count++; slot.w = Math.max(slot.w, w);
      }
    }
    const satDeg = {};
    for (const n of real) {
      let s = 0;
      for (const f in byNodeFam[n.id]) { const { count, w } = byNodeFam[n.id][f]; s += w * Math.sqrt(count); }
      satDeg[n.id] = s;
    }
    const satWeightedAvgDegree = real.reduce((s, n) => s + satDeg[n.id], 0) / N;

    // --- "meaningful" connectivity: count only MODERATE+ edges, so a web held
    // together purely by weak ramp→sink / generic cliques doesn't read as one
    // cohesive engine. Displayed pctInteractive/largestWeb stay RAW (unchanged).
    const STRONG_MIN = STRENGTH_WEIGHT.moderate;
    const madj = {}; real.forEach(n => madj[n.id] = []);
    const mdeg = {}; real.forEach(n => mdeg[n.id] = 0);
    for (const e of edges) {
      if (!idset.has(e.source) || !idset.has(e.target)) continue;
      if (famWeightOf(e) < STRONG_MIN) continue;
      madj[e.source].push(e.target); madj[e.target].push(e.source);
      mdeg[e.source]++; mdeg[e.target]++;
    }
    const pctMeaningful = real.filter(n => mdeg[n.id] > 0).length / N;
    const mseen = new Set(); let mLargest = 0;
    for (const n of real) {
      if (mseen.has(n.id) || mdeg[n.id] === 0) continue;
      let size = 0; const stack = [n.id];
      while (stack.length) { const x = stack.pop(); if (mseen.has(x)) continue; mseen.add(x); size++; for (const y of madj[x]) if (!mseen.has(y)) stack.push(y); }
      if (size > mLargest) mLargest = size;
    }
    const meaningfulWebShare = mLargest / N;

    // --- combo / engine detection ---
    const combos = detectCombos(real, edges);
    const hasCombo = combos.comboCriticalPairs.length > 0;
    const comboBonus = hasCombo ? Math.min(1, combos.comboCriticalPairs.length / 3) : 0;

    // --- SELF-SUFFICIENCY: the second power axis. Cohesion measures synergy
    // (winning through an engine); self-sufficiency measures the OTHER route to
    // power — a deck of individually strong, independent cards (efficient
    // interaction, card advantage, mana, consistency, resilience, card quality)
    // that doesn't need an engine to function. A political/control "pile" scores
    // low cohesion but should read high here; a fragile combo deck the reverse.
    // Each signal is a count over nonland cards, saturated against a target so a
    // deck "maxes" a signal at a sensible amount. Formula A (balanced density):
    // card-quality (EDHREC) is only a tiebreaker weight, not the driver, since
    // rank is a popularity proxy, not a true power measure.
    const ss = selfSufficiency(real);
    const wt = winTuning(real, nodes, combos);

    // --- cohesion score (0-100). Round-3 recalibration: the audit found the
    // satWeightedAvgDeg/6 term was INVERTING intent — focused single-engine decks
    // (95% interactive / 95% web) landed in "Loosely connected" because their
    // edges concentrate in a few families, so per-family saturation capped that
    // term low. Fix: lean on the MEANINGFUL connectivity signals (which correctly
    // read high for focused synergy decks AND low for goodstuff piles), keep a
    // smaller saturation term for richness, and a combo bonus. Displayed
    // avgDegree/largestWeb stay raw so sidebar numbers don't shift meaning.
    const score = Math.round(100 * (
      0.38 * pctMeaningful +
      0.38 * meaningfulWebShare +
      0.16 * Math.min(1, satWeightedAvgDegree / 4) +   // ~4 saturated ≈ rich
      0.08 * comboBonus
    ));

    return {
      nonlandCount: N,
      interactiveCount: interactive.length,
      islandCount: islands.length,
      islands: islands.map(n => n.id),
      edgeCount: edges.length,
      avgDegree: +avgDegree.toFixed(2),
      weightedAvgDegree: +weightedAvgDegree.toFixed(2),
      satWeightedAvgDegree: +satWeightedAvgDegree.toFixed(2),
      pctInteractive: +(pctInteractive * 100).toFixed(0),
      pctMeaningful: +(pctMeaningful * 100).toFixed(0),
      density: +(density * 100).toFixed(1),
      largestWeb: largest,
      largestWebShare: +(lccShare * 100).toFixed(0),
      meaningfulWeb: mLargest,
      meaningfulWebShare: +(meaningfulWebShare * 100).toFixed(0),
      interactiveComponents: componentsOfInteractive,
      eventCounts,
      combos: combos.loops,
      comboCriticalPairs: combos.comboCriticalPairs,
      hasCombo,
      cohesionScore: score,
      cohesionBand: score >= 70 ? "Very cohesive" : score >= 50 ? "Cohesive"
        : score >= 32 ? "Loosely connected" : "Pile of good-stuff",
      selfSufficiencyScore: ss.score,
      selfSufficiencyBand: ss.score >= 70 ? "Very self-sufficient" : ss.score >= 50 ? "Self-sufficient"
        : ss.score >= 32 ? "Somewhat reliant" : "Engine-dependent",
      selfSufficiencySignals: ss.signals,
      winTuningScore: wt.score,
      // Bands calibrated against the 100-precon corpus (a known-casual baseline:
      // see data/validate-wintuning.js). Precons span min 39 / median 57 / max
      // 73, so "Tuned to win" starts at 74 — one point above the strongest
      // precon — meaning "upgraded beyond an out-of-box deck"; "Highly tuned"
      // (≥86) is reserved for genuinely optimised lists (cEDH-adjacent).
      winTuningBand: wt.score >= 86 ? "Highly tuned" : wt.score >= 74 ? "Tuned to win"
        : wt.score >= 58 ? "Focused" : wt.score >= 42 ? "Casual" : "Untuned",
      winTuningSignals: wt.signals,
      winSummary: wt.summary,
      // Game Changers + the official Commander Brackets mapping. Count is the
      // number of WotC "Game Changer" cards in the list; the names are surfaced
      // so the figure is auditable. Bracket: 0 → casual (1-2), 1-3 → upgraded
      // (3), 4+ → optimised / cEDH (4). This is a hint from the GC count alone,
      // not a full bracket ruling (which also weighs tutors, combos, mass land
      // denial), but it tracks the official intent.
      gameChangerCount: wt.signals.gameChangers.raw,
      gameChangers: wt.signals.gameChangers.cards,
      bracketHint: wt.signals.gameChangers.raw >= 4 ? 4 : wt.signals.gameChangers.raw >= 1 ? 3 : 2,
      bracketLabel: wt.signals.gameChangers.raw >= 4 ? "Bracket 4 · Optimised / cEDH"
        : wt.signals.gameChangers.raw >= 1 ? "Bracket 3 · Upgraded"
        : "Bracket 1–2 · Casual",
    };
  }

  const API = { compute, cardPower };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.DECK_METRICS = API;
})(typeof window !== "undefined" ? window : globalThis);
