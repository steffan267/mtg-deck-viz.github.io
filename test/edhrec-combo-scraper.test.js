const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  discoverCategoriesFromIndex,
  jsonPageUrl,
  parseArgs,
  parseCategoryPage,
  parseCategoryPageResult,
  parsePaginatedComboJson,
  parseComboDetailPage,
  fetchEdhrecCombos,
} = require('../analysis/edhrec-combos/fetch-edhrec-combos');

assert.deepEqual(parseArgs(['--categories', 'dimir,mono-blue', '--per-category', '3', '--max-details', '4', '--delay-ms', '1']).categories, ['dimir', 'mono-blue']);
assert.equal(parseArgs(['--per-category', 'bogus']).perCategory, 20);
assert.equal(parseArgs(['--all']).perCategory, Infinity);
assert.equal(parseArgs(['--all']).fetchDetails, false);
assert.equal(parseArgs(['--all']).fresh, true);
assert.equal(jsonPageUrl('combos/mono-white-1.json'), 'https://json.edhrec.com/pages/combos/mono-white-1.json');

const indexHtml = `
  <a href="/combos/mono-white">Mono-White</a>
  <a href="/combos/azorius">Azorius</a>
  <a href="/combos/mono-white">Duplicate</a>
  <a href="/combos/mono-white/1090-2781">Not a category</a>
`;
assert.deepEqual(discoverCategoriesFromIndex(indexHtml), ['mono-white', 'azorius']);

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

const nextDataCategoryHtml = `
  <script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
    props: {
      pageProps: {
        data: {
          container: {
            json_dict: {
              more: 'combos/mono-white-1.json',
              cardlists: [{
                header: 'Felidar Guardian + Restoration Angel (48228 decks)',
                href: '/combos/mono-white/1090-2781',
                combo: { comboId: '1090-2781', count: 48228, maxCount: 4253005, rank: 34, results: ['Infinite ETB', 'Infinite LTB'] },
                cardviews: [{ name: 'Felidar Guardian' }, { name: 'Restoration Angel' }],
              }],
            },
          },
        },
      },
    },
  })}</script>
`;
const embeddedCategoryDetails = parseCategoryPage(nextDataCategoryHtml, 'mono-white');
assert.equal(embeddedCategoryDetails.length, 1);
assert.deepEqual(embeddedCategoryDetails[0].cards, ['Felidar Guardian', 'Restoration Angel']);
assert.deepEqual(embeddedCategoryDetails[0].results, ['Infinite ETB', 'Infinite LTB']);
assert.equal(embeddedCategoryDetails[0].metadata.deckCount, 48228);
assert.equal(parseCategoryPageResult(nextDataCategoryHtml, 'mono-white').diagnostics.length, 0);

const malformedNextDataCategoryHtml = `
  <script id="__NEXT_DATA__" type="application/json">{"props":</script>
  ${categoryHtml}
`;
const malformedCategory = parseCategoryPageResult(malformedNextDataCategoryHtml, 'dimir');
assert.equal(malformedCategory.details.length, 2);
assert.equal(malformedCategory.diagnostics.length, 1);
assert.equal(malformedCategory.diagnostics[0].stage, 'category-parse');

const paginated = parsePaginatedComboJson(JSON.stringify({
  cardlists: [{
    header: 'Omen Machine + Drannith Magistrate (2192 decks)',
    href: '/combos/mono-white/1725-3031',
    combo: { comboId: '1725-3031', count: 2192, rank: 2220, results: ['Lock'] },
    cardviews: [{ name: 'Omen Machine' }, { name: 'Drannith Magistrate' }],
  }],
  is_paginated: true,
  more: 'combos/mono-white-2.json',
}), 'mono-white');
assert.equal(paginated.more, 'combos/mono-white-2.json');
assert.deepEqual(paginated.details[0].cards, ['Omen Machine', 'Drannith Magistrate']);

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

  const malformedOut = path.join(tmpDir, 'malformed-cache.json');
  const malformedPayload = await fetchEdhrecCombos({
    out: malformedOut,
    categories: ['dimir'],
    perCategory: 5,
    maxDetails: 0,
    fetchDetails: false,
    delayMs: 0,
    force: true,
  }, async url => {
    if (url === 'https://edhrec.com/combos/dimir') return malformedNextDataCategoryHtml;
    throw new Error(`missing malformed fixture for ${url}`);
  });
  assert.equal(malformedPayload.categories.dimir.found, 2);
  assert.equal(malformedPayload.meta.complete, false);
  assert.equal(malformedPayload.failures.length, 1);
  assert.equal(malformedPayload.failures[0].stage, 'category-parse');

  const metadataOut = path.join(tmpDir, 'metadata-cache.json');
  const summaryWithMetadataHtml = `
    <script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
      props: {
        pageProps: {
          data: {
            container: {
              json_dict: {
                cardlists: [{
                  header: 'Felidar Guardian + Restoration Angel (48228 decks)',
                  href: '/combos/mono-white/1090-2781',
                  combo: {
                    count: 48228,
                    maxCount: 4253005,
                    rank: 34,
                    comboVote: 99,
                    percentage: 1.13,
                    colors: ['W'],
                    results: ['Infinite ETB'],
                  },
                  cardviews: [{ name: 'Felidar Guardian' }, { name: 'Restoration Angel' }],
                }],
              },
            },
          },
        },
      },
    })}</script>
  `;
  const metadataPayload = await fetchEdhrecCombos({
    out: metadataOut,
    categories: ['mono-white'],
    perCategory: 1,
    maxDetails: 1,
    delayMs: 0,
    force: true,
  }, async url => {
    if (url === 'https://edhrec.com/combos/mono-white') return summaryWithMetadataHtml;
    if (url === 'https://edhrec.com/combos/mono-white/1090-2781') return detailHtml;
    throw new Error(`missing metadata fixture for ${url}`);
  });
  assert.equal(metadataPayload.meta.complete, true);
  assert.equal(metadataPayload.combos[0].metadata.deckCount, 143323, 'detail metadata should overlay non-null summary values');
  assert.equal(metadataPayload.combos[0].metadata.comboVote, 99, 'detail fetch should preserve summary-only metadata');
  assert.equal(metadataPayload.combos[0].metadata.percentage, 1.13);
  assert.deepEqual(metadataPayload.combos[0].metadata.colors, ['W']);

  const allOut = path.join(tmpDir, 'all-cache.json');
  const allHtmlByUrl = new Map([
    ['https://edhrec.com/combos', indexHtml],
    ['https://edhrec.com/combos/mono-white', nextDataCategoryHtml],
    ['https://json.edhrec.com/pages/combos/mono-white-1.json', JSON.stringify({
      cardlists: [{
        header: 'Omen Machine + Drannith Magistrate (2192 decks)',
        href: '/combos/mono-white/1725-3031',
        combo: { comboId: '1725-3031', count: 2192, rank: 2220, results: ['Lock'] },
        cardviews: [{ name: 'Omen Machine' }, { name: 'Drannith Magistrate' }],
      }],
      is_paginated: false,
      more: null,
    })],
    ['https://edhrec.com/combos/azorius', nextDataCategoryHtml.replaceAll('mono-white', 'azorius').replaceAll('Felidar Guardian', 'Displacer Kitten').replaceAll('Restoration Angel', 'Teferi, Time Raveler')],
    ['https://json.edhrec.com/pages/combos/azorius-1.json', JSON.stringify({ cardlists: [], is_paginated: false, more: null })],
  ]);
  const allPayload = await fetchEdhrecCombos(parseArgs(['--all', '--out', allOut, '--delay-ms', '1']), async url => {
    if (!allHtmlByUrl.has(url)) throw new Error(`missing all fixture for ${url}`);
    return allHtmlByUrl.get(url);
  });
  assert.equal(allPayload.meta.complete, true);
  assert.equal(allPayload.meta.options.perCategory, 'all');
  assert.equal(allPayload.meta.options.fetchDetails, false);
  assert.equal(allPayload.meta.comboCount, 3);
  assert.equal(allPayload.categories['mono-white'].fetchedPages, 2);
})().then(() => {
  process.stdout.write('EDHREC combo scraper tests passed\n');
}).catch(err => {
  console.error(err);
  process.exit(1);
});
