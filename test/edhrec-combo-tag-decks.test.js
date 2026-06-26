const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  jsonUrl,
  commanderComboJsonUrl,
  discoverTagPages,
  collectCommanderSeeds,
  decklistFromCommanderPage,
  fetchEdhrecComboTagDecks,
} = require('../analysis/edhrec-combos/fetch-edhrec-combo-tag-decks');

assert.equal(jsonUrl('/tags/combo'), 'https://json.edhrec.com/pages/tags/combo.json');
assert.equal(
  commanderComboJsonUrl('/commanders/krrik-son-of-yawgmoth'),
  'https://json.edhrec.com/pages/commanders/krrik-son-of-yawgmoth/combo.json',
);

const tagIndex = {
  related_info: [{
    header: 'Monocolor',
    items: [
      { textLeft: 'Mono-Black', url: '/tags/combo/mono-black', count: 6087 },
      { textLeft: 'Not Combo', url: '/tags/aristocrats', count: 10 },
    ],
  }],
  container: {
    json_dict: {
      cardlists: [{
        header: 'Top Commanders',
        tag: 'topcommanders',
        cardviews: [{
          name: "K'rrik, Son of Yawgmoth",
          url: '/commanders/krrik-son-of-yawgmoth',
          inclusion: 1119,
          num_decks: 1119,
          potential_decks: 111318,
        }],
      }],
    },
  },
};

const monoBlackTag = {
  related_info: [],
  container: {
    json_dict: {
      cardlists: [{
        header: 'New Commanders',
        tag: 'newcommanders',
        cardviews: [{
          name: 'Vilis, Broker of Blood',
          url: '/commanders/vilis-broker-of-blood',
          inclusion: 100,
          num_decks: 100,
          potential_decks: 111318,
        }],
      }],
    },
  },
};

const krrikCombo = {
  creature: 20,
  instant: 13,
  sorcery: 15,
  artifact: 13,
  enchantment: 6,
  land: 31,
  bracket_counts: { 5: 391, 4: 265 },
  budget_counts: { middle: 897 },
  tag_counts: { Combo: 1119 },
  container: {
    json_dict: {
      card: {
        name: "K'rrik, Son of Yawgmoth",
        names: ["K'rrik, Son of Yawgmoth"],
        num_decks: 1119,
        potential_decks: 1119,
        inclusion: 1119,
        rank: 60,
        color_identity: ['B'],
      },
      cardlists: [
        {
          header: 'Top Commanders',
          tag: 'topcommanders',
          cardviews: [{ name: 'Should Not Be In Deck', inclusion: 9999 }],
        },
        {
          header: 'New Cards',
          tag: 'newcards',
          cardviews: [{ name: 'Also Not In Deck', inclusion: 9999 }],
        },
        {
          header: 'Top Cards',
          tag: 'topcards',
          cardviews: [
            { name: 'Dark Ritual', inclusion: 1094, num_decks: 1094 },
            { name: 'Bolas\'s Citadel', inclusion: 900, num_decks: 900 },
          ],
        },
        {
          header: 'Creatures',
          tag: 'creatures',
          cardviews: [
            { name: 'Blood Celebrant', inclusion: 922, num_decks: 922 },
            { name: "K'rrik, Son of Yawgmoth", inclusion: 1119, num_decks: 1119 },
          ],
        },
      ],
    },
  },
};

const pages = discoverTagPages(tagIndex);
assert.deepEqual(pages.map(page => page.path), ['/tags/combo', '/tags/combo/mono-black']);

const seeds = collectCommanderSeeds([
  { ...pages[0], payload: tagIndex },
  { ...pages[1], payload: monoBlackTag },
]);
assert.deepEqual(seeds.map(seed => seed.slug), ['krrik-son-of-yawgmoth', 'vilis-broker-of-blood']);

assert.deepEqual(decklistFromCommanderPage(seeds[0], krrikCombo, 4), [
  { qty: 1, name: "K'rrik, Son of Yawgmoth" },
  { qty: 1, name: 'Dark Ritual' },
  { qty: 1, name: 'Blood Celebrant' },
  { qty: 1, name: "Bolas's Citadel" },
]);

(async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edhrec-combo-tag-'));
  const out = path.join(tmpDir, 'tag-decks.json');
  const payload = await fetchEdhrecComboTagDecks({
    out,
    maxCommanders: 1,
    delayMs: 0,
    fresh: true,
    force: true,
  }, async url => {
    if (url === 'https://json.edhrec.com/pages/tags/combo.json') return tagIndex;
    if (url === 'https://json.edhrec.com/pages/tags/combo/mono-black.json') return monoBlackTag;
    if (url === 'https://json.edhrec.com/pages/commanders/krrik-son-of-yawgmoth/combo.json') return krrikCombo;
    throw new Error(`missing fixture for ${url}`);
  });
  assert.equal(payload.meta.complete, true);
  assert.equal(payload.meta.tagPageCount, 2);
  assert.equal(payload.meta.commanderSeedCount, 2);
  assert.equal(payload.meta.deckCount, 1);
  assert.deepEqual(payload.decks[0].decklist[0], { qty: 1, name: "K'rrik, Son of Yawgmoth" });
  assert.equal(JSON.parse(fs.readFileSync(out, 'utf8')).schemaVersion, 'edhrec-combo-tag-decks.v1');
})().then(() => {
  process.stdout.write('EDHREC combo tag deck tests passed\n');
}).catch(error => {
  console.error(error);
  process.exit(1);
});
