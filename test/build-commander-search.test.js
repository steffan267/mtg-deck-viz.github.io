const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildCommanderSearchData } = require('../lib/build-commander-search');

async function main() {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mtg-commander-search-'));
  const metadataPath = path.join(tmpDir, 'metadata.json');
  const oraclePath = path.join(tmpDir, 'oracle.json');
  const outDir = path.join(tmpDir, 'out');

  const metadata = {
    data: [
      {
        type: 'oracle_cards',
        updated_at: '2026-05-20T00:00:00.000+00:00',
        download_uri: 'https://example.test/oracle.json'
      }
    ]
  };

  const cards = [
    {
      id: 'wear-tear-id',
      oracle_id: 'wear-tear-oracle',
      name: 'Wear // Tear',
      lang: 'en',
      released_at: '2013-05-03',
      layout: 'split',
      cmc: 3,
      type_line: 'Instant // Instant',
      oracle_text: 'Destroy target artifact. // Destroy target enchantment.',
      color_identity: ['R', 'W'],
      keywords: [],
      games: ['paper'],
      legalities: { commander: 'legal' },
      card_faces: [
        { name: 'Wear', type_line: 'Instant', oracle_text: 'Destroy target artifact.', colors: ['R'] },
        { name: 'Tear', type_line: 'Instant', oracle_text: 'Destroy target enchantment.', colors: ['W'] }
      ]
    },
    {
      id: 'traumatize-id',
      oracle_id: 'traumatize-oracle',
      name: 'Traumatize',
      lang: 'en',
      released_at: '2002-10-07',
      layout: 'normal',
      mana_cost: '{3}{U}{U}',
      cmc: 5,
      type_line: 'Sorcery',
      oracle_text: 'Target player mills half their library, rounded down.',
      color_identity: ['U'],
      colors: ['U'],
      keywords: [],
      games: ['paper'],
      legalities: { commander: 'legal' }
    }
  ];

  await fs.promises.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
  await fs.promises.writeFile(oraclePath, JSON.stringify(cards, null, 2));

  await buildCommanderSearchData({
    outDir,
    metadataFile: metadataPath,
    oracleFile: oraclePath,
    forceDownload: true,
    help: false
  });

  const output = JSON.parse(await fs.promises.readFile(path.join(outDir, 'commander-search.json'), 'utf8'));
  const wearTear = output.cards.find((card) => card.id === 'wear-tear-id');
  const traumatize = output.cards.find((card) => card.id === 'traumatize-id');

  assert.deepEqual(wearTear.colors, ['R', 'W']);
  assert.equal(Array.isArray(output.indexes.byTag.mill), true);
  assert.equal(output.indexes.byTag.mill.includes('traumatize-id'), true);
  assert.equal('prices' in traumatize, false);
  assert.equal(output.meta.schemaVersion, 1);

  process.stdout.write('Tests passed\n');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
