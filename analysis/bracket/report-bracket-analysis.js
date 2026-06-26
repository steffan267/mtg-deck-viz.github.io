#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const ANALYSIS = require("../../lib/bracket-analysis");
const { createProgress } = require("../../lib/progress");

const DEFAULT_CORPUS = path.join(__dirname, "moxfield-bracket-corpus.json");
const DEFAULT_OUT = path.join(__dirname, "moxfield-bracket-report.md");
const DEFAULT_JSON_OUT = path.join(__dirname, "moxfield-bracket-report.json");

function usage() {
  console.error("Usage: node analysis/bracket/report-bracket-analysis.js [--corpus file] [--out file] [--json-out file]");
  process.exit(2);
}

function parseArgs(argv) {
  const opts = { corpus: DEFAULT_CORPUS, out: DEFAULT_OUT, jsonOut: DEFAULT_JSON_OUT };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--corpus") opts.corpus = argv[++i];
    else if (arg === "--out") opts.out = argv[++i];
    else if (arg === "--json-out") opts.jsonOut = argv[++i];
    else if (arg === "--help") usage();
    else usage();
  }
  return opts;
}

function writeFile(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const corpus = JSON.parse(fs.readFileSync(opts.corpus, "utf8"));
  const rows = ANALYSIS.rowsFromCorpus(corpus);
  const progress = createProgress("bracket-analysis-report", rows.length, { every: Math.max(1, rows.length) });
  progress.start(`corpus=${opts.corpus}`);
  const report = ANALYSIS.buildBracketAnalysis(rows);
  progress.done(`rows=${rows.length}`);
  const markdown = ANALYSIS.renderMarkdown(report, opts.corpus);
  writeFile(opts.out, markdown + "\n");
  writeFile(opts.jsonOut, JSON.stringify(report, null, 2) + "\n");
  console.log(`wrote ${opts.out}`);
  console.log(`wrote ${opts.jsonOut}`);
  console.log(`exact source-bracket accuracy ${(report.exactSourceBracket.accuracy * 100).toFixed(2)}%`);
  console.log(`within ±1 source bracket ${(report.withinOneSourceBracket.accuracy * 100).toFixed(2)}%`);
  console.log(`coarse low/mid/high accuracy ${(report.coarseBuckets.accuracy * 100).toFixed(2)}%`);
}

if (require.main === module) main();
