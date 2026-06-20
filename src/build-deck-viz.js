#!/usr/bin/env node
/*
 * build-deck-viz.js — turn ANY decklist into an interactive interaction map.
 *
 * Usage:
 *   node src/build-deck-viz.js <source> [more sources...] [-o output.html]
 *
 * A <source> is either:
 *   - a local decklist .txt file, or
 *   - a Moxfield deck URL (https://moxfield.com/decks/XXXX)
 *
 * Pass MULTIPLE sources to build a comparison map (cohesion numbers side by side).
 *   node src/build-deck-viz.js data/sample-decklist.txt https://moxfield.com/decks/NQ8mZv-BAEaKflOhzyXflg
 *
 * Decklist .txt format: one card per line ("1 Sol Ring", "1 Wheel (VMA) 192").
 * Set codes, collector numbers, and foil markers are ignored.
 *
 * Edges represent MECHANICAL INTERACTIONS, not shared card types:
 * each card emits the game events it PRODUCES and the events it CARES about;
 * an edge is drawn when one card produces something another card consumes.
 */
const fs = require("fs");
const path = require("path");
const MODEL = require("./interaction-model.js");
const METRICS = require("./metrics.js");
const PROOF_PACKAGES = require("./interaction-proof-packages.js");
const CARD_FACES = require("./card-faces.js");
const FACE_CLASSIFICATION = require("./face-classification.js");

const ROOT = path.resolve(__dirname, "..");
const COMPACT = path.join(ROOT, "data/out/commander-search.json");
const ORACLE = path.join(ROOT, "data/out/oracle-cards.json");
const NON_GAMEPLAY = /art_series|token|emblem|double_faced_token|planar|scheme|vanguard/;
const DEFAULT_BUILD_OPTIONS = {
  includeInteractionProofs: true,
};

// ---------------------------------------------------------------- load DB
function loadCards() {
  const idx = {};
  function add(c) {
    if (!c || !c.name) return;
    const faceAware = CARD_FACES.toFaceAwareResolvedCard(c);
    const rootKey = CARD_FACES.normalizeCardNameKey(faceAware.name);
    idx[rootKey] = faceAware;
    for (const alias of faceAware.aliases || []) {
      if (!idx[alias]) idx[alias] = faceAware;
    }
  }
  if (fs.existsSync(COMPACT)) {
    const raw = JSON.parse(fs.readFileSync(COMPACT, "utf8"));
    const arr = Array.isArray(raw) ? raw : (raw.cards || Object.values(raw).find(v => Array.isArray(v)));
    arr.forEach(add);
  }
  // oracle file fills gaps (older cards missing from compact) + front faces
  if (fs.existsSync(ORACLE)) {
    const raw = JSON.parse(fs.readFileSync(ORACLE, "utf8"));
    const arr = Array.isArray(raw) ? raw : raw.data || [];
    arr.forEach(c => { if (c && c.name && !idx[CARD_FACES.normalizeCardNameKey(c.name)]) add(c); });
  }
  return idx;
}

function playable(c) { return c && !NON_GAMEPLAY.test(c.layout || ""); }

function compactCandidate(c) {
  if (!playable(c) || c.is_commander_legal === false || (c.legalities && c.legalities.commander !== "legal")) return null;
  const faceAware = CARD_FACES.toFaceAwareResolvedCard(c);
  return {
    name: faceAware.name,
    ci: faceAware.color_identity || [],
    cmc: faceAware.cmc != null ? faceAware.cmc : 0,
    type: faceAware.type_line || "",
    mana: faceAware.mana_cost || "",
    text: (faceAware.oracle_text || "").replace(/\r/g, ""),
    edh: faceAware.edhrec_rank || null,
    tags: faceAware.tags || [],
    layout: faceAware.layout,
    aliases: faceAware.aliases,
    faces: faceAware.faces,
    cardKey: faceAware.cardKey,
    canonicalName: faceAware.canonicalName,
  };
}

function candidateIndex(cardsByName) {
  const seen = new Set();
  const out = [];
  for (const c of Object.values(cardsByName || {})) {
    const slim = compactCandidate(c);
    if (!slim || seen.has(slim.name.toLowerCase())) continue;
    seen.add(slim.name.toLowerCase());
    out.push(slim);
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

function htmlJson(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
// ---------------------------------------------------------------- Moxfield
function moxfieldId(url) {
  const m = String(url).match(/moxfield\.com\/decks\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}
async function httpGet(url) {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json,text/plain,*/*" } });
  if (!res.ok) throw new Error("HTTP " + res.status + " for " + url);
  return res.text();
}
// Moxfield's API sits behind Cloudflare; the r.jina.ai reader proxy fetches it
// reliably and returns the raw JSON (with a short text preamble we strip).
async function fetchMoxfield(id) {
  const api = "https://api2.moxfield.com/v3/decks/all/" + id;
  let body;
  try { body = await httpGet(api); JSON.parse(body); }       // direct (works if not blocked)
  catch (_) { body = await httpGet("https://r.jina.ai/" + api); }
  const start = body.indexOf("{");
  if (start < 0) throw new Error("Moxfield returned no JSON for " + id);
  const data = JSON.parse(body.slice(start));
  const boards = data.boards || {};
  const decklist = [];
  // commanders first so they get the commander role
  for (const board of ["commanders", "mainboard"]) {
    const cards = (boards[board] && boards[board].cards) || {};
    for (const entry of Object.values(cards)) {
      const c = entry.card; if (!c) continue;
      const faceAware = CARD_FACES.toFaceAwareResolvedCard(c);
      decklist.push({
        qty: entry.quantity || 1,
        name: faceAware.name,
        resolved: { name: faceAware.name, type_line: faceAware.type_line || "", oracle_text: faceAware.oracle_text || "", mana_cost: faceAware.mana_cost || "", cmc: faceAware.cmc, edhrec_rank: faceAware.edhrec_rank, color_identity: faceAware.color_identity || [], layout: faceAware.layout, aliases: faceAware.aliases, faces: faceAware.faces, cardKey: faceAware.cardKey, canonicalName: faceAware.canonicalName, card_faces: faceAware.card_faces },
      });
    }
  }
  return { decklist, title: data.name || ("Moxfield " + id) };
}

function lookup(idx, name) {
  const n = CARD_FACES.normalizeCardNameKey(name);
  if (idx[n] && playable(idx[n])) return idx[n];
  // split / DFC: match on any provider-backed alias, skip art/token layouts
  const hit = Object.values(idx).find(c => {
    if (!playable(c)) return false;
    return CARD_FACES.cardAliases(c).includes(n);
  });
  return hit || null;
}

// ---------------------------------------------------------------- parse list
function parseDecklist(text) {
  const out = [];
  for (let line of text.split("\n")) {
    line = line.trim();
    if (!line || line.startsWith("#") || /^(commander|deck|sideboard|maybeboard)\b/i.test(line)) continue;
    // "1 Name (SET) 123 *F*"  ->  qty + name
    const m = line.match(/^(\d+)\s*x?\s+(.+)$/i) || line.match(/^()(.+)$/);
    if (!m) continue;
    const qty = m[1] ? parseInt(m[1]) : 1;
    let name = m[2]
      .replace(/\s*\([A-Za-z0-9]{2,6}\)\s*[A-Za-z0-9-]*\s*/g, " ") // (SET) 123
      .replace(/\*[^*]+\*/g, "")                                    // *F*
      .replace(/\s+/g, " ").trim();
    if (name) out.push({ qty, name });
  }
  return out;
}


// ---------------------------------------------------------------- build graph
// Detect the commander: first card in the list that is a legendary creature
// (or planeswalker that can be a commander). Used only for node coloring.
function isCommanderish(c) {
  const t = (c.type_line || "").toLowerCase();
  return t.includes("legendary") && (t.includes("creature") || /planeswalker/.test(t));
}

function mergeDecklistEntries(decklist, idx) {
  const byPhysicalCard = new Map();
  const missing = [];
  for (const { qty, name, resolved } of decklist) {
    const found = resolved || lookup(idx, name);   // Moxfield supplies resolved cards
    if (!found) {
      missing.push(name);
      continue;
    }
    const faceAware = CARD_FACES.toFaceAwareResolvedCard(found);
    const key = CARD_FACES.physicalCardKey(faceAware);
    const current = byPhysicalCard.get(key);
    if (current) {
      current.qty += qty;
      current.names.push(name);
      if (CARD_FACES.faceDataScore(faceAware) > CARD_FACES.faceDataScore(current.card)) current.card = faceAware;
    } else {
      byPhysicalCard.set(key, { qty, name: faceAware.name, names: [name], card: faceAware });
    }
  }
  return { entries: [...byPhysicalCard.values()], missing };
}

function build(decklist, idx, options = {}) {
  const buildOptions = Object.assign({}, DEFAULT_BUILD_OPTIONS, options);
  const nodes = [], missing = [];
  let commanderAssigned = false;
  const merged = mergeDecklistEntries(decklist, idx);
  missing.push(...merged.missing);
  for (const { qty, card } of merged.entries) {
    const faceClassified = FACE_CLASSIFICATION.classifyFaceAwareCard(card, MODEL);
    const c = faceClassified.faceAware;
    const cls = faceClassified.aggregate;
    let role = cls.role;
    if (!commanderAssigned && isCommanderish(c)) { role = "commander"; commanderAssigned = true; }
    nodes.push({
      id: c.name, qty, role,
      cmc: c.cmc != null ? c.cmc : 0,
      type: c.type_line || "", mana: c.mana_cost || "",
      text: (c.oracle_text || "").replace(/\r/g, ""),
      ci: c.color_identity || [],
      edh: c.edhrec_rank || null,
      layout: c.layout,
      aliases: c.aliases,
      faces: c.faces,
      faceFacts: faceClassified.faceFacts,
      factSources: faceClassified.factSources,
      faceCompatibilityWarnings: faceClassified.faceCompatibilityWarnings,
      cardKey: c.cardKey,
      canonicalName: c.canonicalName,
      produces: cls.produces, consumes: cls.consumes, zones: cls.zones,
      myTypes: cls.myTypes, tribalRefs: cls.tribalRefs, caps: cls.caps,
    });
  }
  // card<->card interaction edges (subject-aware: see interaction-model.js)
  const edges = [], seen = {};
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      const ints = FACE_CLASSIFICATION.annotateInteractionsWithFaceEvidence(a, b, MODEL.interactionsBetween(a, b));
      if (ints.length) {
        const key = [a.id, b.id].sort().join("||");
        if (!seen[key]) {
          seen[key] = 1;
          edges.push({ source: a.id, target: b.id, interactions: ints, events: MODEL.eventsFromInteractions ? MODEL.eventsFromInteractions(ints) : ints.map(x => x.event || x.family) });
        }
      }
    }
  }
  // card<->zone edges
  const zoneEdges = [];
  for (const n of nodes) for (const z of n.zones) zoneEdges.push({ source: n.id, target: z });

  // degree = interactivity score (card-card edges only)
  const deg = {}; nodes.forEach(n => deg[n.id] = 0);
  edges.forEach(e => { deg[e.source]++; deg[e.target]++; });
  nodes.forEach(n => n.degree = deg[n.id]);

  // append zone nodes
  for (const z of MODEL.ZONES) nodes.push({
    id: z.id, role: "zone", zoneLabel: z.label, color: z.color, fixed: { x: z.x, y: z.y },
    cmc: 0, type: "Game zone", mana: "", text: z.text, qty: 0,
    produces: {}, consumes: {}, zones: [], degree: 0,
  });

  const graph = { nodes, edges, zoneEdges, zones: MODEL.ZONES, eventLabels: MODEL.EVENT_LABEL, missing };
  if (buildOptions.includeInteractionProofs) {
    graph.interactionProofs = PROOF_PACKAGES.buildInteractionProofPackages(nodes);
    applyInteractionProofCounts(graph.nodes, graph.interactionProofs);
  }
  graph.metrics = METRICS.compute(graph);
  return graph;
}

function applyInteractionProofCounts(nodes, proofs = []) {
  const counts = new Map();
  for (const proof of proofs) {
    for (const card of new Set(proof.cards || [])) counts.set(card, (counts.get(card) || 0) + 1);
  }
  for (const node of nodes) node.comboPackageCount = counts.get(node.id) || 0;
}


// ---------------------------------------------------------------- emit HTML
function emit(payload) {
  const tpl = fs.readFileSync(path.join(__dirname, "legacy-template.html"), "utf8");
  const modelSrc = fs.readFileSync(path.join(__dirname, "interaction-model.js"), "utf8");
  const metricsSrc = fs.readFileSync(path.join(__dirname, "metrics.js"), "utf8");
  // Optional Moxfield CORS proxy URL, baked in for the published (static) site
  // so live "Add Moxfield deck" works in the browser. Empty for local maps.
  const proxy = process.env.MOXFIELD_PROXY || "";
  return tpl
    .replace("/*__MODEL__*/", () => modelSrc + "\n" + metricsSrc)
    .replace("/*__CANDIDATES__*/ []", () => htmlJson(candidateIndex(loadCards())))
    .replace('/*__TITLE__*/ "Deck"', () => JSON.stringify(payload.decks[payload.active].title))
    .replace("/*__DATA__*/ {decks:[],active:0}", () => JSON.stringify(payload))
    .replace('/*__MOXFIELD_PROXY__*/ ""', () => JSON.stringify(proxy));
}

// resolve one source (file path or Moxfield URL) -> {title, decklist}
async function resolveSource(src, idx) {
  const id = moxfieldId(src);
  if (id) { const { decklist, title } = await fetchMoxfield(id); return { title, decklist }; }
  if (!fs.existsSync(src)) throw new Error("Source not found: " + src);
  return { title: path.basename(src).replace(/\.[^.]+$/, ""), decklist: parseDecklist(fs.readFileSync(src, "utf8")) };
}

function fmtMetrics(m) {
  return `    win ${m.winTuningScore}/100 (${m.winTuningBand}) · cohesion ${m.cohesionScore}/100 (${m.cohesionBand}) · self ${m.selfSufficiencyScore}/100 · ${m.pctInteractive}% interactive · `
    + `avg ${m.avgDegree} · ${m.edgeCount} edges · biggest web ${m.largestWebShare}% · ${m.islandCount} islands`;
}

// ---------------------------------------------------------------- main
async function main() {
  const argv = process.argv.slice(2);
  let outPath = path.join(ROOT, "deck-map.html");   // default output lands in the root workspace
  const sources = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "-o" || argv[i] === "--out") { outPath = argv[++i]; continue; }
    sources.push(argv[i]);
  }
  if (!sources.length) sources.push(path.join(ROOT, "data/sample-decklist.txt"));

  const idx = loadCards();
  const decks = [];
  for (const src of sources) {
    process.stdout.write(`• ${src}\n`);
    let resolved;
    try { resolved = await resolveSource(src, idx); }
    catch (e) { console.error("  ✗ " + e.message); continue; }
    const graph = build(resolved.decklist, idx, { includeInteractionProofs: true });
    if (graph.missing.length) console.warn("  ⚠ skipped (not found): " + graph.missing.join(", "));
    decks.push({ title: resolved.title, graph });
    console.log(`  ✓ ${resolved.title}`);
    console.log(fmtMetrics(graph.metrics));
  }
  if (!decks.length) { console.error("No decks built."); process.exit(1); }

  fs.writeFileSync(outPath, emit({ decks, active: 0 }));
  console.log(`\n✓ ${outPath}  (${decks.length} deck${decks.length > 1 ? "s" : ""})`);
  if (decks.length > 1) {
    console.log("\n  Comparison:");
    console.log("    " + "deck".padEnd(28) + "win  cohesion  self  %inter  avgDeg  edges  web%  islands");
    for (const d of decks) { const m = d.graph.metrics;
      console.log("    " + d.title.slice(0, 27).padEnd(28) +
        String(m.winTuningScore).padEnd(5) + String(m.cohesionScore).padEnd(10) +
        String(m.selfSufficiencyScore).padEnd(6) + (m.pctInteractive + "%").padEnd(8) +
        String(m.avgDegree).padEnd(8) + String(m.edgeCount).padEnd(7) +
        (m.largestWebShare + "%").padEnd(6) + m.islandCount); }
  }
}
// Run as a CLI; export helpers when required as a module (e.g. validation harness).
if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(1); });
} else {
  module.exports = { DEFAULT_BUILD_OPTIONS, loadCards, build, fetchMoxfield, resolveSource, parseDecklist, moxfieldId, candidateIndex };
}
