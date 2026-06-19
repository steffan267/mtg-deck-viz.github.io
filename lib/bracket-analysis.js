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

function percentile(values, q) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * q) - 1));
  return sorted[index];
}

function round(value, digits = 2) {
  return +value.toFixed(digits);
}

function countBy(values, preferredOrder = []) {
  const counts = {};
  for (const value of values || []) {
    const key = value == null || value === "" ? "Unknown" : String(value);
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => {
    const ai = preferredOrder.indexOf(a[0]);
    const bi = preferredOrder.indexOf(b[0]);
    if (ai !== -1 || bi !== -1) return (ai === -1 ? Number.MAX_SAFE_INTEGER : ai) - (bi === -1 ? Number.MAX_SAFE_INTEGER : bi);
    return a[0].localeCompare(b[0]);
  }));
}

function statSummary(values) {
  const nums = (values || []).filter(value => Number.isFinite(value));
  if (!nums.length) return { min: 0, p25: 0, median: 0, mean: 0, p75: 0, max: 0 };
  const sorted = nums.slice().sort((a, b) => a - b);
  return {
    min: sorted[0],
    p25: percentile(sorted, 0.25),
    median: median(sorted),
    mean: round(mean(sorted)),
    p75: percentile(sorted, 0.75),
    max: sorted[sorted.length - 1],
  };
}

function formatCounts(counts) {
  const entries = Object.entries(counts || {});
  return entries.length ? entries.map(([label, count]) => `${label}: ${count}`).join("; ") : "none";
}

function cardFrequency(rows) {
  const counts = {};
  for (const row of rows || []) {
    for (const card of row.gcCards || []) counts[card] = (counts[card] || 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([card, count]) => ({ card, count }));
}

function representativeDeck(row) {
  return {
    name: row.name,
    id: row.id,
    win: row.win || 0,
    band: row.band || "Unknown",
    gc: row.gc || 0,
    modelBracket: row.bracket ? `B${row.bracket}` : "Unknown",
  };
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

function sourceBracketBreakdown(rows) {
  const byBracket = new Map();
  for (const row of rowsWithSourceBracket(rows)) {
    const key = row.sourceBracket;
    const group = byBracket.get(key) || [];
    group.push(row);
    byBracket.set(key, group);
  }
  return [...byBracket.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([sourceBracket, group]) => {
      const byWinAsc = group.slice().sort((a, b) => (a.win || 0) - (b.win || 0) || String(a.name).localeCompare(String(b.name)));
      const byWinDesc = byWinAsc.slice().reverse();
      return {
        sourceBracket,
        label: bucketLabel(sourceBracket),
        count: group.length,
        metrics: {
          win: statSummary(group.map(row => row.win || 0)),
          cohesion: statSummary(group.map(row => row.cohesion || 0)),
          self: statSummary(group.map(row => row.self || 0)),
          gameChangers: statSummary(group.map(row => row.gc || 0)),
        },
        bands: countBy(group.map(row => row.band), ["Untuned", "Casual", "Focused", "Tuned to win", "Highly tuned"]),
        modelBrackets: countBy(group.map(row => row.bracket ? `B${row.bracket}` : "Unknown"), ["B1", "B2", "B3", "B4", "B5"]),
        topGameChangers: cardFrequency(group).slice(0, 8),
        topByWin: byWinDesc.slice(0, 3).map(representativeDeck),
        bottomByWin: byWinAsc.slice(0, 3).map(representativeDeck),
      };
    });
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
    sourceBracketBreakdown: sourceBracketBreakdown(filtered),
    exactSourceBracket: centroidAccuracy(filtered, sourceBracket => String(sourceBracket)),
    withinOneSourceBracket: centroidAccuracy(filtered, sourceBracket => String(sourceBracket), true),
    coarseBuckets: centroidAccuracy(filtered, coarseBucket),
  };
}

function renderMetricSummaryTable(metrics) {
  const labels = [
    ["Win", metrics.win],
    ["Cohesion", metrics.cohesion],
    ["Self-sufficiency", metrics.self],
    ["Game Changers", metrics.gameChangers],
  ];
  return [
    "| Metric | Min | P25 | Median | Mean | P75 | Max |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...labels.map(([label, stats]) => `| ${label} | ${stats.min} | ${stats.p25} | ${stats.median} | ${stats.mean} | ${stats.p75} | ${stats.max} |`),
  ];
}

function renderDeckList(rows) {
  if (!rows.length) return "none";
  return rows.map(row => `${row.name} (${row.win}, ${row.band}, GC${row.gc}, model ${row.modelBracket})`).join("; ");
}

function renderTopCards(rows) {
  return rows.length ? rows.map(row => `${row.card} ×${row.count}`).join("; ") : "none";
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
    "## Per-bracket baseline detail",
    "",
    ...report.sourceBracketBreakdown.flatMap(row => [
      `### ${row.label} (${row.count} decks)`,
      "",
      ...renderMetricSummaryTable(row.metrics),
      "",
      `- Win bands: ${formatCounts(row.bands)}`,
      `- Model bracket hints: ${formatCounts(row.modelBrackets)}`,
      `- Top Game Changers: ${renderTopCards(row.topGameChangers)}`,
      `- Highest win examples: ${renderDeckList(row.topByWin)}`,
      `- Lowest win examples: ${renderDeckList(row.bottomByWin)}`,
      "",
    ]),
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
  percentile,
  statSummary,
  countBy,
  sourceBracketSummary,
  sourceBracketBreakdown,
  computeCentroids,
  nearestCentroid,
  centroidAccuracy,
  buildBracketAnalysis,
  renderMarkdown,
};
