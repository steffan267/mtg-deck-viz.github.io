#!/usr/bin/env node
/*
 * fetch-edhrec-combo-tag-decks.js — EDHREC /tags/combo aggregate deck cache.
 *
 * EDHREC tag pages expose aggregate commander/cardlist data, not exact public
 * decklists. This script stores each combo-tagged commander page as a local
 * average-deck approximation so the interaction engine can be evaluated
 * repeatedly without depending on live EDHREC pages.
 */
const fs = require('node:fs');
const path = require('node:path');

const BASE_JSON_URL = 'https://json.edhrec.com/pages';
const DEFAULT_OUT = path.join(__dirname, 'edhrec-combo-tag-decks.json');
const DEFAULT_INDEX = '/tags/combo';
const COMMANDER_LIST_TAGS = new Set(['newcommanders', 'topcommanders']);
const EXCLUDED_DECKLIST_TAGS = new Set(['newcommanders', 'topcommanders', 'newcards']);

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function usage() {
  process.stderr.write([
    'Usage: node analysis/edhrec-combos/fetch-edhrec-combo-tag-decks.js [options]',
    '',
    'Options:',
    '  --out file                 Output JSON file',
    '  --max-commanders n|all     Limit commander pages fetched (default: all)',
    '  --delay-ms n               Delay between network calls (default: 100)',
    '  --fresh                    Ignore an existing output cache',
    '  --force                    Refetch commander pages already in the cache',
    '  --help                     Show this message',
  ].join('\n') + '\n');
  process.exit(2);
}

function parseNonNegativeLimit(value, fallback) {
  if (String(value).toLowerCase() === 'all') return Infinity;
  const n = parseInt(String(value), 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function parsePositiveInt(value, fallback) {
  const n = parseInt(String(value), 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function parseArgs(argv) {
  const opts = {
    out: DEFAULT_OUT,
    maxCommanders: Infinity,
    delayMs: 100,
    fresh: false,
    force: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--out') opts.out = argv[++i];
    else if (arg === '--max-commanders') opts.maxCommanders = parseNonNegativeLimit(argv[++i], opts.maxCommanders);
    else if (arg === '--delay-ms') opts.delayMs = parsePositiveInt(argv[++i], opts.delayMs);
    else if (arg === '--fresh') opts.fresh = true;
    else if (arg === '--force') opts.force = true;
    else if (arg === '--help' || arg === '-h') usage();
    else usage();
  }
  return opts;
}

function jsonUrl(pagePath) {
  const clean = String(pagePath || '').replace(/^\/+/, '').replace(/\.json$/i, '');
  return `${BASE_JSON_URL}/${clean}.json`;
}

function commanderComboJsonUrl(commanderUrl) {
  const clean = String(commanderUrl || '').replace(/^\/+/, '').replace(/\.json$/i, '');
  return `${BASE_JSON_URL}/${clean}/combo.json`;
}

function loadCache(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

async function httpGetJson(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'mtg-rulesbuilder-analysis/1.0',
      Accept: 'application/json,*/*',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

function jsonDict(page) {
  return page && page.container && page.container.json_dict
    ? page.container.json_dict
    : {};
}

function normalizePagePath(url) {
  const clean = String(url || '').trim();
  if (!clean) return null;
  if (/^https?:\/\//i.test(clean)) {
    const parsed = new URL(clean);
    return parsed.pathname.replace(/\.json$/i, '');
  }
  return clean.startsWith('/') ? clean : `/${clean}`;
}

function discoverTagPages(indexPage) {
  const pages = new Map([[DEFAULT_INDEX, { path: DEFAULT_INDEX, label: 'Combo', count: null }]]);
  for (const group of indexPage.related_info || []) {
    for (const item of group.items || []) {
      const pagePath = normalizePagePath(item.url);
      if (!pagePath || !pagePath.startsWith('/tags/combo')) continue;
      pages.set(pagePath, {
        path: pagePath,
        label: item.textLeft || item.name || pagePath.split('/').pop(),
        count: typeof item.count === 'number' ? item.count : null,
        group: group.header || null,
      });
    }
  }
  return [...pages.values()];
}

function commanderNames(cardview) {
  if (Array.isArray(cardview.cards) && cardview.cards.length) {
    return cardview.cards.map(card => card.name).filter(Boolean);
  }
  if (Array.isArray(cardview.names) && cardview.names.length) return cardview.names.filter(Boolean);
  return cardview.name ? [cardview.name] : [];
}

function commanderSeedFromCardview(cardview, sourcePage, sourceList) {
  if (!cardview || !cardview.url || !String(cardview.url).startsWith('/commanders/')) return null;
  return {
    slug: String(cardview.url).replace(/^\/commanders\//, ''),
    name: cardview.name,
    names: commanderNames(cardview),
    url: cardview.url,
    sourcePages: [sourcePage.path],
    sourceLists: [sourceList.tag || sourceList.header],
    inclusion: cardview.inclusion ?? null,
    numDecks: cardview.num_decks ?? null,
    potentialDecks: cardview.potential_decks ?? null,
  };
}

function collectCommanderSeeds(pages) {
  const bySlug = new Map();
  for (const page of pages) {
    for (const list of (jsonDict(page.payload).cardlists || [])) {
      if (!COMMANDER_LIST_TAGS.has(list.tag)) continue;
      for (const cardview of list.cardviews || []) {
        const seed = commanderSeedFromCardview(cardview, page, list);
        if (!seed) continue;
        const existing = bySlug.get(seed.slug);
        if (existing) {
          existing.sourcePages = sortedUnique(existing.sourcePages.concat(seed.sourcePages));
          existing.sourceLists = sortedUnique(existing.sourceLists.concat(seed.sourceLists));
          existing.numDecks = Math.max(Number(existing.numDecks) || 0, Number(seed.numDecks) || 0) || existing.numDecks || seed.numDecks;
          existing.inclusion = Math.max(Number(existing.inclusion) || 0, Number(seed.inclusion) || 0) || existing.inclusion || seed.inclusion;
        } else {
          bySlug.set(seed.slug, seed);
        }
      }
    }
  }
  return [...bySlug.values()].sort((a, b) => Number(b.numDecks || 0) - Number(a.numDecks || 0) || a.name.localeCompare(b.name));
}

function sortedUnique(values) {
  return [...new Set((values || []).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
}

function cardlistRecords(page) {
  return (jsonDict(page).cardlists || []).map(list => ({
    header: list.header,
    tag: list.tag || null,
    cards: (list.cardviews || []).map(card => ({
      name: card.name,
      url: card.url || null,
      inclusion: card.inclusion ?? null,
      numDecks: card.num_decks ?? null,
      potentialDecks: card.potential_decks ?? null,
      synergy: card.synergy ?? null,
    })).filter(card => card.name),
  }));
}

function decklistFromCommanderPage(seed, page, maxCards = 100) {
  const commanderCard = jsonDict(page).card || {};
  const names = sortedUnique((Array.isArray(commanderCard.names) && commanderCard.names.length)
    ? commanderCard.names
    : seed.names);
  const commanderNamesSet = new Set(names);
  const candidates = new Map();
  for (const list of jsonDict(page).cardlists || []) {
    if (EXCLUDED_DECKLIST_TAGS.has(list.tag)) continue;
    for (const card of list.cardviews || []) {
      if (!card.name || commanderNamesSet.has(card.name)) continue;
      const existing = candidates.get(card.name);
      const score = Number(card.inclusion || card.num_decks || 0);
      if (!existing || score > existing.score) {
        candidates.set(card.name, {
          name: card.name,
          score,
          tags: [list.tag || list.header],
        });
      } else {
        existing.tags = sortedUnique(existing.tags.concat(list.tag || list.header));
      }
    }
  }
  const nonCommanders = [...candidates.values()]
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, Math.max(0, maxCards - names.length))
    .map(card => card.name);
  return names.concat(nonCommanders).map(name => ({ qty: 1, name }));
}

function commanderDeckFromPage(seed, page) {
  const commanderCard = jsonDict(page).card || {};
  return {
    id: seed.slug,
    name: seed.name,
    url: `https://edhrec.com${seed.url}/combo`,
    source: 'edhrec-tags-combo',
    sourcePages: seed.sourcePages,
    sourceLists: seed.sourceLists,
    numDecks: commanderCard.num_decks ?? seed.numDecks ?? null,
    potentialDecks: commanderCard.potential_decks ?? seed.potentialDecks ?? null,
    inclusion: commanderCard.inclusion ?? seed.inclusion ?? null,
    rank: commanderCard.rank ?? null,
    colorIdentity: commanderCard.color_identity || [],
    bracketCounts: page.bracket_counts || {},
    budgetCounts: page.budget_counts || {},
    tagCounts: page.tag_counts || {},
    typeCounts: {
      creature: page.creature || 0,
      instant: page.instant || 0,
      sorcery: page.sorcery || 0,
      artifact: page.artifact || 0,
      enchantment: page.enchantment || 0,
      planeswalker: page.planeswalker || 0,
      battle: page.battle || 0,
      land: page.land || 0,
      basic: page.basic || 0,
      nonbasic: page.nonbasic || 0,
    },
    decklist: decklistFromCommanderPage(seed, page),
    cardlists: cardlistRecords(page),
    fetchedAt: new Date().toISOString(),
  };
}

function normalizeDeckRecord(deck) {
  if (!deck) return deck;
  return {
    ...deck,
    decklist: (deck.decklist || []).map(entry => typeof entry === 'string' ? { qty: 1, name: entry } : entry),
  };
}

function buildPayload(opts, tagPages, seeds, decks, failures) {
  return {
    schemaVersion: 'edhrec-combo-tag-decks.v1',
    source: 'https://edhrec.com/tags/combo',
    generatedAt: new Date().toISOString(),
    meta: {
      tagPageCount: tagPages.length,
      commanderSeedCount: seeds.length,
      deckCount: decks.length,
      failureCount: failures.length,
      complete: failures.length === 0 && decks.length === Math.min(seeds.length, opts.maxCommanders),
      options: {
        maxCommanders: opts.maxCommanders === Infinity ? 'all' : opts.maxCommanders,
        delayMs: opts.delayMs,
      },
    },
    tagPages: tagPages.map(page => ({
      path: page.path,
      label: page.label,
      group: page.group || null,
      count: page.count ?? null,
      commanderSeeds: page.commanderSeeds || 0,
    })),
    commanderSeeds: seeds,
    decks,
    failures,
  };
}

async function fetchEdhrecComboTagDecks(opts, fetcher = httpGetJson) {
  opts = Object.assign(parseArgs([]), opts || {});
  const existing = opts.fresh ? null : loadCache(opts.out);
  const decksById = new Map((existing?.decks || []).map(deck => normalizeDeckRecord(deck)).map(deck => [deck.id, deck]));
  const failures = [];
  const index = await fetcher(jsonUrl(DEFAULT_INDEX));
  const tagPages = [];
  for (const tagPage of discoverTagPages(index)) {
    process.stdout.write(`[tag] ${tagPage.path} … `);
    try {
      const payload = tagPage.path === DEFAULT_INDEX ? index : await fetcher(jsonUrl(tagPage.path));
      const cardlists = jsonDict(payload).cardlists || [];
      const commanderSeeds = cardlists
        .filter(list => COMMANDER_LIST_TAGS.has(list.tag))
        .reduce((sum, list) => sum + (list.cardviews || []).length, 0);
      tagPages.push({ ...tagPage, payload, commanderSeeds });
      process.stdout.write(`${commanderSeeds} commander seed(s)\n`);
    } catch (error) {
      failures.push({ stage: 'tag-page', path: tagPage.path, error: error.message, failedAt: new Date().toISOString() });
      process.stdout.write(`✗ ${error.message}\n`);
    }
    if (opts.delayMs > 0) await sleep(opts.delayMs);
  }

  const seeds = collectCommanderSeeds(tagPages);
  const targetSeeds = seeds.slice(0, opts.maxCommanders);
  for (let i = 0; i < targetSeeds.length; i++) {
    const seed = targetSeeds[i];
    if (!opts.force && decksById.has(seed.slug)) {
      process.stdout.write(`[commander ${i + 1}/${targetSeeds.length}] ${seed.name} … cached\n`);
      continue;
    }
    process.stdout.write(`[commander ${i + 1}/${targetSeeds.length}] ${seed.name} … `);
    try {
      const page = await fetcher(commanderComboJsonUrl(seed.url));
      decksById.set(seed.slug, commanderDeckFromPage(seed, page));
      process.stdout.write(`${decksById.get(seed.slug).decklist.length} card average list\n`);
    } catch (error) {
      failures.push({ stage: 'commander', id: seed.slug, name: seed.name, url: commanderComboJsonUrl(seed.url), error: error.message, failedAt: new Date().toISOString() });
      process.stdout.write(`✗ ${error.message}\n`);
    }
    const payload = buildPayload(opts, tagPages, seeds, [...decksById.values()], failures);
    writeJson(opts.out, payload);
    if (opts.delayMs > 0) await sleep(opts.delayMs);
  }
  const payload = buildPayload(opts, tagPages, seeds, [...decksById.values()], failures);
  writeJson(opts.out, payload);
  return payload;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const payload = await fetchEdhrecComboTagDecks(opts);
  process.stdout.write(`\n✓ wrote ${opts.out}\n`);
  process.stdout.write(`tag pages ${payload.meta.tagPageCount}; commander seeds ${payload.meta.commanderSeedCount}; decks ${payload.meta.deckCount}; failures ${payload.meta.failureCount}; complete ${payload.meta.complete}\n`);
  if (!payload.meta.complete) process.exitCode = 1;
}

if (require.main === module) {
  main().catch(error => {
    process.stderr.write(String(error && error.stack || error) + '\n');
    process.exit(1);
  });
} else {
  module.exports = {
    jsonUrl,
    commanderComboJsonUrl,
    discoverTagPages,
    collectCommanderSeeds,
    decklistFromCommanderPage,
    commanderDeckFromPage,
    fetchEdhrecComboTagDecks,
  };
}
