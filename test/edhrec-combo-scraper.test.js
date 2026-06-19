const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  parseArgs,
  parseCategoryPage,
  parseComboDetailPage,
  fetchEdhrecCombos,
} = require('../analysis/edhrec-combos/fetch-edhrec-combos');

assert.deepEqual(parseArgs(['--categories', 'dimir,mono-blue', '--per-category', '3', '--max-details', '4', '--delay-ms', '1']).categories, ['dimir', 'mono-blue']);
assert.equal(parseArgs(['--per-category', 'bogus']).perCategory, 20);

const categoryHtml = `
  <div>
    <a href="/combos/dimir/742-1295"><button class="x">View combo details</button></a>
    <a href="/combos/mono-blue/4821-5261"><button>View combo details</button></a>
    <a href="/combos/dimir/742-1295"><button>View combo details</button></a>
    <a href="/combos/dimir"><button>View combo details</button></a>
  </div>
`;
const categoryDetails = parseCategoryPage(categoryHtml, 'early-game-2-card-combos');
assert.equal(categoryDetails.length, 2);
assert.deepEqual(categoryDetails[0], {
  id: 'dimir-742-1295',
  detailPath: '/combos/dimir/742-1295',
  url: 'https://edhrec.com/combos/dimir/742-1295',
  categories: ['early-game-2-card-combos'],
});

const detailHtml = `
  <article>
    <span class="Card_name__Mpa7S">Demonic Consultation</span>
    <span class="Card_name__Mpa7S">Thassa&#39;s Oracle</span>
    <h2>Played with this combo</h2>
    <span class="Card_name__Mpa7S">Do Not Capture Related Card</span>
    <h2>Prerequisites</h2>
    <p>Demonic Consultation and Thassa's Oracle in hand.</p>
    <p>Available</p>
    <h2>Steps</h2>
    <h2>How does this combo work?</h2>
    <div>1</div><div>Cast Thassa's Oracle.</div>
    <div>2</div><div>Cast Demonic Consultation.</div>
    <h2>Results</h2>
    <h2>What do I get from this combo?</h2>
    <p>Exile your library</p>
    <p>Win the game</p>
    <h2>Combo Metadata</h2>
    <p>143,323</p><p>DECKS</p>
    <p>6.33% OF 2,264,290 ELIGIBLE DECKS</p>
    <p>Rank 2</p>
    <a href="https://commanderspellbook.com/combo/742-1295/">spellbook</a>
  </article>
`;
const parsedDetail = parseComboDetailPage(detailHtml, { detailPath: '/combos/dimir/742-1295', categories: ['dimir'] });
assert.deepEqual(parsedDetail.cards, ['Demonic Consultation', "Thassa's Oracle"]);
assert.deepEqual(parsedDetail.prerequisites, ["Demonic Consultation and Thassa's Oracle in hand."]);
assert.deepEqual(parsedDetail.steps, ["Cast Thassa's Oracle.", 'Cast Demonic Consultation.']);
assert.deepEqual(parsedDetail.results, ['Exile your library', 'Win the game']);
assert.equal(parsedDetail.metadata.deckCount, 143323);
assert.equal(parsedDetail.metadata.eligibleDecks, 2264290);
assert.equal(parsedDetail.metadata.rank, 2);
assert.equal(parsedDetail.metadata.spellbook, 'https://commanderspellbook.com/combo/742-1295/');

(async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edhrec-combos-'));
  const out = path.join(tmpDir, 'cache.json');
  const htmlByUrl = new Map([
    ['https://edhrec.com/combos/dimir', categoryHtml],
    ['https://edhrec.com/combos/dimir/742-1295', detailHtml],
    ['https://edhrec.com/combos/mono-blue/4821-5261', detailHtml.replace('143,323', '1,000')],
  ]);
  const payload = await fetchEdhrecCombos({ out, categories: ['dimir'], perCategory: 5, maxDetails: 2, delayMs: 0, force: true }, async url => {
    if (!htmlByUrl.has(url)) throw new Error(`missing fixture for ${url}`);
    return htmlByUrl.get(url);
  });
  assert.equal(payload.meta.complete, true);
  assert.equal(payload.meta.comboCount, 2);
  assert.equal(payload.categories.dimir.found, 2);
  assert.equal(payload.combos[0].metadata.deckCount, 143323);
  assert.equal(JSON.parse(fs.readFileSync(out, 'utf8')).meta.comboCount, 2);
})().then(() => {
  process.stdout.write('EDHREC combo scraper tests passed\n');
}).catch(err => {
  console.error(err);
  process.exit(1);
});
