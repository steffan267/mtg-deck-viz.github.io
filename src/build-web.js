#!/usr/bin/env node
/*
 * build-web.js — generate the Vue/Vite GitHub Pages site.
 *
 * Builds the bundled sample deck, writes browser bootstrap JSON, runs Vite,
 * then copies the static build to docs/ for GitHub Actions Pages deployment
 * and to the repository root for branch-root Pages publishing.
 */
const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const { loadCards, resolveSource, build, candidateIndex } = require("./build-deck-viz.js");

const ROOT = path.resolve(__dirname, "..");
const DOCS = path.join(ROOT, "docs");
const DIST = path.join(ROOT, "dist/web");
const SAMPLE = path.join(ROOT, "data/sample-decklist.txt");
const GENERATED = path.join(ROOT, "src/web/generated");
const ROOT_GENERATED_FILES = ["index.html", "bootstrap-data.json", ".nojekyll"];

function rmrf(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

function removeRootPagesArtifacts() {
  for (const file of ROOT_GENERATED_FILES) rmrf(path.join(ROOT, file));
  rmrf(path.join(ROOT, "assets"));
  for (const file of fs.readdirSync(ROOT)) {
    if (/^recommendation\.worker-.*\.js$/.test(file)) rmrf(path.join(ROOT, file));
  }
}

function htmlJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function inlineBuiltAssets(html, bootstrap) {
  html = html.replace(/<link rel=\"stylesheet\" crossorigin href=\"(\.\/assets\/[^\"]+\.css)\">/g, (_, href) => {
    const css = fs.readFileSync(path.join(DIST, href.replace(/^\.\//, '')), 'utf8');
    return `<style>${css}</style>`;
  });
  html = html.replace(/<script type=\"module\" crossorigin src=\"(\.\/assets\/[^\"]+\.js)\"><\/script>/g, (_, src) => {
    const js = fs.readFileSync(path.join(DIST, src.replace(/^\.\//, '')), 'utf8');
    const globals = `<script>window.__MTG_BOOTSTRAP_URL__ = "./bootstrap-data.json";window.__MOXFIELD_PROXY__ = ${JSON.stringify(bootstrap.moxfieldProxy || '')};</script>`;
    return `${globals}<script type=\"module\">${js}</script>`;
  });
  return html;
}

async function writeBootstrap() {
  const idx = loadCards();
  const candidates = candidateIndex(idx);
  const { decklist } = await resolveSource(SAMPLE, idx);
  const graph = build(decklist, idx);
  const title = "Sample deck — Xantcha";
  const bootstrap = {
    decks: [{ title, graph }],
    active: 0,
    candidates,
    title,
    moxfieldProxy: process.env.MOXFIELD_PROXY || "",
    generatedAt: new Date().toISOString(),
  };
  fs.mkdirSync(GENERATED, { recursive: true });
  fs.writeFileSync(path.join(GENERATED, "bootstrap-data.json"), JSON.stringify(bootstrap));
  return bootstrap;
}

async function main() {
  const bootstrap = await writeBootstrap();
  rmrf(DIST);
  cp.execFileSync(path.join(ROOT, "node_modules/.bin/vite"), ["build"], { cwd: ROOT, stdio: "inherit" });
  rmrf(DOCS);
  copyDir(DIST, DOCS);
  fs.copyFileSync(path.join(GENERATED, "bootstrap-data.json"), path.join(DOCS, "bootstrap-data.json"));
  const inlined = inlineBuiltAssets(fs.readFileSync(path.join(DOCS, "index.html"), "utf8"), bootstrap);
  fs.writeFileSync(path.join(DOCS, "index.html"), inlined);
  for (const asset of fs.readdirSync(path.join(DOCS, "assets"))) {
    if (/^recommendation\.worker-.*\.js$/.test(asset)) fs.copyFileSync(path.join(DOCS, "assets", asset), path.join(DOCS, asset));
  }
  fs.writeFileSync(path.join(DOCS, ".nojekyll"), "");
  removeRootPagesArtifacts();
  copyDir(DOCS, ROOT);
  console.log(`✓ Vue site built to docs/ and repository root (sample: ${bootstrap.title}, candidates: ${bootstrap.candidates.length})`);
  console.log(`  Moxfield proxy: ${process.env.MOXFIELD_PROXY || "(none — file/paste import only)"}`);
}

main().catch(e => { console.error(e); process.exit(1); });
