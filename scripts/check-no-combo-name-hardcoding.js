#!/usr/bin/env node
/*
 * check-no-combo-name-hardcoding.js — guard against card-name combo branches.
 *
 * Card names are allowed in tests, fixtures, scraped caches, reports, and docs.
 * They are not allowed in classifier/proof algorithm files where they could
 * become bespoke combo rules.
 */
const fs = require('node:fs');
const path = require('node:path');
const { createProgress } = require('../lib/progress');

const ROOT = path.resolve(__dirname, '..');
const CORE_LOGIC_FILES = [
  'src/interaction-model.js',
  'src/interaction-indexes.js',
  'src/interaction-hypergraph.js',
  'src/interaction-proof-search.js',
  'src/interaction-proof-packages.js',
  'src/face-classification.js',
  'src/card-faces.js',
  'src/build-deck-viz.js',
  'src/semantic-proof-utils.js',
  'src/combo-detection/benchmark.ts',
  'src/combo-detection/contracts.ts',
  'src/combo-detection/index.ts',
  'src/combo-detection/strategies.ts',
  'analysis/edhrec-combos/evaluate-edhrec-combos.js',
];
const REQUIRED_CARD_NAME_SOURCES = [
  'analysis/edhrec-combos/evidence-card-names.json',
];
const OPTIONAL_CARD_NAME_SOURCES = [
  'analysis/edhrec-combos/edhrec-combo-cache.json',
];
const CARD_NAME_SOURCES = [...REQUIRED_CARD_NAME_SOURCES, ...OPTIONAL_CARD_NAME_SOURCES];
const MIN_CARD_NAME_CHARS = 5;

function repoPath(file, root = ROOT) {
  return path.isAbsolute(file) ? file : path.join(root, file);
}

function readJsonIfExists(relativePath, options = {}) {
  const root = options.root || ROOT;
  const file = path.join(root, relativePath);
  if (!fs.existsSync(file)) {
    if (options.required) throw new Error(`Required card-name evidence source is missing: ${relativePath}`);
    return null;
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function collectNamesFromValue(value, names = new Set()) {
  if (!value) return names;
  if (Array.isArray(value)) {
    for (const item of value) collectNamesFromValue(item, names);
    return names;
  }
  if (typeof value !== 'object') return names;

  if (Array.isArray(value.cards)) {
    for (const card of value.cards) {
      if (typeof card === 'string') names.add(card);
      else if (card && typeof card.id === 'string') names.add(card.id);
      else if (card && typeof card.name === 'string') names.add(card.name);
    }
  }
  if (Array.isArray(value.names)) {
    for (const name of value.names) if (typeof name === 'string') names.add(name);
  }

  for (const key of ['cases', 'combos', 'items']) collectNamesFromValue(value[key], names);
  return names;
}

function canonicalizeMentionText(value) {
  return String(value || '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[\u2018\u2019\u201b`´]/g, "'")
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeNames(names) {
  const byCanonical = new Map();
  for (const raw of names || []) {
    const name = String(raw || '').trim();
    const canonical = canonicalizeMentionText(name);
    if (name.length < MIN_CARD_NAME_CHARS || canonical.length < MIN_CARD_NAME_CHARS) continue;
    if (!/[a-z]/i.test(name)) continue;
    if (!byCanonical.has(canonical)) byCanonical.set(canonical, name);
  }
  return [...byCanonical.values()].sort((a, b) => a.localeCompare(b));
}

function hasDistinctiveOptionalShape(name) {
  const canonical = canonicalizeMentionText(name);
  if (canonical.split(' ').filter(Boolean).length >= 2) return true;
  return /['’`,:\/-]/.test(String(name || ''));
}

function collectEvidenceCardNames(root = ROOT) {
  const names = new Set();
  for (const source of REQUIRED_CARD_NAME_SOURCES) collectNamesFromValue(readJsonIfExists(source, { required: true, root }), names);
  for (const source of OPTIONAL_CARD_NAME_SOURCES) {
    const optionalNames = collectNamesFromValue(readJsonIfExists(source, { root }));
    for (const name of optionalNames) {
      if (hasDistinctiveOptionalShape(name)) names.add(name);
    }
  }
  return normalizeNames(names);
}

function lineColumn(text, offset) {
  const before = text.slice(0, offset);
  const lines = before.split('\n');
  return { line: lines.length, column: lines[lines.length - 1].length + 1 };
}

function stripJsComments(text) {
  return String(text || '')
    .replace(/\/\*[\s\S]*?\*\//g, match => ' '.repeat(match.length))
    .replace(/(^|[^:])\/\/.*$/gm, (match, prefix) => prefix + ' '.repeat(match.length - prefix.length));
}

function walkFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(full));
    else if (entry.isFile()) files.push(full);
  }
  return files;
}

function toPosixRelative(root, file) {
  return path.relative(root, file).split(path.sep).join('/');
}

function isCoreLogicCandidate(relativePath) {
  if (!relativePath.startsWith('src/')) return false;
  if (!/\.(js|ts)$/.test(relativePath)) return false;
  if (relativePath === 'src/combo-family-library.js') return false;
  if (relativePath.startsWith('src/combo-detection/')) return true;
  return /^src\/interaction-[^/]+\.js$/.test(relativePath)
    || CORE_LOGIC_FILES.includes(relativePath);
}

function discoverCoreLogicFiles(root = ROOT) {
  const discovered = walkFiles(path.join(root, 'src'))
    .map(file => toPosixRelative(root, file))
    .filter(isCoreLogicCandidate);
  return [...new Set([...CORE_LOGIC_FILES, ...discovered]
    .filter(file => fs.existsSync(repoPath(file, root))))]
    .sort((a, b) => a.localeCompare(b));
}

function findNameMentions(file, names, root = ROOT) {
  const raw = fs.readFileSync(repoPath(file, root), 'utf8');
  const text = stripJsComments(raw);
  const findings = [];
  const needles = normalizeNames(names).map(name => ({ name, canonical: canonicalizeMentionText(name) }));
  const lines = text.split('\n');
  let offset = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const canonicalLine = canonicalizeMentionText(line);
    for (const needle of needles) {
      if (canonicalLine.includes(needle.canonical)) {
        const loc = lineColumn(text, offset);
        findings.push({ file, name: needle.name, line: loc.line, column: 1 });
      }
    }
    offset += line.length + 1;
  }
  return findings;
}

function runNoComboNameHardcodingCheck(options = {}) {
  const root = options.root || ROOT;
  const names = normalizeNames(options.names || collectEvidenceCardNames(root));
  const files = options.files || discoverCoreLogicFiles(root);
  const progress = createProgress('no-hardcode-scan', files.length, { every: 1 });
  progress.start(`names=${names.length}`);
  const findings = [];
  for (let i = 0; i < files.length; i++) {
    const fileFindings = findNameMentions(files[i], names, root);
    findings.push(...fileFindings);
    progress.tick(i + 1, `findings=${findings.length} last=${files[i]}`);
  }
  progress.done(`findings=${findings.length}`);
  return {
    ok: findings.length === 0,
    checkedFiles: files,
    checkedNameCount: names.length,
    findings,
  };
}

function main() {
  const result = runNoComboNameHardcodingCheck();
  if (!result.ok) {
    process.stderr.write('Combo card-name hardcoding guard failed:\n');
    for (const item of result.findings) process.stderr.write(`- ${item.file}:${item.line}:${item.column} mentions ${JSON.stringify(item.name)}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`No combo card-name hardcoding found in ${result.checkedFiles.length} core files (${result.checkedNameCount} evidence names checked)\n`);
}

if (require.main === module) main();
else module.exports = {
  CORE_LOGIC_FILES,
  REQUIRED_CARD_NAME_SOURCES,
  OPTIONAL_CARD_NAME_SOURCES,
  CARD_NAME_SOURCES,
  canonicalizeMentionText,
  collectEvidenceCardNames,
  discoverCoreLogicFiles,
  hasDistinctiveOptionalShape,
  runNoComboNameHardcodingCheck,
  stripJsComments,
};
