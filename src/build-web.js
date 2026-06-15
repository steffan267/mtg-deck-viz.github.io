#!/usr/bin/env node
/*
 * build-web.js — generate the GitHub Pages site.
 *
 * Produces a self-contained root index.html for branch-based GitHub Pages,
 * plus docs/index.html for the Actions deploy artifact. Both are seeded with
 * the bundled sample deck and include .nojekyll markers so GitHub serves the HTML as-is.
 * The live "Add Moxfield deck" feature in the published page routes through the
 * CORS proxy named in the MOXFIELD_PROXY env var (see deploy/moxfield-proxy/);
 * with no proxy set, file/paste import still works and Moxfield import degrades
 * gracefully.
 *
 *   MOXFIELD_PROXY="https://…workers.dev" node src/build-web.js
 *   node src/build-web.js                  # no proxy (file import only)
 */
const fs = require("fs");
const path = require("path");
const { loadCards, resolveSource, build, candidateIndex } = require("./build-deck-viz.js");
// emit() is not exported; re-read the template ourselves to keep build-web
// independent. Reuse the same placeholder contract as build-deck-viz emit().
const ROOT = path.resolve(__dirname, "..");
const DOCS = path.join(ROOT, "docs");
const ROOT_INDEX = path.join(ROOT, "index.html");
const SAMPLE = path.join(ROOT, "data/sample-decklist.txt");

function htmlJson(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function emit(payload, candidates) {
  const tpl = fs.readFileSync(path.join(__dirname, "template.html"), "utf8");
  const modelSrc = fs.readFileSync(path.join(__dirname, "interaction-model.js"), "utf8");
  const metricsSrc = fs.readFileSync(path.join(__dirname, "metrics.js"), "utf8");
  const proxy = process.env.MOXFIELD_PROXY || "";
  return tpl
    .replace("/*__MODEL__*/", () => modelSrc + "\n" + metricsSrc)
    .replace("/*__CANDIDATES__*/ []", () => htmlJson(candidates || []))
    .replace('/*__TITLE__*/ "Deck"', () => JSON.stringify(payload.decks[payload.active].title))
    .replace("/*__DATA__*/ {decks:[],active:0}", () => JSON.stringify(payload))
    .replace('/*__MOXFIELD_PROXY__*/ ""', () => JSON.stringify(proxy));
}

async function main() {
  const idx = loadCards();
  const candidates = candidateIndex(idx);
  const { decklist } = await resolveSource(SAMPLE, idx);
  const graph = build(decklist, idx);
  const title = "Sample deck — Xantcha";   // friendly default; users add their own decks live
  fs.mkdirSync(DOCS, { recursive: true });
  const html = emit({ decks: [{ title, graph }], active: 0 }, candidates);
  fs.writeFileSync(path.join(DOCS, "index.html"), html);
  fs.writeFileSync(ROOT_INDEX, html);
  fs.writeFileSync(path.join(DOCS, ".nojekyll"), "");
  fs.writeFileSync(path.join(ROOT, ".nojekyll"), "");
  const proxy = process.env.MOXFIELD_PROXY || "";
  console.log(`✓ index.html and docs/index.html  (sample: ${title}, candidates: ${candidates.length})`);
  console.log(`  Moxfield proxy: ${proxy ? proxy : "(none — file/paste import only)"}`);
}
main().catch(e => { console.error(e); process.exit(1); });
