const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const { pipeline } = require('node:stream/promises');
const { createProgress } = require('./progress');

const DEFAULT_OUT_DIR = path.resolve(process.cwd(), 'data/out');
const BULK_DATA_URL = 'https://api.scryfall.com/bulk-data';
const ORACLE_TYPE = 'oracle_cards';
const SCHEMA_VERSION = 1;

/** @type {Array<[string, RegExp[]]>} */
const TAG_RULES = [
  ['mill', [/(^|\W)mill(ing|ed|s)?(\W|$)/i, /put the top .* cards? of .* library into .* graveyard/i]],
  ['draw', [/draw (a|two|three|four|five|x) cards?/i, /whenever .* draw/i]],
  ['ramp', [/search your library .* basic land/i, /add \{[WUBRGCS]\}/i, /create (a|two|three|x) treasure/i]],
  ['removal', [/destroy target/i, /exile target/i, /deals? \d+ damage to target/i]],
  ['board_wipe', [/destroy all/i, /exile all/i, /each creature gets -\d/i, /to each creature/i]],
  ['tutor', [/search your library for a card/i, /search your library for an? .* card/i]],
  ['reanimation', [/return target .* card from your graveyard to the battlefield/i, /put target .* card from a graveyard onto the battlefield/i]],
  ['tokens', [/create (a|two|three|x) .* token/i]],
  ['sacrifice', [/sacrifice (a|another|any number of)/i, /whenever you sacrifice/i]],
  ['discard', [/discard a card/i, /target player discards/i, /each opponent discards/i]],
  ['counterspell', [/counter target spell/i, /counter up to/i]],
  ['graveyard', [/graveyard/i]],
  ['artifact_synergy', [/artifact/i]],
  ['enchantment_synergy', [/enchantment/i]],
  ['lifegain', [/gain \d+ life/i, /you gain life/i, /whenever you gain life/i]],
  ['aristocrats', [/dies/i, /whenever .* dies/i]],
  ['blink', [/exile target .* then return it to the battlefield/i, /return .* to the battlefield under its owner's control/i]],
  ['stax', [/can't untap/i, /players can't/i, /your opponents can't/i]],
  ['extra_turn', [/take an extra turn/i]],
  ['spellslinger', [/instant or sorcery/i, /whenever you cast an instant or sorcery/i]],
  ['combat', [/attacks?/i, /combat damage/i, /whenever .* attacks/i]]
];

function parseArgs(argv) {
  const options = {
    outDir: DEFAULT_OUT_DIR,
    metadataFile: null,
    oracleFile: null,
    forceDownload: false,
    help: false,
    usage: [
      'Usage: node ./bin/mtg-commander-search.js [options]',
      '',
      'Options:',
      '  --out-dir <path>        Output directory. Default: data/out',
      '  --metadata-file <path>  Read bulk metadata from a local JSON file',
      '  --oracle-file <path>    Read Oracle Cards JSON from a local file',
      '  --force-download        Re-download metadata and Oracle Cards even if cached files exist',
      '  --help                  Show this help text'
    ].join('\n')
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case '--out-dir':
        options.outDir = path.resolve(argv[++index] ?? '');
        break;
      case '--metadata-file':
        options.metadataFile = path.resolve(argv[++index] ?? '');
        break;
      case '--oracle-file':
        options.oracleFile = path.resolve(argv[++index] ?? '');
        break;
      case '--force-download':
        options.forceDownload = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

async function buildCommanderSearchData(options) {
  await fs.promises.mkdir(options.outDir, { recursive: true });

  const metadataPath = options.metadataFile ?? path.join(options.outDir, 'scryfall-bulk-metadata.json');
  const oraclePath = options.oracleFile ?? path.join(options.outDir, 'oracle-cards.json');
  const outputPath = path.join(options.outDir, 'commander-search.json');
  const progress = createProgress('commander-search-build', 4, { every: 1 });

  progress.start('metadata');
  const metadata = await loadMetadata(
    metadataPath,
    options.forceDownload || !options.metadataFile,
    options.forceDownload && !options.metadataFile
  );
  progress.tick(1, 'metadata-loaded');
  const oracleBulk = selectOracleBulk(metadata);
  progress.tick(2, 'oracle-cards');
  const cards = await loadOracleCards(
    oracleBulk,
    oraclePath,
    options.forceDownload || !options.oracleFile,
    options.forceDownload && !options.oracleFile
  );
  progress.tick(3, `oracle-loaded cards=${cards.length}`);
  const transformed = transformCards(cards, oracleBulk);

  await writeJsonAtomic(outputPath, transformed);
  progress.tick(4, `wrote=${outputPath}`);
  progress.done(`cards=${transformed.cards.length}`);

  return {
    outputPath,
    cardCount: transformed.cards.length
  };
}

async function loadMetadata(metadataPath, canDownload, forceRefresh = false) {
  if (!forceRefresh && await fileExists(metadataPath)) {
    return readJsonFile(metadataPath);
  }

  if (!canDownload) {
    throw new Error(`Metadata file not found: ${metadataPath}`);
  }

  await downloadJson(BULK_DATA_URL, metadataPath);
  return readJsonFile(metadataPath);
}

async function loadOracleCards(oracleBulk, oraclePath, canDownload, forceRefresh = false) {
  if (!forceRefresh && await fileExists(oraclePath)) {
    return readJsonFile(oraclePath);
  }

  if (!canDownload) {
    throw new Error(`Oracle Cards file not found: ${oraclePath}`);
  }

  await downloadJson(oracleBulk.download_uri, oraclePath);
  return readJsonFile(oraclePath);
}

function selectOracleBulk(metadata) {
  const entries = Array.isArray(metadata?.data) ? metadata.data : [];
  const oracleBulk = entries.find((entry) => entry?.type === ORACLE_TYPE);

  if (!oracleBulk?.download_uri) {
    throw new Error('Could not find oracle_cards bulk data in Scryfall metadata.');
  }

  return oracleBulk;
}

function transformCards(cards, oracleBulk) {
  const progress = createProgress('commander-search-transform', cards.length);
  let includedCount = 0;
  progress.start();
  const compactCards = cards
    .filter((card, index) => {
      const included = includeCard(card);
      if (included) includedCount++;
      progress.tick(index + 1, `included=${includedCount}`);
      return included;
    })
    .map(toCompactCard)
    .sort((left, right) => left.name.localeCompare(right.name));
  progress.done(`compact=${compactCards.length}`);

  return {
    meta: {
      schemaVersion: SCHEMA_VERSION,
      provider: 'Scryfall',
      bulkType: oracleBulk.type,
      updatedAt: oracleBulk.updated_at,
      downloadedFrom: oracleBulk.download_uri,
      generatedAt: new Date().toISOString(),
      cardCount: compactCards.length,
      excludedFields: ['prices', 'image_uris', 'purchase_uris', 'related_uris'],
      tagDefinitions: TAG_RULES.map(([tag]) => tag)
    },
    cards: compactCards,
    indexes: buildIndexes(compactCards)
  };
}

function includeCard(card) {
  if (!card || card.layout === 'art_series' || card.set_type === 'memorabilia') {
    return false;
  }

  return Array.isArray(card.games) ? card.games.includes('paper') : false;
}

function toCompactCard(card) {
  const oracleText = normalizeText(card.oracle_text) || normalizeTextFromFaces(card.card_faces, 'oracle_text');
  const typeLine = normalizeText(card.type_line) || normalizeTextFromFaces(card.card_faces, 'type_line');
  const searchText = buildSearchText(card, typeLine, oracleText);
  const colorIdentity = normalizeArray(card.color_identity) ?? [];
  const colors = normalizeArray(card.colors) ?? collectFaceColors(card.card_faces);

  return compactObject({
    id: card.id,
    oracle_id: card.oracle_id,
    name: card.name,
    name_normalized: normalizeName(card.name),
    lang: card.lang,
    released_at: card.released_at,
    layout: card.layout,
    mana_cost: card.mana_cost,
    cmc: card.cmc,
    type_line: typeLine,
    oracle_text: oracleText,
    power: card.power,
    toughness: card.toughness,
    loyalty: card.loyalty,
    defense: card.defense,
    colors,
    color_identity: colorIdentity,
    keywords: normalizeArray(card.keywords),
    produced_mana: normalizeArray(card.produced_mana),
    games: normalizeArray(card.games),
    reserved: Boolean(card.reserved),
    legalities: compactLegalities(card.legalities),
    set: card.set,
    set_name: card.set_name,
    rarity: card.rarity,
    edhrec_rank: card.edhrec_rank,
    card_faces: normalizeCardFaces(card.card_faces),
    tags: deriveTags(typeLine, oracleText),
    search_text: searchText,
    is_commander_legal: card.legalities?.commander === 'legal',
    is_legendary: /legendary/i.test(typeLine),
    is_creature: /creature/i.test(typeLine),
    is_land: /land/i.test(typeLine),
    is_basic_land: /basic land/i.test(typeLine),
    source: {
      provider: 'scryfall',
      oracle_id: card.oracle_id,
      scryfall_id: card.id
    }
  });
}

function compactLegalities(legalities) {
  if (!legalities || typeof legalities !== 'object') {
    return undefined;
  }

  return compactObject({
    commander: legalities.commander,
    brawl: legalities.brawl,
    historicbrawl: legalities.historicbrawl,
    paupercommander: legalities.paupercommander,
    duel: legalities.duel,
    oathbreaker: legalities.oathbreaker,
    predh: legalities.predh
  });
}

function normalizeCardFaces(cardFaces) {
  if (!Array.isArray(cardFaces) || cardFaces.length === 0) {
    return undefined;
  }

  return cardFaces.map((face) => compactObject({
    name: face.name,
    mana_cost: face.mana_cost,
    type_line: normalizeText(face.type_line),
    oracle_text: normalizeText(face.oracle_text),
    power: face.power,
    toughness: face.toughness,
    loyalty: face.loyalty,
    defense: face.defense,
    colors: normalizeArray(face.colors)
  }));
}

function normalizeText(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function normalizeTextFromFaces(cardFaces, fieldName) {
  if (!Array.isArray(cardFaces)) {
    return '';
  }

  return cardFaces
    .map((face) => normalizeText(face[fieldName]))
    .filter(Boolean)
    .join(' // ');
}

function collectFaceColors(cardFaces) {
  if (!Array.isArray(cardFaces) || cardFaces.length === 0) {
    return undefined;
  }

  const colors = new Set();

  for (const face of cardFaces) {
    for (const color of face.colors ?? []) {
      colors.add(color);
    }
  }

  return colors.size > 0 ? Array.from(colors).sort() : undefined;
}

function normalizeName(name) {
  return normalizeText(name)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildSearchText(card, typeLine, oracleText) {
  const faceText = Array.isArray(card.card_faces)
    ? card.card_faces
      .flatMap((face) => [face.name, face.type_line, face.oracle_text])
      .map(normalizeText)
      .filter(Boolean)
      .join(' ')
    : '';

  return [card.name, typeLine, oracleText, faceText, ...(Array.isArray(card.keywords) ? card.keywords : [])]
    .map(normalizeText)
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function deriveTags(typeLine, oracleText) {
  const text = `${typeLine}\n${oracleText}`;
  const tags = new Set();

  for (const [tag, patterns] of TAG_RULES) {
    if (patterns.some((pattern) => pattern.test(text))) {
      tags.add(tag);
    }
  }

  if (/legendary/i.test(typeLine)) {
    tags.add('legendary');
  }

  if (/legendary creature/i.test(typeLine) || /can be your commander/i.test(oracleText)) {
    tags.add('commander_candidate');
  }

  if (/land/i.test(typeLine)) {
    tags.add('land');
  }

  if (/creature/i.test(typeLine)) {
    tags.add('creature');
  }

  if (/instant/i.test(typeLine)) {
    tags.add('instant');
  }

  if (/sorcery/i.test(typeLine)) {
    tags.add('sorcery');
  }

  return Array.from(tags).sort();
}

function buildIndexes(cards) {
  const byTag = {};
  const byColorIdentity = {};
  const commanders = [];

  for (const card of cards) {
    for (const tag of card.tags ?? []) {
      (byTag[tag] ??= []).push(card.id);
    }

    const colorIdentityKey = Array.isArray(card.color_identity) && card.color_identity.length > 0
      ? [...card.color_identity].sort().join('')
      : 'C';

    (byColorIdentity[colorIdentityKey] ??= []).push(card.id);

    if (card.is_commander_legal && card.tags?.includes('commander_candidate')) {
      commanders.push(card.id);
    }
  }

  return { byTag, byColorIdentity, commanders };
}

function normalizeArray(value) {
  return Array.isArray(value) && value.length > 0 ? value : undefined;
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== null && entry !== '')
  );
}

async function writeJsonAtomic(filePath, payload) {
  const temporaryPath = `${filePath}.tmp`;
  await fs.promises.writeFile(temporaryPath, JSON.stringify(payload, null, 2));
  await fs.promises.rename(temporaryPath, filePath);
}

async function fileExists(targetPath) {
  try {
    await fs.promises.access(targetPath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function readJsonFile(filePath) {
  const fileContent = await fs.promises.readFile(filePath, 'utf8');
  return JSON.parse(fileContent);
}

async function downloadJson(url, destinationPath) {
  await fs.promises.mkdir(path.dirname(destinationPath), { recursive: true });

  const response = await fetchResponse(url);
  const temporaryPath = `${destinationPath}.tmp`;

  await pipeline(response, fs.createWriteStream(temporaryPath));
  await fs.promises.rename(temporaryPath, destinationPath);
}

function fetchResponse(url, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      headers: {
        'User-Agent': 'mtg-commander-search-cli/0.1.0',
        Accept: 'application/json;q=0.9,*/*;q=0.8'
      }
    }, (response) => {
      const statusCode = response.statusCode ?? 0;

      if (statusCode >= 300 && statusCode < 400 && response.headers.location) {
        response.resume();

        if (redirectCount >= 5) {
          reject(new Error(`Too many redirects while fetching ${url}`));
          return;
        }

        resolve(fetchResponse(response.headers.location, redirectCount + 1));
        return;
      }

      if (statusCode < 200 || statusCode >= 300) {
        response.resume();
        reject(new Error(`Request failed for ${url} with status ${statusCode}`));
        return;
      }

      resolve(response);
    });

    request.setTimeout(30000, () => {
      request.destroy(new Error(`Request timed out for ${url}`));
    });

    request.on('error', reject);
  });
}

module.exports = {
  buildCommanderSearchData,
  parseArgs
};
