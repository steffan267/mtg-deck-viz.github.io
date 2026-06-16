const SOURCE_BUCKET = {
  1: "B1",
  2: "B2",
  3: "B3",
  4: "B4",
  5: "B5",
};

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function round(value, digits = 2) {
  return +value.toFixed(digits);
}

function rowsFromCorpus(raw) {
  if (Array.isArray(raw)) return raw;
  return Array.isArray(raw && raw.results) ? raw.results : [];
}

function rowsWithSourceBracket(rows) {
  return (rows || []).filter(row => Number.isInteger(row.sourceBracket) && SOURCE_BUCKET[row.sourceBracket]);
}

function bucketLabel(sourceBracket) {
  return SOURCE_BUCKET[sourceBracket] || null;
}

function coarseBucket(sourceBracket) {
  if (sourceBracket <= 2) return "low";
  if (sourceBracket === 3) return "mid";
  if (sourceBracket >= 4) return "high";
  return null;
}

function sourceBracketSummary(rows) {
  const byBracket = new Map();
  for (const row of rowsWithSourceBracket(rows)) {
    const key = row.sourceBracket;
    const group = byBracket.get(key) || [];
    group.push(row);
    byBracket.set(key, group);
  }
  return [...byBracket.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([sourceBracket, group]) => ({
      sourceBracket,
      label: bucketLabel(sourceBracket),
      count: group.length,
      meanWin: round(mean(group.map(row => row.win || 0))),
      meanCohesion: round(mean(group.map(row => row.cohesion || 0))),
      meanSelf: round(mean(group.map(row => row.self || 0))),
      medianWin: median(group.map(row => row.win || 0)),
      medianCohesion: median(group.map(row => row.cohesion || 0)),
      medianSelf: median(group.map(row => row.self || 0)),
    }));
}

function computeCentroids(rows, labelOf) {
  const sums = new Map();
  for (const row of rowsWithSourceBracket(rows)) {
    const label = labelOf(row.sourceBracket);
    if (!label) continue;
    const next = sums.get(label) || { n: 0, win: 0, cohesion: 0, self: 0 };
    next.n++;
    next.win += row.win || 0;
    next.cohesion += row.cohesion || 0;
    next.self += row.self || 0;
    sums.set(label, next);
  }
  return Object.fromEntries([...sums.entries()].map(([label, sum]) => [label, {
    win: round(sum.win / sum.n, 4),
    cohesion: round(sum.cohesion / sum.n, 4),
    self: round(sum.self / sum.n, 4),
  }]));
}

function nearestCentroid(row, centroids) {
  let best = null;
  for (const [label, centroid] of Object.entries(centroids || {})) {
    const distance = (row.win - centroid.win) ** 2
      + (row.cohesion - centroid.cohesion) ** 2
      + (row.self - centroid.self) ** 2;
    if (!best || distance < best.distance) best = { label, distance };
  }
  return best ? best.label : null;
}

function centroidAccuracy(rows, labelOf, allowAdjacent = false) {
  const filtered = rowsWithSourceBracket(rows);
  const centroids = computeCentroids(filtered, labelOf);
  const confusion = {};
  let correct = 0;
  for (const row of filtered) {
    const actual = labelOf(row.sourceBracket);
    const predicted = nearestCentroid(row, centroids);
    const key = `${actual}->${predicted}`;
    confusion[key] = (confusion[key] || 0) + 1;
    if (allowAdjacent && /^\d+$/.test(actual) && /^\d+$/.test(predicted)) {
      if (Math.abs(Number(actual) - Number(predicted)) <= 1) correct++;
    } else if (predicted === actual) {
      correct++;
    }
  }
  return {
    n: filtered.length,
    accuracy: filtered.length ? round(correct / filtered.length, 4) : 0,
    centroids,
    confusion,
  };
}

function buildBracketAnalysis(rows) {
  const filtered = rowsWithSourceBracket(rows);
  return {
    deckCount: filtered.length,
    sourceBracketSummary: sourceBracketSummary(filtered),
    exactSourceBracket: centroidAccuracy(filtered, sourceBracket => String(sourceBracket)),
    withinOneSourceBracket: centroidAccuracy(filtered, sourceBracket => String(sourceBracket), true),
    coarseBuckets: centroidAccuracy(filtered, coarseBucket),
  };
}

function renderMarkdown(report, corpusPath) {
  const lines = [
    "# Moxfield bracket metric analysis",
    "",
    `Corpus: \`${corpusPath}\``,
    "",
    `Decks analyzed: **${report.deckCount}**`,
    "",
    "## Source bracket summary",
    "",
    "| Source bracket | Decks | Mean win | Mean cohesion | Mean self | Median win | Median cohesion | Median self |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...report.sourceBracketSummary.map(row => `| ${row.label} | ${row.count} | ${row.meanWin} | ${row.meanCohesion} | ${row.meanSelf} | ${row.medianWin} | ${row.medianCohesion} | ${row.medianSelf} |`),
    "",
    "## Centroid classifier results",
    "",
    `- Exact source-bracket accuracy from {win, cohesion, self}: **${round(report.exactSourceBracket.accuracy * 100, 2)}%**`,
    `- Within ±1 source bracket from {win, cohesion, self}: **${round(report.withinOneSourceBracket.accuracy * 100, 2)}%**`,
    `- Coarse bucket accuracy (B1-2 low / B3 mid / B4-5 high): **${round(report.coarseBuckets.accuracy * 100, 2)}%**`,
    "",
    "## Interpretation",
    "",
    "- The three metrics encode a real power trend, especially from low brackets to high brackets.",
    "- They are not reliable enough on their own for exact Moxfield bracket deduction.",
    "- Exact bracketing likely also needs features such as Game Changers, tutor density, fast mana, and combo/archetype signals.",
    "",
  ];
  return lines.join("\n");
}

module.exports = {
  rowsFromCorpus,
  rowsWithSourceBracket,
  bucketLabel,
  coarseBucket,
  sourceBracketSummary,
  computeCentroids,
  nearestCentroid,
  centroidAccuracy,
  buildBracketAnalysis,
  renderMarkdown,
};
