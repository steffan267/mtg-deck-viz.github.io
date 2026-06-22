#!/usr/bin/env node
/*
 * fetch-edhrec-combos.js — public EDHREC combo evidence cache.
 *
 * This scraper intentionally stores combo evidence for offline analysis only.
 * Classifier/model logic must not key on the card names captured here.
 */
const fs = require('fs');
const path = require('path');

const DEFAULT_OUT = path.join(__dirname, 'edhrec-combo-cache.json');
const BASE_URL = 'https://edhrec.com';
const DEFAULT_CATEGORIES = [
  'early-game-2-card-combos',
  'late-game-2-card-combos',
  'mono-white',
  'mono-blue',
  'mono-black',
  'mono-red',
  'mono-green',
  'colorless',
  'azorius',
  'dimir',
  'rakdos',
  'gruul',
  'selesnya',
  'orzhov',
  'izzet',
  'golgari',
  'boros',
  'simic',
  'esper',
  'grixis',
  'jund',
  'naya',
  'bant',
  'abzan',
  'jeskai',
  'sultai',
  'mardu',
  'temur',
  'yore-tiller',
  'glint-eye',
  'dune-brood',
  'ink-treader',
  'witch-maw',
  'five-color',
];
const CATEGORY_RE = /\/combos\/(early-game-2-card-combos|late-game-2-card-combos|mono-[a-z]+|colorless|azorius|dimir|rakdos|gruul|selesnya|orzhov|izzet|golgari|boros|simic|esper|grixis|jund|naya|bant|abzan|jeskai|sultai|mardu|temur|five-color|yore-tiller|glint-eye|dune-brood|ink-treader|witch-maw)$/;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function usage() {
  console.error('Usage: node analysis/edhrec-combos/fetch-edhrec-combos.js [--out file] [--categories a,b] [--discover-categories|--all] [--per-category n|all] [--max-details n|all] [--max-pages-per-category n|all] [--no-details] [--fresh] [--delay-ms n] [--force]');
  process.exit(2);
}

function parsePositiveInt(value, fallback) {
  const n = parseInt(String(value), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseNonNegativeLimit(value, fallback) {
  if (String(value).toLowerCase() === 'all') return Infinity;
  const n = parseInt(String(value), 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function parseArgs(argv) {
  const opts = defaultOptions();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--out') opts.out = argv[++i];
    else if (arg === '--categories') opts.categories = String(argv[++i] || '').split(',').map(s => s.trim()).filter(Boolean);
    else if (arg === '--discover-categories') opts.discoverCategories = true;
    else if (arg === '--all') {
      opts.discoverCategories = true;
      opts.perCategory = Infinity;
      opts.maxDetails = 0;
      opts.fetchDetails = false;
      opts.maxPagesPerCategory = Infinity;
      opts.fresh = true;
    }
    else if (arg === '--per-category') opts.perCategory = parseNonNegativeLimit(argv[++i], opts.perCategory);
    else if (arg === '--max-details') opts.maxDetails = parseNonNegativeLimit(argv[++i], opts.maxDetails);
    else if (arg === '--max-pages-per-category') opts.maxPagesPerCategory = parseNonNegativeLimit(argv[++i], opts.maxPagesPerCategory);
    else if (arg === '--no-details') { opts.fetchDetails = false; opts.maxDetails = 0; }
    else if (arg === '--fresh') opts.fresh = true;
    else if (arg === '--delay-ms') opts.delayMs = parsePositiveInt(argv[++i], opts.delayMs);
    else if (arg === '--force') opts.force = true;
    else if (arg === '--help') usage();
    else usage();
  }
  return opts;
}

function defaultOptions() {
  return {
    out: DEFAULT_OUT,
    categories: DEFAULT_CATEGORIES.slice(),
    perCategory: 20,
    maxDetails: 160,
    maxPagesPerCategory: Infinity,
    delayMs: 250,
    force: false,
    fresh: false,
    discoverCategories: false,
    fetchDetails: true,
  };
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function compactText(value) {
  return decodeHtml(value).replace(/\s+/g, ' ').trim();
}

function htmlToLines(html) {
  return decodeHtml(String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .split(/\n+/)
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function categoryUrl(category) {
  return `${BASE_URL}/combos/${category}`;
}

function jsonPageUrl(morePath) {
  const clean = String(morePath || '').replace(/^\/+/, '');
  if (!clean) return null;
  if (/^https?:\/\//i.test(clean)) return clean;
  return `https://json.edhrec.com/pages/${clean}`;
}

function normalizeDetailPath(href) {
  const clean = String(href || '').split('#')[0];
  if (!/^\/combos\//.test(clean)) return null;
  if (/^\/combos\/?$/.test(clean)) return null;
  if (CATEGORY_RE.test(clean)) return null;
  return clean;
}

function comboIdFromPath(detailPath) {
  return String(detailPath || '').replace(/^\/combos\//, '').replace(/[^a-z0-9_-]+/gi, '-');
}

function parseNextDataResult(html) {
  const match = String(html || '').match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) return { present: false, data: null, error: null };
  try {
    return { present: true, data: JSON.parse(decodeHtml(match[1])), error: null };
  } catch (err) {
    return { present: true, data: null, error: `invalid __NEXT_DATA__: ${err.message}` };
  }
}

function parseNextData(html) {
  return parseNextDataResult(html).data;
}

function cardNamesFromCardlistEntry(entry) {
  const fromViews = Array.isArray(entry && entry.cardviews)
    ? entry.cardviews.map(card => compactText(card && card.name)).filter(Boolean)
    : [];
  if (fromViews.length) return [...new Set(fromViews)];
  const header = compactText(entry && entry.header).replace(/\s*\([^)]*decks?\)\s*$/i, '');
  return header.split(/\s+\+\s+/).map(compactText).filter(Boolean);
}

function comboFromCardlistEntry(entry, category) {
  const detailPath = normalizeDetailPath(entry && entry.href);
  if (!detailPath) return null;
  const combo = entry.combo || {};
  const cards = cardNamesFromCardlistEntry(entry);
  return {
    id: comboIdFromPath(detailPath),
    detailPath,
    url: BASE_URL + detailPath,
    categories: [category],
    cards,
    cardCount: cards.length,
    prerequisites: [],
    steps: [],
    results: Array.isArray(combo.results) ? combo.results.map(compactText).filter(Boolean) : [],
    metadata: {
      deckCount: typeof combo.count === 'number' ? combo.count : null,
      eligibleDecks: typeof combo.maxCount === 'number' ? combo.maxCount : null,
      rank: typeof combo.rank === 'number' ? combo.rank : null,
      spellbook: null,
      comboVote: combo.comboVote || null,
      percentage: typeof combo.percentage === 'number' ? combo.percentage : null,
      colors: combo.colors || null,
    },
  };
}

function mergeMetadata(existing, incoming) {
  const merged = Object.assign({}, existing || {});
  for (const [key, value] of Object.entries(incoming || {})) {
    if (value !== null && value !== undefined) merged[key] = value;
  }
  return merged;
}

function mergeComboSeed(existing, incoming) {
  if (!existing) return incoming;
  return Object.assign({}, existing, incoming, {
    categories: mergeCategories(existing.categories, incoming.categories),
    cards: incoming.cards && incoming.cards.length ? incoming.cards : existing.cards,
    cardCount: incoming.cardCount || existing.cardCount,
    prerequisites: incoming.prerequisites && incoming.prerequisites.length ? incoming.prerequisites : existing.prerequisites,
    steps: incoming.steps && incoming.steps.length ? incoming.steps : existing.steps,
    results: incoming.results && incoming.results.length ? incoming.results : existing.results,
    metadata: mergeMetadata(existing.metadata, incoming.metadata),
  });
}

function parseCardlistEntries(cardlists, category) {
  const details = [];
  const seen = new Set();
  for (const entry of cardlists || []) {
    const combo = comboFromCardlistEntry(entry, category);
    if (!combo || seen.has(combo.detailPath)) continue;
    seen.add(combo.detailPath);
    details.push(combo);
  }
  return details;
}

function comboPayloadFromNextData(data) {
  return data && data.props && data.props.pageProps && data.props.pageProps.data
    && data.props.pageProps.data.container && data.props.pageProps.data.container.json_dict || null;
}

function nextDataComboPayload(html) {
  return comboPayloadFromNextData(parseNextData(html));
}

function discoverCategoriesFromIndex(html) {
  const categories = [];
  const seen = new Set();
  const re = /href="(\/combos\/[^"#?]+)"/gi;
  let match;
  while ((match = re.exec(String(html || ''))) !== null) {
    const clean = decodeHtml(match[1]).split('#')[0];
    const category = (clean.match(CATEGORY_RE) || [])[1];
    if (!category || seen.has(category)) continue;
    seen.add(category);
    categories.push(category);
  }
  return categories;
}

function parseCategoryPageResult(html, category) {
  const parsed = parseNextDataResult(html);
  const diagnostics = [];
  let embedded = null;
  if (parsed.error) {
    diagnostics.push({ stage: 'category-parse', category, error: parsed.error });
  } else if (parsed.present) {
    embedded = comboPayloadFromNextData(parsed.data);
    if (!embedded) {
      diagnostics.push({
        stage: 'category-schema',
        category,
        error: '__NEXT_DATA__ missing props.pageProps.data.container.json_dict',
      });
    }
  }
  const details = /** @type {any[]} */ (parseCardlistEntries(embedded && embedded.cardlists, category));
  const seen = new Set(details.map(detail => detail.detailPath));
  const re = /<a\s+[^>]*href="([^"]+)"[^>]*>\s*<button[^>]*>\s*View combo details\s*<\/button>\s*<\/a>/gi;
  let match;
  while ((match = re.exec(String(html || ''))) !== null) {
    const detailPath = normalizeDetailPath(decodeHtml(match[1]));
    if (!detailPath || seen.has(detailPath)) continue;
    seen.add(detailPath);
    details.push({ id: comboIdFromPath(detailPath), detailPath, url: BASE_URL + detailPath, categories: [category] });
  }
  return {
    details,
    more: embedded && typeof embedded.more === 'string' ? embedded.more : null,
    diagnostics,
  };
}

function parseCategoryPage(html, category) {
  return parseCategoryPageResult(html, category).details;
}

function parseCategoryMorePath(html) {
  return parseCategoryPageResult(html, '').more;
}

function parsePaginatedComboJson(text, category) {
  const payload = JSON.parse(String(text || '{}'));
  return {
    details: parseCardlistEntries(payload.cardlists || [], category),
    more: typeof payload.more === 'string' ? payload.more : null,
    isPaginated: Boolean(payload.is_paginated),
  };
}

function cardNamesFromDetailHtml(html) {
  const beforeRelated = String(html || '').split(/Played with this combo/i)[0];
  const names = [];
  const seen = new Set();
  const re = /<span\s+class="[^"]*Card_name__[^"]*"[^>]*>([\s\S]*?)<\/span>/gi;
  let match;
  while ((match = re.exec(beforeRelated)) !== null) {
    const name = compactText(match[1]);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}

function linesBetween(lines, startRe, endRe) {
  const start = lines.findIndex(line => startRe.test(line));
  if (start < 0) return [];
  const out = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (endRe && endRe.test(lines[i])) break;
    out.push(lines[i]);
  }
  return out.filter(line => !/^#+\s*/.test(line));
}

function removeQuestionLines(lines) {
  return lines.filter(line => !/^what do i|get from this combo|how does this combo/i.test(line));
}

function parseSteps(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\d+$/.test(line) && lines[i + 1]) {
      out.push(lines[++i]);
    } else if (!/^how does this combo work\??$/i.test(line) && !/^#+/.test(line)) {
      out.push(line);
    }
  }
  return out.filter(Boolean);
}

function parseNumber(text) {
  const raw = String(text || '').replace(/,/g, '');
  if (/\d+(?:\.\d+)?K/i.test(raw)) return Math.round(parseFloat(raw) * 1000);
  const m = raw.match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

function parseEligibleDeckCount(text) {
  const raw = String(text || '').replace(/,/g, '');
  const m = raw.match(/OF\s+(\d+(?:\.\d+)?K?)\s+ELIGIBLE DECKS/i);
  return m ? parseNumber(m[1]) : null;
}

function parseComboDetailPage(html, fallback = {}) {
  const lines = htmlToLines(html);
  const cards = cardNamesFromDetailHtml(html);
  const prerequisites = removeQuestionLines(linesBetween(lines, /Prerequisites/i, /Steps/i))
    .filter(line => !/^available$/i.test(line));
  const steps = parseSteps(linesBetween(lines, /How does this combo work\?/i, /Results/i));
  const results = removeQuestionLines(linesBetween(lines, /What do I get from this combo\?/i, /Combo Metadata|Commander Bracket Information/i))
    .filter(line => !/^\+ \d+ more results$/i.test(line));
  const detailPath = fallback.detailPath || null;
  const deckCountIndex = lines.findIndex(line => /^DECKS$/i.test(line));
  const deckCount = deckCountIndex > 0 ? parseNumber(lines[deckCountIndex - 1]) : null;
  const rankLine = lines.find(line => /^Rank \d+/i.test(line));
  const eligibleLine = lines.find(line => /OF .* ELIGIBLE DECKS/i.test(line));
  const spellbook = [...String(html || '').matchAll(/href="(https:\/\/commanderspellbook\.com[^"]+)"/gi)].map(m => decodeHtml(m[1]))[0] || null;
  return {
    id: fallback.id || comboIdFromPath(detailPath || ''),
    detailPath,
    url: fallback.url || (detailPath ? BASE_URL + detailPath : null),
    categories: fallback.categories || [],
    cards,
    cardCount: cards.length,
    prerequisites,
    steps,
    results,
    metadata: {
      deckCount,
      eligibleDecks: parseEligibleDeckCount(eligibleLine),
      rank: parseNumber(rankLine),
      spellbook,
    },
  };
}

function mergeCategories(existing, incoming) {
  return [...new Set([...(existing || []), ...(incoming || [])])].sort();
}

function normalizeCache(raw) {
  return {
    meta: raw && raw.meta || {},
    categories: raw && raw.categories || {},
    combos: Array.isArray(raw && raw.combos) ? raw.combos : [],
    failures: Array.isArray(raw && raw.failures) ? raw.failures : [],
  };
}

function failureKey(failure) {
  return [
    failure && failure.url,
    failure && failure.stage,
    failure && failure.category,
    failure && failure.detailPath,
  ].filter(Boolean).join('#');
}

function setFailure(failuresByUrl, failure) {
  failuresByUrl.set(failureKey(failure), failure);
}

function deleteFailuresForUrlStage(failuresByUrl, url, stagePrefix) {
  for (const [key, failure] of failuresByUrl.entries()) {
    if (!failure || failure.url !== url) continue;
    if (!stagePrefix || String(failure.stage || '').startsWith(stagePrefix)) failuresByUrl.delete(key);
  }
}

function loadCache(out) {
  if (!fs.existsSync(out)) return normalizeCache(null);
  return normalizeCache(JSON.parse(fs.readFileSync(out, 'utf8')));
}

function limitForJson(value) {
  return value === Infinity ? 'all' : value;
}

function buildOutput(opts, categories, combosByPath, failuresByUrl) {
  const combos = [...combosByPath.values()].sort((a, b) => (b.metadata?.deckCount || 0) - (a.metadata?.deckCount || 0) || a.detailPath.localeCompare(b.detailPath));
  const failures = [...failuresByUrl.values()].sort((a, b) => a.url.localeCompare(b.url));
  return {
    meta: {
      source: BASE_URL + '/combos',
      generatedAt: new Date().toISOString(),
      categoryCount: Object.keys(categories).length,
      comboCount: combos.length,
      failureCount: failures.length,
      options: {
        categories: opts.categories,
        perCategory: limitForJson(opts.perCategory),
        maxDetails: limitForJson(opts.maxDetails),
        maxPagesPerCategory: limitForJson(opts.maxPagesPerCategory),
        discoverCategories: opts.discoverCategories,
        fetchDetails: opts.fetchDetails,
        fresh: opts.fresh,
      },
      detailPagesFetched: combos.filter(combo => combo.fetchedAt && combo.steps && combo.steps.length).length,
      complete: failures.length === 0,
    },
    categories,
    combos,
    failures,
  };
}

function writeCache(out, payload) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(payload, null, 2));
}

async function httpGet(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'mtg-rulesbuilder-analysis/1.0', Accept: 'text/html,*/*' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

async function fetchEdhrecCombos(opts, fetcher = httpGet) {
  opts = Object.assign(defaultOptions(), opts || {});
  const cache = opts.fresh ? normalizeCache(null) : loadCache(opts.out);
  const categories = Object.assign({}, cache.categories || {});
  const combosByPath = new Map((cache.combos || []).filter(c => c.detailPath).map(c => [c.detailPath, c]));
  const failuresByUrl = new Map((cache.failures || []).filter(f => f.url).map(f => [failureKey(f), f]));
  let categoriesToFetch = opts.categories.slice();

  if (opts.discoverCategories) {
    const url = BASE_URL + '/combos';
    process.stdout.write('[index] discovering categories … ');
    try {
      const html = await fetcher(url);
      const discovered = discoverCategoriesFromIndex(html);
      if (discovered.length) categoriesToFetch = discovered;
      deleteFailuresForUrlStage(failuresByUrl, url, 'index');
      process.stdout.write(`${categoriesToFetch.length} categories\n`);
    } catch (err) {
      setFailure(failuresByUrl, { url, stage: 'index', error: err.message, failedAt: new Date().toISOString() });
      process.stdout.write(`✗ ${err.message}; falling back to ${categoriesToFetch.length} configured categories\n`);
    }
  }

  for (const category of categoriesToFetch) {
    const url = categoryUrl(category);
    process.stdout.write(`[category] ${category} … `);
    try {
      const html = await fetcher(url);
      const parsedCategory = parseCategoryPageResult(html, category);
      const found = parsedCategory.details;
      let more = parsedCategory.more;
      let pageCount = 1;
      const seenMore = new Set();
      while (more && found.length < opts.perCategory && pageCount < opts.maxPagesPerCategory && !seenMore.has(more)) {
        seenMore.add(more);
        const moreUrl = jsonPageUrl(more);
        if (!moreUrl) break;
        const json = await fetcher(moreUrl);
        const page = parsePaginatedComboJson(json, category);
        found.push(...page.details);
        more = page.more;
        pageCount++;
        deleteFailuresForUrlStage(failuresByUrl, moreUrl, 'page');
        if (opts.delayMs > 0) await sleep(opts.delayMs);
      }
      const included = found.slice(0, opts.perCategory);
      categories[category] = {
        url,
        found: included.length,
        fetchedPages: pageCount,
        exhausted: !more || included.length < opts.perCategory,
        availableInFetchedPages: found.length,
        fetchedAt: new Date().toISOString(),
      };
      for (const seed of included) {
        const existing = combosByPath.get(seed.detailPath);
        combosByPath.set(seed.detailPath, mergeComboSeed(existing, seed));
      }
      deleteFailuresForUrlStage(failuresByUrl, url, 'category');
      for (const diagnostic of parsedCategory.diagnostics) {
        setFailure(failuresByUrl, Object.assign({ url, failedAt: new Date().toISOString() }, diagnostic));
      }
      process.stdout.write(`${included.length} combos from ${pageCount} page(s)${more && included.length >= opts.perCategory ? ' (limit reached)' : ''}\n`);
    } catch (err) {
      setFailure(failuresByUrl, { url, category, stage: 'category', error: err.message, failedAt: new Date().toISOString() });
      process.stdout.write(`✗ ${err.message}\n`);
    }
    writeCache(opts.out, buildOutput(opts, categories, combosByPath, failuresByUrl));
    if (opts.delayMs > 0) await sleep(opts.delayMs);
  }

  const seeds = opts.fetchDetails ? [...combosByPath.values()].slice(0, opts.maxDetails) : [];
  for (let i = 0; i < seeds.length; i++) {
    const seed = seeds[i];
    if (!opts.force && Array.isArray(seed.steps) && seed.steps.length) continue;
    process.stdout.write(`[detail ${i + 1}/${seeds.length}] ${seed.detailPath} … `);
    try {
      const html = await fetcher(seed.url);
      const parsed = parseComboDetailPage(html, seed);
      combosByPath.set(seed.detailPath, mergeComboSeed(seed, Object.assign({}, parsed, { fetchedAt: new Date().toISOString() })));
      deleteFailuresForUrlStage(failuresByUrl, seed.url, 'detail');
      process.stdout.write(`${parsed.cards.length} cards, ${parsed.results.length} results\n`);
    } catch (err) {
      setFailure(failuresByUrl, { url: seed.url, detailPath: seed.detailPath, stage: 'detail', error: err.message, failedAt: new Date().toISOString() });
      process.stdout.write(`✗ ${err.message}\n`);
    }
    writeCache(opts.out, buildOutput(opts, categories, combosByPath, failuresByUrl));
    if (opts.delayMs > 0) await sleep(opts.delayMs);
  }

  const payload = buildOutput(opts, categories, combosByPath, failuresByUrl);
  writeCache(opts.out, payload);
  return payload;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const payload = await fetchEdhrecCombos(opts);
  process.stdout.write(`\n✓ wrote ${opts.out}\n`);
  process.stdout.write(`categories ${payload.meta.categoryCount}; combos ${payload.meta.comboCount}; failures ${payload.meta.failureCount}; complete ${payload.meta.complete}\n`);
  if (!payload.meta.complete) process.exitCode = 1;
}

if (require.main === module) {
  main().catch(err => { console.error(err); process.exit(1); });
} else {
  module.exports = {
    BASE_URL,
    DEFAULT_CATEGORIES,
    parseArgs,
    decodeHtml,
    discoverCategoriesFromIndex,
    htmlToLines,
    jsonPageUrl,
    parseNextDataResult,
    parseCategoryPageResult,
    parseCategoryPage,
    parsePaginatedComboJson,
    parseComboDetailPage,
    fetchEdhrecCombos,
  };
}
