const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildDeckContext, formatMarkdown, normalizeColors } = require('../lib/search-commander-cards');

async function main() {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mtg-deck-context-'));
  const dataFile = path.join(tmpDir, 'commander-search.json');

  const payload = {
    meta: {
      provider: 'Scryfall',
      updatedAt: '2026-06-13T21:02:55.102+00:00',
      generatedAt: '2026-06-14T00:00:00.000Z',
      cardCount: 4
    },
    cards: [
      {
        id: 'commander-id',
        name: 'Muldrotha, the Gravetide',
        name_normalized: 'muldrotha the gravetide',
        type_line: 'Legendary Creature — Elemental Avatar',
        oracle_text: 'During each of your turns, you may play a permanent card of each permanent type from your graveyard.',
        color_identity: ['B', 'G', 'U'],
        tags: ['commander_candidate', 'graveyard', 'legendary'],
        is_commander_legal: true,
        edhrec_rank: 100
      },
      {
        id: 'good-id',
        name: 'Eternal Witness',
        name_normalized: 'eternal witness',
        type_line: 'Creature — Human Shaman',
        oracle_text: 'When Eternal Witness enters, return target card from your graveyard to your hand.',
        color_identity: ['G'],
        tags: ['creature', 'graveyard'],
        is_commander_legal: true,
        edhrec_rank: 25,
        search_text: 'eternal witness creature graveyard'
      },
      {
        id: 'off-color-id',
        name: 'Swords to Plowshares',
        name_normalized: 'swords to plowshares',
        type_line: 'Instant',
        oracle_text: 'Exile target creature.',
        color_identity: ['W'],
        tags: ['instant', 'removal'],
        is_commander_legal: true,
        edhrec_rank: 1,
        search_text: 'swords to plowshares exile target creature'
      },
      {
        id: 'banned-id',
        name: 'Banned Example',
        name_normalized: 'banned example',
        type_line: 'Sorcery',
        oracle_text: 'Return a card from your graveyard.',
        color_identity: ['B'],
        tags: ['graveyard'],
        is_commander_legal: false,
        search_text: 'graveyard'
      }
    ]
  };

  await fs.promises.writeFile(dataFile, JSON.stringify(payload, null, 2));

  const context = await buildDeckContext({
    dataFile,
    commander: 'Muldrotha',
    colors: null,
    theme: ['graveyard'],
    limit: 10,
    format: 'markdown'
  });

  assert.equal(context.meta.query.matchedCommander, 'Muldrotha, the Gravetide');
  assert.deepEqual(normalizeColors('bug'), ['U', 'B', 'G']);
  assert.deepEqual(context.suggestions.map((card) => card.name), ['Eternal Witness']);
  assert.match(formatMarkdown(context), /Eternal Witness/);

  process.stdout.write('Search tests passed\n');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
