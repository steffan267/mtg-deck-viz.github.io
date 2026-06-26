#!/usr/bin/env node
/*
 * audit-interaction-index-performance.js — local corpus timing for semantic
 * interaction indexes. This is an audit command, not a deterministic artifact:
 * timings vary by machine, so checkpoint the output instead of committing it.
 */
const { performance } = require('node:perf_hooks');
const { candidateIndex, loadCards } = require('../src/build-deck-viz');
const { createProgress } = require('../lib/progress');
const {
  buildInteractionIndexes,
  candidateClosures,
  candidatePairs,
  candidateTriples,
} = require('../src/interaction-indexes');

function parseArgs(argv) {
  const out = { limit: null, sample: ['Sol Ring', 'Heartstone', 'Smothering Tithe', 'Deadeye Navigator', 'Peregrine Drake'] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--limit') { out.limit = parseInt(argv[++i], 10); continue; }
    if (a === '--sample') { out.sample = String(argv[++i] || '').split('|').map(s => s.trim()).filter(Boolean); continue; }
    if (a === '--help' || a === '-h') {
      process.stdout.write('Usage: node scripts/audit-interaction-index-performance.js [--limit N] [--sample Name|Name]\n');
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${a}`);
  }
  return out;
}

function ms(start, end) {
  return Math.round((end - start) * 10) / 10;
}

function toIndexableCard(card) {
  return {
    id: card.name,
    name: card.name,
    type_line: card.type,
    oracle_text: card.text,
    cmc: card.cmc,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const loadStart = performance.now();
  let cards = candidateIndex(loadCards()).map(toIndexableCard);
  if (Number.isFinite(args.limit) && args.limit > 0) cards = cards.slice(0, args.limit);
  const loadEnd = performance.now();
  const progress = createProgress('interaction-index-performance', 3, { every: 1 });
  progress.start(`cards=${cards.length}`);
  const indexStart = performance.now();
  const indexes = buildInteractionIndexes(cards);
  const indexEnd = performance.now();
  progress.tick(1, 'indexes-built');

  const samples = {};
  const sampleProgress = createProgress('interaction-index-samples', args.sample.length, { every: 1 });
  sampleProgress.start();
  for (let i = 0; i < args.sample.length; i++) {
    const name = args.sample[i];
    if (!indexes.cardsById[name]) {
      sampleProgress.tick(i + 1, `missing=${name}`);
      continue;
    }
    const pairStart = performance.now();
    const pairs = candidatePairs(name, indexes, { limit: 25 });
    const pairEnd = performance.now();
    const tripleStart = performance.now();
    const triples = candidateTriples(name, indexes, { limit: 25 });
    const tripleEnd = performance.now();
    samples[name] = {
      pairCount: pairs.length,
      tripleCount: triples.length,
      pairMs: ms(pairStart, pairEnd),
      tripleMs: ms(tripleStart, tripleEnd),
      firstPairs: pairs.slice(0, 3),
      firstTriples: triples.slice(0, 3),
    };
    sampleProgress.tick(i + 1, `last=${name}`);
  }
  sampleProgress.done(`samples=${Object.keys(samples).length}`);
  progress.tick(2, 'samples-tested');

  const closureStart = performance.now();
  const closures = candidateClosures([
    { kind: 'event.produces', event: 'tokens' },
    { kind: 'event.consumes', event: 'mana' },
    { kind: 'capability', predicate: 'is-token-doubler' },
  ], indexes);
  const closureEnd = performance.now();
  progress.tick(3, `closures=${closures.candidates.length}`);
  progress.done('ready');

  process.stdout.write(JSON.stringify({
    cardCount: cards.length,
    loadMs: ms(loadStart, loadEnd),
    indexBuildMs: ms(indexStart, indexEnd),
    stats: indexes.stats,
    indexSizes: {
      producedEvents: Object.keys(indexes.byProducedEvent).length,
      consumedEvents: Object.keys(indexes.byConsumedEvent).length,
      capabilities: Object.keys(indexes.byCapability).length,
      tokenDoublers: (indexes.modifiers.tokenDoublers.tokens || []).length,
      costReducerScopes: Object.keys(indexes.modifiers.costReducers).length,
    },
    closureMs: ms(closureStart, closureEnd),
    closureCandidateCount: closures.candidates.length,
    samples,
  }, null, 2) + '\n');
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.stack || error);
    process.exit(1);
  }
}
