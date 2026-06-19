const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const CACHE = require('../analysis/bracket/cache-reference-decks.js');

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'reference-deck-cache-'));
  const sampleFile = path.join(tmp, 'sample.json');
  const outFile = path.join(tmp, 'cache.json');

  fs.writeFileSync(sampleFile, JSON.stringify({
    decks: [
      { id: 'deck-a', name: 'Alpha', bracket: 2, likes: 10, url: 'https://moxfield.com/decks/deck-a', bracketRank: 1 },
      { id: 'deck-b', name: 'Beta', bracket: 3, likes: 5, bracketRank: 1 },
    ],
  }, null, 2));

  const parsed = CACHE.parseArgs(['--sample', sampleFile, '--out', outFile, '--limit', '1', '--delay-ms', '25', '--retries', '2', '--force', '--fail-fast']);
  assert.equal(parsed.sample, sampleFile);
  assert.equal(parsed.out, outFile);
  assert.equal(parsed.limit, 1);
  assert.equal(parsed.delayMs, 25);
  assert.equal(parsed.retries, 2);
  assert.equal(parsed.force, true);
  assert.equal(parsed.failFast, true);

  assert.deepEqual(CACHE.loadReferenceDecks(sampleFile).map(deck => deck.id), ['deck-a', 'deck-b']);

  const record = CACHE.toCachedDeck({ id: 'deck-a', name: 'Alpha', bracket: 2, likes: 10, bracketRank: 1 }, {
    title: 'Alpha Deck',
    decklist: [
      { qty: 1, name: 'Sol Ring', resolved: { name: 'Sol Ring', type_line: 'Artifact' } },
      { qty: 0, name: '' },
    ],
  });
  assert.equal(record.title, 'Alpha Deck');
  assert.equal(record.sourceBracket, 2);
  assert.equal(record.decklist.length, 1);
  assert.deepEqual(record.decklist[0], { qty: 1, name: 'Sol Ring', resolved: { name: 'Sol Ring', type_line: 'Artifact' } });

  const sampleDecks = CACHE.loadReferenceDecks(sampleFile);
  const recordsById = new Map([[record.id, record]]);
  const failuresById = new Map([['deck-b', { id: 'deck-b', error: 'boom' }]]);
  const built = CACHE.buildOutput(sampleFile, sampleDecks, recordsById, failuresById);
  assert.equal(built.meta.requestedDecks, 2);
  assert.equal(built.meta.cachedDecks, 1);
  assert.equal(built.meta.failedDecks, 1);
  assert.equal(built.meta.complete, false);
  assert.deepEqual(built.decks.map(deck => deck.id), ['deck-a']);
  assert.deepEqual(built.failures.map(failure => failure.id), ['deck-b']);

  const fetchedIds = [];
  const payload = await CACHE.cacheReferenceDecks({
    sample: sampleFile,
    out: outFile,
    limit: 2,
    delayMs: 1,
    retries: 1,
    force: false,
    failFast: false,
  }, async id => {
    fetchedIds.push(id);
    return { title: `Title ${id}`, decklist: [{ qty: 1, name: `Card ${id}` }] };
  });
  assert.equal(payload.meta.complete, true);
  assert.equal(payload.meta.cachedDecks, 2);
  assert.deepEqual(fetchedIds, ['deck-a', 'deck-b']);

  const loaded = CACHE.loadDeckCache(outFile);
  assert.equal(loaded.decks.length, 2);
  assert.deepEqual(loaded.failures, []);

  process.stdout.write('Reference deck cache tests passed\n');
}

main().catch(err => { console.error(err); process.exit(1); });
