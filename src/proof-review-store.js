/*
 * proof-review-store.js — append-only local JSONL persistence for manual proof review.
 *
 * This module intentionally stores review lifecycle data outside the runtime proof
 * engine. The deterministic engine remains the authority; these records are
 * routing/review artifacts for local analysis under analysis/proof-review/.
 */
const fs = require('fs');
const path = require('path');

const DEFAULT_PROOF_REVIEW_DIR = path.resolve(__dirname, '..', 'analysis', 'proof-review');

const REVIEW_FILES = Object.freeze({
  cards: 'cards.jsonl',
  decks: 'decks.jsonl',
  interactionCandidates: 'interaction-candidates.jsonl',
  proofAttempts: 'proof-attempts.jsonl',
  proofReviews: 'proof-reviews.jsonl',
  proofPackages: 'proof-packages.jsonl',
  engineRuns: 'engine-runs.jsonl',
  goldenTests: 'golden-tests.jsonl',
  llmDrafts: 'llm-drafts.jsonl',
});

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function storePath(storeDir, key) {
  const file = REVIEW_FILES[key] || key;
  return path.join(storeDir || DEFAULT_PROOF_REVIEW_DIR, file);
}

function stableJson(value) {
  return JSON.stringify(value);
}

function appendJsonl(file, record) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, stableJson(record) + '\n');
  return record;
}

function appendRecord(storeDir, key, record) {
  return appendJsonl(storePath(storeDir, key), record);
}

function readJsonl(file, options = {}) {
  if (!fs.existsSync(file)) return [];
  const text = fs.readFileSync(file, 'utf8');
  if (!text.trim()) return [];
  const rows = [];
  const lines = text.split(/\n/);
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line));
    } catch (error) {
      if (options.skipMalformed) continue;
      const err = new Error('Malformed JSONL in ' + file + ' at line ' + (index + 1) + ': ' + error.message);
      err.cause = error;
      throw err;
    }
  }
  return rows;
}

function readRecords(storeDir, key, options = {}) {
  return readJsonl(storePath(storeDir, key), options);
}

function latestById(records, idField) {
  const latest = new Map();
  for (const record of records || []) {
    const id = record && record[idField];
    if (!id) continue;
    latest.set(id, record);
  }
  return [...latest.values()];
}

function appendStatusUpdate(storeDir, key, idField, id, patch, options = {}) {
  const records = readRecords(storeDir, key);
  const current = [...records].reverse().find(record => record && record[idField] === id);
  if (!current && !options.allowMissing) throw new Error('Cannot update missing ' + key + ' record: ' + id);
  const stamp = new Date().toISOString();
  const next = Object.assign({}, current || { [idField]: id, created_at: stamp }, patch, { updated_at: stamp });
  return appendRecord(storeDir, key, next);
}

function initializeStore(storeDir) {
  const dir = ensureDir(storeDir || DEFAULT_PROOF_REVIEW_DIR);
  for (const file of Object.values(REVIEW_FILES)) {
    const target = path.join(dir, file);
    if (!fs.existsSync(target)) fs.writeFileSync(target, '');
  }
}

module.exports = {
  DEFAULT_PROOF_REVIEW_DIR,
  REVIEW_FILES,
  appendJsonl,
  appendRecord,
  appendStatusUpdate,
  ensureDir,
  initializeStore,
  latestById,
  readJsonl,
  readRecords,
  storePath,
};
