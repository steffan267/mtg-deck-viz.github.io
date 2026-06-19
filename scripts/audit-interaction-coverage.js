#!/usr/bin/env node
/*
 * audit-interaction-coverage.js — per-card evidence audit for interaction tags.
 *
 * This is intentionally heuristic: it does not decide deck cohesion. It exposes
 * what the shared interaction model deduced for each card, plus raw-text cues
 * that are commonly missed or over-broad in precon audits. Use it to review
 * whether a card's interaction type is specific enough before changing scoring.
 *
 * Examples:
 *   node scripts/audit-interaction-coverage.js data/sample-decklist.txt
 *   node scripts/audit-interaction-coverage.js --precon-examples --markdown
 */
const fs = require('fs');
const MODEL = require('../src/interaction-model');
const { loadCards, build, parseDecklist } = require('../src/build-deck-viz');

const PRECON_EXAMPLES = [
  'Heartstone', 'Skullclamp', 'Panharmonicon', 'Anointed Procession', 'Divine Visitation',
  'Aetherworks Marvel', 'Aether Refinery', 'Satya, Aetherflux Genius',
  'Smuggler\'s Copter', 'Shorikai, Genesis Engine', 'Greasefang, Okiba Boss',
  'Marionette Apprentice', 'Sanguine Bond', 'Exquisite Blood', 'The Gaffer',
  'Prosper, Tome-Bound', 'Gonti, Canny Acquisitor', 'Thief of Sanity',
  'Ruin Crab', 'World Shaper', 'Splendid Reclamation', 'Ramunap Excavator',
  'Nuka-Cola Vending Machine', 'Academy Manufactor', 'Mirkwood Bats',
  'Inspiring Statuary', 'Cryptolith Rite', 'Beastmaster Ascension',
  'Bastion Protector', 'Harmonic Prodigy', 'Veyran, Voice of Duality',
  'Poison-Tip Archer', 'Nadier\'s Nightblade', 'Blood Artist', 'Zulaport Cutthroat',
];

function usage() {
  console.error('Usage: node scripts/audit-interaction-coverage.js [decklist.txt] [--precon-examples] [--cards Name|Name] [--json|--markdown] [--out file]');
  process.exit(2);
}

function lookup(idx, name) {
  const n = String(name).toLowerCase();
  if (idx[n]) return idx[n];
  return Object.values(idx).find(c => {
    const cn = (c.name || '').toLowerCase();
    return cn === n || cn.startsWith(n + ' //') || cn.split(' // ')[0] === n;
  });
}

function eventKeys(map) { return Object.keys(map || {}).sort(); }
function hasAny(set, arr) { return arr.some(x => set.has(x)); }

const CUES = [
  { id: 'creature_ability_cost_reducer', re: /activated abilities of creatures|activated abilities .*creatures?.*cost/i, expectCaps: ['is-creature-ability-cost-reducer'], note: 'cost reducer scope should stay creature-only, not all tap abilities' },
  { id: 'generic_ability_cost_reducer', re: /activated abilities .*cost|abilities cost .*less/i, expectAnyCaps: ['is-cost-reducer', 'is-creature-ability-cost-reducer', 'is-food-ability-cost-reducer'], note: 'ability reducer should record its scope' },
  { id: 'equip_or_attach', re: /\bequip\b|equipped creature|attach|for mirrodin|enchant creature/i, expectEvents: ['attach'], note: 'attach/equipment cues should be represented, but player auras/equipment competition may be overbroad' },
  { id: 'crew_vehicle', re: /\bcrew\b|\bvehicle\b/i, expectAnyCaps: ['is-vehicle', 'is-vehicle-payoff', 'is-crew-enabler', 'has-creature-activated-ability'], note: 'Vehicles need crew/vehicle-specific interpretation rather than generic tap/attach' },
  { id: 'food_clue_blood', re: /\bfood\b|\bclue\b|\bblood token/i, expectAnyEvents: ['tokens', 'lifegain', 'draw', 'sacrifice'], note: 'artifact-token subtypes often need producer/payoff specificity' },
  { id: 'energy', re: /\{e\}|energy counter/i, expectEvents: ['energy'], note: 'energy producers and spenders should be visible' },
  { id: 'poison_toxic_infect', re: /poison counter|\btoxic\b|\binfect\b|\bcorrupted\b/i, expectAnyCaps: ['is-poison-source', 'is-poison-payoff'], expectAnyEvents: ['proliferate'], note: 'poison/toxic/corrupted is a precon-defining axis not fully covered by generic counters' },
  { id: 'theft_cast_opponent', re: /exiled card an opponent owns|cards? exiled .* opponents?|opponent (owns|owned)|opponents? own|cast (spells?|cards?) (from|exiled|owned by).{0,50}opponents?|mana .* any color .* cast spells you don.?t own/i, expectAnyCaps: ['is-theft-cast-source', 'is-theft-cast-payoff'], expectAnyEvents: ['steal', 'cast', 'exile'], note: 'theft/cast-from-opponent needs more than control-change steal' },
  { id: 'lifegain_payoff', re: /whenever you gain life|if you gained life/i, expectEvents: ['lifegain'], note: 'lifegain payoff should consume lifegain' },
  { id: 'lifeloss_payoff', re: /whenever an opponent loses life|whenever a player loses life/i, expectEvents: ['lifeloss'], note: 'group slug/drain payoff should consume lifeloss' },
  { id: 'opponent_draw_punisher', re: /whenever an opponent draws|whenever a player draws/i, expectEvents: ['draw'], note: 'opponent draw punishers should be subject-aware draw consumers' },
  { id: 'land_recursion_landfall', re: /play lands? from your graveyard|land card from your graveyard|return .* land .* graveyard|lands? .* graveyard .* battlefield/i, expectAnyCaps: ['is-land-recursion'], expectAnyEvents: ['landfall', 'graveyard'], note: 'land recursion should feed landfall, not just generic graveyard' },
  { id: 'inline_trigger', re: /\b(Defender|Flying|Reach|Deathtouch|First strike|Double strike|Haste|Lifelink|Menace|Trample|Vigilance|Ward|Hexproof|Indestructible|Flash)\s+(When|Whenever|At the beginning|At end|At your|At each)\b/i, expectAnyCaps: ['has-trigger', 'has-etb', 'has-death-trigger'], expectAnyEvents: ['draw', 'lifegain', 'lifeloss', 'tokens', 'sacrifice', 'attack', 'cast', 'discard'], note: 'inline keyword plus trigger text should be segmented into a real trigger ability' },
  { id: 'etb_doubler', re: /additional time|triggers? an additional time|panharmonicon/i, expectAnyCaps: ['is-etb-doubler', 'is-trigger-doubler'], note: 'trigger doublers are multiplicative hubs and should be explicit' },
  { id: 'token_doubler', re: /twice that many tokens|double .* tokens|instead create .* token|tokens? would be created under your control|would create .* tokens?|tokens? plus .* token .* created instead/i, expectAnyCaps: ['is-token-doubler', 'is-token-replacement-modifier'], note: 'token replacement/doubling should not be flattened to generic token producer' },
  { id: 'death_trigger', re: /whenever .* dies|whenever .* put into a graveyard/i, expectAnyCaps: ['has-death-trigger', 'is-death-drain-payoff', 'is-death-draw-payoff', 'is-death-token-payoff', 'is-land-recursion'], note: 'death triggers should expose their effect subtype (drain/draw/token/energy/land recursion/etc.)' },
  { id: 'sacrifice_trigger', re: /whenever [^.]*sacrific/i, expectAnyCaps: ['has-sacrifice-trigger', 'is-creature-sacrifice-payoff', 'is-artifact-sacrifice-payoff', 'is-sacrifice-draw-payoff', 'is-sacrifice-token-payoff'], note: 'sacrifice triggers should stay distinct from death triggers and preserve sacrificed-object type' },
  { id: 'counter_type', re: /\+1\/\+1 counter|charge counter|time counter|quest counter|loyalty counter/i, expectAnyCaps: ['has-counters'], note: 'counter cards should expose counter-bearing, but counter TYPE may need review' },
  { id: 'copy_scope', re: /copy target instant|copy target sorcery|copy target spell|token that.?s a copy|copy target creature/i, expectAnyCaps: ['is-copy'], note: 'copy effects need scope review: spell-copy vs permanent-copy vs self-copy' },
];

function classifyCard(card, profileByName) {
  const text = [card.type_line || '', card.oracle_text || '', (card.card_faces || []).map(f => `${f.type_line || ''} ${f.oracle_text || ''}`).join('\n')].join('\n');
  const flatCard = {
    type_line: card.type_line || (card.card_faces || []).map(f => f.type_line || '').join(' // '),
    oracle_text: card.oracle_text || (card.card_faces || []).map(f => f.oracle_text || '').join('\n'),
  };
  const classified = MODEL.classify(flatCard);
  const caps = new Set(classified.caps || []);
  const events = new Set([...eventKeys(classified.produces), ...eventKeys(classified.consumes)]);
  const warnings = [];
  const cues = [];
  for (const cue of CUES) {
    if (!cue.re.test(text)) continue;
    cues.push(cue.id);
    const missing = [];
    if (cue.expectCaps) for (const c of cue.expectCaps) if (!caps.has(c)) missing.push(`cap:${c}`);
    if (cue.expectEvents) for (const e of cue.expectEvents) if (!events.has(e)) missing.push(`event:${e}`);
    if (cue.expectAnyCaps && !hasAny(caps, cue.expectAnyCaps)) missing.push(`one-of-cap:${cue.expectAnyCaps.join('|')}`);
    if (cue.expectAnyEvents && !hasAny(events, cue.expectAnyEvents)) missing.push(`one-of-event:${cue.expectAnyEvents.join('|')}`);
    if (missing.length) warnings.push({ cue: cue.id, missing, note: cue.note });
  }
  return {
    name: card.name,
    role: classified.role,
    type: flatCard.type_line,
    mana: card.mana_cost || '',
    cues,
    warnings,
    produces: classified.produces,
    consumes: classified.consumes,
    caps: classified.caps || [],
    zones: classified.zones || [],
    profile: profileByName.get(card.name.toLowerCase()) || MODEL.interactionProfile({
      id: card.name,
      role: classified.role,
      produces: classified.produces,
      consumes: classified.consumes,
      caps: classified.caps || [],
    }),
  };
}

function collectCards(argv, idx) {
  const names = [];
  const deckEntries = [];
  const files = [];
  let preconExamples = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--precon-examples') { preconExamples = true; continue; }
    if (a === '--cards') { names.push(...String(argv[++i] || '').split('|').map(s => s.trim()).filter(Boolean)); continue; }
    if (a.startsWith('--')) { i += ['--out'].includes(a) ? 1 : 0; continue; }
    files.push(a);
  }
  if (preconExamples || (!files.length && !names.length)) names.push(...PRECON_EXAMPLES);
  for (const f of files) {
    const parsed = parseDecklist(fs.readFileSync(f, 'utf8'));
    names.push(...parsed.map(x => x.name));
    deckEntries.push(...parsed);
  }
  const seen = new Set();
  const cards = [];
  const missing = [];
  for (const name of names) {
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const card = lookup(idx, name);
    if (card) cards.push(card); else missing.push(name);
  }
  return { cards, missing, deckEntries };
}

function summarize(rows, missing) {
  const warningCounts = {};
  for (const r of rows) for (const w of r.warnings) warningCounts[w.cue] = (warningCounts[w.cue] || 0) + 1;
  return {
    cardCount: rows.length,
    warningCardCount: rows.filter(r => r.warnings.length).length,
    warningCounts: Object.fromEntries(Object.entries(warningCounts).sort((a,b)=>b[1]-a[1])),
    missing,
  };
}

function markdown(report) {
  const lines = [];
  lines.push('# Interaction coverage audit');
  lines.push('');
  lines.push(`Cards audited: ${report.summary.cardCount}`);
  lines.push(`Cards with warnings: ${report.summary.warningCardCount}`);
  if (report.summary.missing.length) lines.push(`Missing: ${report.summary.missing.join(', ')}`);
  lines.push('');
  lines.push('## Warning counts');
  for (const [k, v] of Object.entries(report.summary.warningCounts)) lines.push(`- ${k}: ${v}`);
  lines.push('');
  lines.push('## Per-card warnings');
  for (const r of report.cards.filter(x => x.warnings.length)) {
    lines.push(`### ${r.name}`);
    lines.push(`- role: ${r.role}`);
    lines.push(`- type: ${r.type}`);
    lines.push(`- profile: ${r.profile.primary.family} / ${r.profile.surface} / confidence ${r.profile.confidence}`);
    lines.push(`- caps: ${r.caps.join(', ') || '(none)'}`);
    lines.push(`- events: ${[...new Set([...Object.keys(r.produces), ...Object.keys(r.consumes)])].sort().join(', ') || '(none)'}`);
    for (const w of r.warnings) lines.push(`- warning: ${w.cue}; missing ${w.missing.join(', ')} — ${w.note}`);
    lines.push('');
  }
  return lines.join('\n');
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help')) usage();
  const outIdx = argv.indexOf('--out');
  const out = outIdx >= 0 ? argv[outIdx + 1] : null;
  const asMarkdown = argv.includes('--markdown');
  const idx = loadCards();
  const { cards, missing, deckEntries } = collectCards(argv, idx);
  const profileByName = new Map();
  if (deckEntries.length) {
    const graph = build(deckEntries, idx);
    for (const node of graph.nodes || []) {
      if (node.role === 'zone') continue;
      profileByName.set(node.id.toLowerCase(), MODEL.interactionProfile(node, graph));
    }
  }
  const rows = cards.map(card => classifyCard(card, profileByName)).sort((a, b) => b.warnings.length - a.warnings.length || a.name.localeCompare(b.name));
  const report = { generatedAt: new Date().toISOString(), summary: summarize(rows, missing), cards: rows };
  const body = asMarkdown ? markdown(report) : JSON.stringify(report, null, 2);
  if (out) fs.writeFileSync(out, body); else process.stdout.write(body + '\n');
}

main();
