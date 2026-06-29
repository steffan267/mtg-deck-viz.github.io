/*
 * proof-review-store.js — append-only local JSONL persistence for manual proof review.
 *
 * This module intentionally stores review lifecycle data outside the runtime proof
 * engine. The deterministic engine remains the authority; these records are
 * routing/review artifacts for local analysis under analysis/proof-review/.
 *
 * Storage layout (Phase 0 sharding):
 *   Each stream is sharded into <stream-dir>/<shard>.jsonl where <shard> is the
 *   first two hex chars of the record's sha1-based id (the id FIELD differs per
 *   stream — see ID_FIELDS). A per-stream sidecar index.jsonl (latest-line-wins)
 *   maps id -> {shard, status, updated_at} for fast lookups without scanning every
 *   shard. The llmDrafts stream additionally maintains a by-source.jsonl secondary
 *   index keyed by source_proof_id.
 *
 * Back-compat: legacy flat <stream>.jsonl files are still readable. The read path
 * is mutually exclusive — if the sharded <stream-dir>/ exists we read ONLY shards,
 * otherwise we read ONLY the legacy flat file (never both, to avoid double counting).
 * Use the migrate-store command (migrateStore) to convert legacy flat files into
 * shards + indexes.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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
  comboSweepProgress: 'combo-sweep-progress.jsonl',
  completenessProgress: 'completeness-progress.jsonl',
});

// Stream key -> the field on each record that carries its sha1-based id.
// Verified against src/proof-review-pipeline.js record writers:
//   cards: cardRecord -> card_id ; decks: deck record -> deck_id
//   interactionCandidates: candidateFromEdgeFamily -> candidate_id
//   proofAttempts: attemptFrom* -> proof_id ; proofReviews: importReview -> review_id
//   proofPackages: Object.assign({...}, pkg) where pkg.id -> id
//   engineRuns: run records -> run_id ; goldenTests: Object.assign({...}, fixture) fixture.proof_id -> proof_id
//   llmDrafts: draftProofs -> draft_id (secondary index keyed by source_proof_id)
const ID_FIELDS = Object.freeze({
  cards: 'card_id',
  decks: 'deck_id',
  interactionCandidates: 'candidate_id',
  proofAttempts: 'proof_id',
  proofReviews: 'review_id',
  proofPackages: 'id',
  engineRuns: 'run_id',
  goldenTests: 'proof_id',
  llmDrafts: 'draft_id',
  comboSweepProgress: 'combo_id',
  completenessProgress: 'card_id',
});

const INDEX_FILE = 'index.jsonl';
const BY_SOURCE_FILE = 'by-source.jsonl';
const BY_SOURCE_STREAMS = Object.freeze({ llmDrafts: 'source_proof_id' });

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function streamFileName(key) {
  return REVIEW_FILES[key] || key;
}

// Legacy flat-file path for a stream. Kept for back-compat reads, migration, and
// callers that resolve a stream path directly (e.g. coverage-report purity test).
function storePath(storeDir, key) {
  return path.join(storeDir || DEFAULT_PROOF_REVIEW_DIR, streamFileName(key));
}

// Sharded stream directory: drops the .jsonl extension from the flat file name so
// e.g. proof-attempts.jsonl -> proof-attempts/.
function shardDir(storeDir, key) {
  const base = streamFileName(key).replace(/\.jsonl$/, '');
  return path.join(storeDir || DEFAULT_PROOF_REVIEW_DIR, base);
}

function idFieldFor(key) {
  return ID_FIELDS[key] || 'id';
}

function sha1Hex(value) {
  return crypto.createHash('sha1').update(value).digest('hex');
}

// Resolve the shard key (first two hex chars of the record's sha1-based id) for a
// record. Record ids are typed-prefixed sha1 hex (e.g. "proof_1a2b..."); we take
// the first two chars of the hex suffix. Ids that are not hex-suffixed are hashed
// to a stable 2-char shard, as are records lacking an explicit id (e.g. minimal
// cards seeded in tests) so every record is placed deterministically.
function shardFor(key, record) {
  const id = record && record[idFieldFor(key)];
  if (id === undefined || id === null || id === '') {
    return sha1Hex(JSON.stringify(record)).slice(0, 2);
  }
  const hex = String(id).match(/([0-9a-f]{2,})$/i);
  if (hex) return hex[1].slice(0, 2).toLowerCase();
  return sha1Hex(String(id)).slice(0, 2);
}

// The id used in the sidecar index. Falls back to a content hash when the record
// has no id field, keeping the index complete for streams that allow id-less rows.
function indexIdFor(key, record) {
  const id = record && record[idFieldFor(key)];
  if (id !== undefined && id !== null && id !== '') return String(id);
  return 'sha1:' + sha1Hex(JSON.stringify(record));
}

function stableJson(value) {
  return JSON.stringify(value);
}

function appendJsonl(file, record) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, stableJson(record) + '\n');
  return record;
}

// Append a record to a given stream directory, writing the shard line plus the
// sidecar index (and any secondary index). Order matters: the record is written
// first so the index never references a row that does not yet exist on disk.
//
// KNOWN DRIFT (intentional, not fixed here): the shard / index / by-source writes
// are three separate appends. A crash between them leaves an index or by-source line
// missing for a row that the full readRecords scan still returns. This is one-sided
// and bounded: the index can lag the shard, never the reverse, so an index/by-source
// entry never points at a nonexistent record. The only consequence is that
// draftProofs (which uses the by-source index for its skip-set) may re-draft a source
// whose by-source line was lost mid-crash — redundant work, never data loss or
// corruption, and self-healing on the next append. Fully reconciling on read would
// reintroduce the O(n) scan this layout exists to avoid, so it is left as documented
// drift rather than rebuilt eagerly.
function appendRecordToDir(dir, key, record) {
  const shard = shardFor(key, record);
  appendJsonl(path.join(dir, shard + '.jsonl'), record);

  const indexLine = {
    id: indexIdFor(key, record),
    shard,
    status: record && 'status' in record ? (record.status ?? null) : null,
    updated_at: record ? (record.updated_at ?? null) : null,
  };
  appendJsonl(path.join(dir, INDEX_FILE), indexLine);

  const sourceField = BY_SOURCE_STREAMS[key];
  if (sourceField && record && record[sourceField]) {
    appendJsonl(path.join(dir, BY_SOURCE_FILE), {
      [sourceField]: record[sourceField],
      [idFieldFor(key)]: record[idFieldFor(key)] ?? null,
      status: record && 'status' in record ? (record.status ?? null) : null,
      updated_at: record ? (record.updated_at ?? null) : null,
    });
  }
  return record;
}

// Append a record to its stream (resolving the real shard dir from storeDir+key).
function appendRecord(storeDir, key, record) {
  return appendRecordToDir(shardDir(storeDir, key), key, record);
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

function listShardFiles(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  return entries
    .filter(name => /^[0-9a-f]{2}\.jsonl$/i.test(name))
    .sort()
    .map(name => path.join(dir, name));
}

// A stream is considered "sharded" only if its dir exists AND holds at least one
// shard file. An existing-but-empty dir (e.g. created by a crash before the first
// append, or by something else) must NOT shadow a populated legacy flat file, so it
// is treated as not-yet-sharded by both the read path and migration. (Bug B guard.)
function hasShards(storeDir, key) {
  return listShardFiles(shardDir(storeDir, key)).length > 0;
}

// Read all records for a stream. Mutually exclusive: sharded dir wins when present,
// otherwise fall back to the legacy flat file. Shards are read in stable (sorted)
// order so a single shard's append order is preserved; cross-shard order is by
// shard name, which callers must not depend on (they reduce via latestById/index).
function readRecords(storeDir, key, options = {}) {
  const dir = shardDir(storeDir, key);
  if (hasShards(storeDir, key)) {
    const rows = [];
    for (const file of listShardFiles(dir)) {
      for (const row of readJsonl(file, options)) rows.push(row);
    }
    return rows;
  }
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

// Latest-per-id sidecar index entries for a stream (fast path; reads only the
// index.jsonl, not the shards). Returns [] when the stream is not sharded.
function readIndex(storeDir, key, options = {}) {
  const file = path.join(shardDir(storeDir, key), INDEX_FILE);
  return latestById(readJsonl(file, options), 'id');
}

// Resolve a single record by id: consult the index for its shard, then read only
// that shard and return the latest record for the id (or null).
function readRecordById(storeDir, key, id, options = {}) {
  const indexEntries = latestById(readJsonl(path.join(shardDir(storeDir, key), INDEX_FILE), options), 'id');
  const entry = indexEntries.find(item => item.id === String(id));
  if (!entry) return null;
  const idField = idFieldFor(key);
  const rows = readJsonl(path.join(shardDir(storeDir, key), entry.shard + '.jsonl'), options);
  let match = null;
  for (const row of rows) if (row && String(row[idField]) === String(id)) match = row;
  return match;
}

// Latest-per-source secondary index for streams with a by-source.jsonl (llmDrafts).
function readBySourceIndex(storeDir, key, options = {}) {
  const sourceField = BY_SOURCE_STREAMS[key];
  if (!sourceField) return [];
  const file = path.join(shardDir(storeDir, key), BY_SOURCE_FILE);
  return latestById(readJsonl(file, options), sourceField);
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
  // Create the store dir only. Shard dirs are created lazily on first append.
  // Legacy flat files are NOT recreated; reads fall back to them when present.
  return ensureDir(storeDir || DEFAULT_PROOF_REVIEW_DIR);
}

function rmrf(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

// Migrate legacy flat <stream>.jsonl files into shards + indexes. Crash-safe and
// restartable (Bug A guard):
//   - Each stream is built into a fresh temp dir, then atomically renamed into place
//     as the real shard dir. A crash before that rename leaves only an orphan temp
//     dir (removed on the next run) and the intact legacy flat file, so the stream is
//     fully re-migratable with no data loss and no double-write.
//   - The legacy flat file is renamed to <stream>.jsonl.migrated (recoverable, not
//     deleted) only AFTER the shard dir is in place.
//   - Idempotency is gated on the shard dir being POPULATED (hasShards), not merely
//     existing, so a crash-leftover empty dir does not falsely report 'already-sharded'.
// Returns per-stream counts.
function migrateStore(storeDir) {
  const dir = storeDir || DEFAULT_PROOF_REVIEW_DIR;
  const results = {};
  for (const key of Object.keys(REVIEW_FILES)) {
    const flatFile = storePath(dir, key);
    const sharded = shardDir(dir, key);

    if (hasShards(dir, key)) {
      results[key] = { status: 'already-sharded', migrated: 0 };
      continue;
    }
    if (!fs.existsSync(flatFile)) {
      results[key] = { status: 'no-legacy-file', migrated: 0 };
      continue;
    }

    // Clear any partial/empty shard dir and any stale temp dirs left by a previous
    // interrupted run so the atomic rename below has a clean target and we never
    // double-write.
    if (fs.existsSync(sharded)) rmrf(sharded);
    const baseName = path.basename(sharded);
    for (const name of fs.readdirSync(dir)) {
      if (name.startsWith(baseName + '.migrating.')) rmrf(path.join(dir, name));
    }

    const records = readJsonl(flatFile, { skipMalformed: true });
    if (records.length === 0) {
      // Empty legacy file: nothing to shard. Retire it so reruns report no-op; an
      // empty shard dir would be pointless and would re-trigger the Bug B guard.
      fs.renameSync(flatFile, flatFile + '.migrated');
      results[key] = { status: 'migrated', migrated: 0 };
      continue;
    }
    const tmp = sharded + '.migrating.' + process.pid + '.' + Date.now();
    // Build the whole stream (shards + index + by-source) under the temp dir.
    for (const record of records) appendRecordToDir(tmp, key, record);
    // Atomically publish the completed shard dir, then retire the legacy flat file.
    fs.renameSync(tmp, sharded);
    fs.renameSync(flatFile, flatFile + '.migrated');
    results[key] = { status: 'migrated', migrated: records.length };
  }
  return results;
}

module.exports = {
  DEFAULT_PROOF_REVIEW_DIR,
  REVIEW_FILES,
  ID_FIELDS,
  appendJsonl,
  appendRecord,
  appendStatusUpdate,
  ensureDir,
  hasShards,
  initializeStore,
  latestById,
  migrateStore,
  readBySourceIndex,
  readIndex,
  readJsonl,
  readRecordById,
  readRecords,
  shardDir,
  storePath,
};
