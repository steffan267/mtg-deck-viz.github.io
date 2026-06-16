const assert = require("node:assert/strict");
const SAMPLE = require("../lib/moxfield-bracket-sample");

function main() {
  const q = SAMPLE.encodePublicBracketQuery(4);
  assert.ok(typeof q === "string" && q.length > 20);

  const parsed = SAMPLE.parseJinaJson('Title: x\n\n{"pageNumber":2,"data":[{"publicId":"abc","format":"commander","bracket":4,"likeCount":9}]}');
  assert.equal(parsed.pageNumber, 2);
  assert.equal(parsed.data[0].publicId, 'abc');

  const md = `[Primer Winota: Snowball Stax _Commander_·4 Comment Count is 169 Like Count is 1,884 View Count is 540,654](https://moxfield.com/decks/j-0aJlxuOUm9FnKRvJcfZw)\n\n[Sauron, the Dark Lord _Commander_·3*Comment Count is 18 Like Count is 768 View Count is 135,763](https://moxfield.com/decks/OYWg_0g7AkuzUapuc2DPpw)`;
  const page = SAMPLE.parsePublicBracketPage(md, 4);
  assert.equal(page.length, 2);
  assert.equal(page[0].id, 'j-0aJlxuOUm9FnKRvJcfZw');
  assert.equal(page[0].likes, 1884);
  assert.equal(page[0].bracket, 4);
  assert.equal(page[1].inlineBracket, 3);
  assert.equal(page[1].requestedBracket, 4);
  assert.equal(page[1].bracket, 3);

  assert.ok(SAMPLE.isCommanderDeck({ format: 'commander', publicId: 'x', bracket: 2 }));
  assert.ok(!SAMPLE.isCommanderDeck({ format: 'commanderPrecons', publicId: 'x', bracket: 2 }));

  const state = SAMPLE.initSampleState();
  assert.ok(SAMPLE.maybeAddDeck(state, { id: 'a', bracket: 4, name: 'A' }, 2));
  assert.ok(!SAMPLE.maybeAddDeck(state, { id: 'a', bracket: 4, name: 'A again' }, 2));
  assert.ok(SAMPLE.maybeAddDeck(state, { id: 'b', bracket: 4, name: 'B' }, 2));
  assert.ok(!SAMPLE.maybeAddDeck(state, { id: 'c', bracket: 4, name: 'C' }, 2));
  const ordered = SAMPLE.finalizeDecks([
    { id: 'x', bracket: 5, likes: 12, views: 50, comments: 1, name: 'Later' },
    { id: 'y', bracket: 5, likes: 99, views: 10, comments: 1, name: 'Sooner' },
    { id: 'z', bracket: 4, likes: 4, views: 10, comments: 1, name: 'Bracket Four' },
  ]);
  assert.deepEqual(ordered.map(x => x.id), ['z', 'y', 'x']);
  assert.deepEqual(ordered.map(x => x.bracketRank), [1, 1, 2]);

  const status = SAMPLE.sampleStatus(state.decks, 2);
  assert.equal(status.counts[4], 2);
  assert.equal(status.shortfalls[4], 0);

  process.stdout.write('Moxfield bracket sample tests passed\n');
}

main();
