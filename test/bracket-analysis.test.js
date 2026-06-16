const assert = require("node:assert/strict");
const ANALYSIS = require("../lib/bracket-analysis");

function main() {
  const rows = [
    { sourceBracket: 1, win: 10, cohesion: 40, self: 20 },
    { sourceBracket: 1, win: 12, cohesion: 42, self: 22 },
    { sourceBracket: 3, win: 50, cohesion: 30, self: 60 },
    { sourceBracket: 3, win: 52, cohesion: 32, self: 62 },
    { sourceBracket: 5, win: 90, cohesion: 10, self: 80 },
    { sourceBracket: 5, win: 88, cohesion: 12, self: 78 },
  ];

  const summary = ANALYSIS.sourceBracketSummary(rows);
  assert.deepEqual(summary.map(row => row.label), ["B1", "B3", "B5"]);
  assert.equal(summary[0].meanWin, 11);
  assert.equal(summary[1].medianSelf, 62);

  const exact = ANALYSIS.centroidAccuracy(rows, bracket => String(bracket));
  assert.equal(exact.n, 6);
  assert.equal(exact.accuracy, 1);
  assert.equal(ANALYSIS.nearestCentroid({ win: 89, cohesion: 11, self: 79 }, exact.centroids), "5");

  const coarse = ANALYSIS.centroidAccuracy(rows, ANALYSIS.coarseBucket);
  assert.equal(coarse.accuracy, 1);

  const report = ANALYSIS.buildBracketAnalysis(rows);
  const md = ANALYSIS.renderMarkdown(report, "data/example.json");
  assert.match(md, /Exact source-bracket accuracy/);
  assert.match(md, /B1/);

  process.stdout.write("Bracket analysis tests passed\n");
}

main();
