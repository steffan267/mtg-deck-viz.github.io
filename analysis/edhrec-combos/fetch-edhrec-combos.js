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
  'five-color',
];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function usage() {
  console.error('Usage: node analysis/edhrec-combos/fetch-edhrec-combos.js [--out file] [--categories a,b] [--per-category n] [--max-details n] [--delay-ms n] [--force]');
  process.exit(2);
}

function parsePositiveInt(value, fallback) {
  const n = parseInt(String(value), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseArgs(argv) {
  const opts = {
    out: DEFAULT_OUT,
    categories: DEFAULT_CATEGORIES.slice(),
    perCategory: 20,
    maxDetails: 160,
    delayMs: 250,
    force: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--out') opts.out = argv[++i];
    else if (arg === '--categories') opts.categories = String(argv[++i] || '').split(',').map(s => s.trim()).filter(Boolean);
    else if (arg === '--per-category') opts.perCategory = parsePositiveInt(argv[++i], opts.perCategory);
    else if (arg === '--max-details') opts.maxDetails = parsePositiveInt(argv[++i], opts.maxDetails);
    else if (arg === '--delay-ms') opts.delayMs = parsePositiveInt(argv[++i], opts.delayMs);
    else if (arg === '--force') opts.force = true;
    else if (arg === '--help') usage();
    else usage();
  }
  return opts;
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

function normalizeDetailPath(href) {
  const clean = String(href || '').split('#')[0];
  if (!/^\/combos\//.test(clean)) return null;
  if (/^\/combos\/?$/.test(clean)) return null;
  if (/\/combos\/(early-game-2-card-combos|late-game-2-card-combos|mono-|colorless|azorius|dimir|rakdos|gruul|selesnya|orzhov|izzet|golgari|boros|simic|esper|grixis|jund|naya|bant|abzan|jeskai|sultai|mardu|temur|five-color|yore-tiller|glint-eye|dune-brood|ink-treader|witch-maw)$/.test(clean)) return null;
  return clean;
}

function comboIdFromPath(detailPath) {
  return String(detailPath || '').replace(/^\/combos\//, '').replace(/[^a-z0-9_-]+/gi, '-');
}

function parseCategoryPage(html, category) {
  const details = [];
  const seen = new Set();
  const re = /<a\s+[^>]*href="([^"]+)"[^>]*>\s*<button[^>]*>\s*View combo details\s*<\/button>\s*<\/a>/gi;
  let match;
  while ((match = re.exec(String(html || ''))) !== null) {
    const detailPath = normalizeDetailPath(decodeHtml(match[1]));
    if (!detailPath || seen.has(detailPath)) continue;
    seen.add(detailPath);
    details.push({ id: comboIdFromPath(detailPath), detailPath, url: BASE_URL + detailPath, categories: [category] });
  }
  return details;
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

function loadCache(out) {
  if (!fs.existsSync(out)) return normalizeCache(null);
  return normalizeCache(JSON.parse(fs.readFileSync(out, 'utf8')));
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
        perCategory: opts.perCategory,
        maxDetails: opts.maxDetails,
      },
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
  const cache = loadCache(opts.out);
  const categories = Object.assign({}, cache.categories || {});
  const combosByPath = new Map((cache.combos || []).filter(c => c.detailPath).map(c => [c.detailPath, c]));
  const failuresByUrl = new Map((cache.failures || []).filter(f => f.url).map(f => [f.url, f]));

  for (const category of opts.categories) {
    const url = categoryUrl(category);
    process.stdout.write(`[category] ${category} … `);
    try {
      const html = await fetcher(url);
      const found = parseCategoryPage(html, category).slice(0, opts.perCategory);
      categories[category] = { url, found: found.length, fetchedAt: new Date().toISOString() };
      for (const seed of found) {
        const existing = combosByPath.get(seed.detailPath);
        if (existing) existing.categories = mergeCategories(existing.categories, seed.categories);
        else combosByPath.set(seed.detailPath, seed);
      }
      failuresByUrl.delete(url);
      process.stdout.write(`${found.length} detail links\n`);
    } catch (err) {
      failuresByUrl.set(url, { url, category, stage: 'category', error: err.message, failedAt: new Date().toISOString() });
      process.stdout.write(`✗ ${err.message}\n`);
    }
    writeCache(opts.out, buildOutput(opts, categories, combosByPath, failuresByUrl));
    if (opts.delayMs > 0) await sleep(opts.delayMs);
  }

  const seeds = [...combosByPath.values()].slice(0, opts.maxDetails);
  for (let i = 0; i < seeds.length; i++) {
    const seed = seeds[i];
    if (!opts.force && Array.isArray(seed.cards) && seed.cards.length && Array.isArray(seed.results) && seed.results.length) continue;
    process.stdout.write(`[detail ${i + 1}/${seeds.length}] ${seed.detailPath} … `);
    try {
      const html = await fetcher(seed.url);
      const parsed = parseComboDetailPage(html, seed);
      combosByPath.set(seed.detailPath, Object.assign({}, seed, parsed, { fetchedAt: new Date().toISOString() }));
      failuresByUrl.delete(seed.url);
      process.stdout.write(`${parsed.cards.length} cards, ${parsed.results.length} results\n`);
    } catch (err) {
      failuresByUrl.set(seed.url, { url: seed.url, detailPath: seed.detailPath, stage: 'detail', error: err.message, failedAt: new Date().toISOString() });
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
    htmlToLines,
    parseCategoryPage,
    parseComboDetailPage,
    fetchEdhrecCombos,
  };
}
