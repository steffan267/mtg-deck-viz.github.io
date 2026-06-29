const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const STORE = require('../src/proof-review-store');

// Mirror the store's id convention: typed prefix + sha1 hex, so the first two hex
// chars (used as the shard) vary across records.
function hashId(prefix, value) {
  return prefix + '_' + crypto.createHash('sha1').update(String(value)).digest('hex').slice(0, 16);
}

async function tmpStore() {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mtg-proof-store-'));
  STORE.initializeStore(dir);
  return dir;
}

const created_at = '2026-06-29T00:00:00.000Z';

function attempt(proof_id, status = 'NEEDS_REVIEW') {
  return {
    proof_id,
    run_id: 'run_store',
    status,
    involved_cards: ['A', 'B'],
    created_at,
    updated_at: created_at,
  };
}

async function main() {
  // 1. Append -> read round-trip across multiple shards. Many distinct ids spread
  //    across shard files; readRecords must read ALL shards and return every record.
  {
    const dir = await tmpStore();
    const ids = [];
    for (let i = 0; i < 50; i++) {
      const id = hashId('proof', 'roundtrip-' + i);
      ids.push(id);
      STORE.appendRecord(dir, 'proofAttempts', attempt(id));
    }
    const shardFiles = fs.readdirSync(STORE.shardDir(dir, 'proofAttempts')).filter(n => /^[0-9a-f]{2}\.jsonl$/.test(n));
    assert.ok(shardFiles.length > 1, 'records should spread across multiple shards, got ' + shardFiles.length);
    const read = STORE.readRecords(dir, 'proofAttempts');
    assert.equal(read.length, 50, 'readRecords must concatenate every shard');
    assert.deepEqual(read.map(r => r.proof_id).sort(), [...ids].sort());
  }

  // 2. readIndex / latestById parity: same latest records by id.
  {
    const dir = await tmpStore();
    for (let i = 0; i < 20; i++) STORE.appendRecord(dir, 'proofAttempts', attempt(hashId('proof', 'parity-' + i)));
    const indexEntries = STORE.readIndex(dir, 'proofAttempts');
    const latest = STORE.latestById(STORE.readRecords(dir, 'proofAttempts'), 'proof_id');
    assert.equal(indexEntries.length, latest.length, 'index entry count must match latest-per-id count');
    assert.deepEqual(indexEntries.map(e => e.id).sort(), latest.map(r => r.proof_id).sort());
  }

  // 3. Status updates produce a new index line; readIndex reflects the latest status,
  //    and readRecordById returns the latest record for that id.
  {
    const dir = await tmpStore();
    const id = 'proof_status_aa11';
    STORE.appendRecord(dir, 'proofAttempts', attempt(id, 'NEEDS_REVIEW'));
    STORE.appendStatusUpdate(dir, 'proofAttempts', 'proof_id', id, { status: 'ACCEPTED' });
    const entry = STORE.readIndex(dir, 'proofAttempts').find(e => e.id === id);
    assert.equal(entry.status, 'ACCEPTED', 'index must reflect latest status');
    const record = STORE.readRecordById(dir, 'proofAttempts', id);
    assert.equal(record.status, 'ACCEPTED', 'readRecordById must return the latest record');
    assert.equal(STORE.readRecordById(dir, 'proofAttempts', 'proof_missing'), null);
    // Two index lines were appended (initial + update) for the same id.
    const rawIndex = STORE.readJsonl(path.join(STORE.shardDir(dir, 'proofAttempts'), 'index.jsonl'));
    assert.equal(rawIndex.filter(l => l.id === id).length, 2, 'each write must append an index line');
  }

  // 4. llmDrafts by-source index returns latest status per source_proof_id.
  {
    const dir = await tmpStore();
    STORE.appendRecord(dir, 'llmDrafts', { draft_id: 'd_aa11', source_proof_id: 'p1', status: 'REJECTED', updated_at: created_at });
    STORE.appendRecord(dir, 'llmDrafts', { draft_id: 'd_bb22', source_proof_id: 'p1', status: 'REVIEW_READY', updated_at: '2026-06-30T00:00:00.000Z' });
    STORE.appendRecord(dir, 'llmDrafts', { draft_id: 'd_cc33', source_proof_id: 'p2', status: 'CRITIC_REJECTED', updated_at: created_at });
    const bySource = STORE.readBySourceIndex(dir, 'llmDrafts');
    const byId = new Map(bySource.map(e => [e.source_proof_id, e]));
    assert.equal(byId.size, 2);
    assert.equal(byId.get('p1').status, 'REVIEW_READY', 'latest line wins per source_proof_id');
    assert.equal(byId.get('p1').draft_id, 'd_bb22');
    assert.equal(byId.get('p2').status, 'CRITIC_REJECTED');
    // Non-by-source streams return [].
    assert.deepEqual(STORE.readBySourceIndex(dir, 'proofAttempts'), []);
  }

  // 5. Legacy-flat-file read-through when no shard dir exists.
  {
    const dir = await tmpStore();
    const flat = STORE.storePath(dir, 'proofAttempts');
    fs.writeFileSync(flat, [JSON.stringify(attempt('proof_legacy1')), JSON.stringify(attempt('proof_legacy2'))].join('\n') + '\n');
    assert.equal(fs.existsSync(STORE.shardDir(dir, 'proofAttempts')), false, 'precondition: no shard dir yet');
    const read = STORE.readRecords(dir, 'proofAttempts');
    assert.equal(read.length, 2, 'reads should fall through to the legacy flat file');
  }

  // 6. migrate-store: migrates, is idempotent, preserves row counts (no double-count),
  //    renames legacy file, and the shard dir then wins (legacy .migrated ignored).
  {
    const dir = await tmpStore();
    const flat = STORE.storePath(dir, 'proofAttempts');
    const legacyRows = [];
    for (let i = 0; i < 30; i++) legacyRows.push(attempt(hashId('proof', 'legacy-' + i)));
    fs.writeFileSync(flat, legacyRows.map(r => JSON.stringify(r)).join('\n') + '\n');
    const beforeCount = STORE.readRecords(dir, 'proofAttempts').length;
    assert.equal(beforeCount, 30);

    const result = STORE.migrateStore(dir);
    assert.equal(result.proofAttempts.status, 'migrated');
    assert.equal(result.proofAttempts.migrated, 30);
    // Legacy file renamed (recoverable), not deleted.
    assert.equal(fs.existsSync(flat), false, 'legacy flat file must be renamed away');
    assert.equal(fs.existsSync(flat + '.migrated'), true, 'legacy flat file must be recoverable');
    // Shard dir now exists and wins; row count is identical (no double counting).
    assert.equal(fs.existsSync(STORE.shardDir(dir, 'proofAttempts')), true);
    assert.equal(STORE.readRecords(dir, 'proofAttempts').length, 30, 'migration must not double-count');
    // Index built during migration matches latest-per-id.
    assert.equal(STORE.readIndex(dir, 'proofAttempts').length, 30);

    // Idempotent: re-running migrates nothing and does not change counts.
    const second = STORE.migrateStore(dir);
    assert.equal(second.proofAttempts.status, 'already-sharded');
    assert.equal(second.proofAttempts.migrated, 0);
    assert.equal(STORE.readRecords(dir, 'proofAttempts').length, 30, 'idempotent migration must not double-count');

    // Mutually exclusive read: even if a legacy flat file reappears, shards still win.
    fs.writeFileSync(flat, JSON.stringify(attempt('proof_should_be_ignored')) + '\n');
    const read = STORE.readRecords(dir, 'proofAttempts');
    assert.equal(read.length, 30, 'shard dir must win over a stray legacy flat file');
    assert.equal(read.some(r => r.proof_id === 'proof_should_be_ignored'), false);
  }

  // 7. migrate-store on a stream with no legacy file reports no-op.
  {
    const dir = await tmpStore();
    const result = STORE.migrateStore(dir);
    for (const key of Object.keys(STORE.REVIEW_FILES)) {
      assert.equal(result[key].status, 'no-legacy-file');
      assert.equal(result[key].migrated, 0);
    }
  }

  // 8. Records without the configured id field are still placed and readable.
  {
    const dir = await tmpStore();
    STORE.appendRecord(dir, 'cards', { name: 'Sol Ring', oracle_text: '{T}: Add {C}{C}.', updated_at: created_at });
    const read = STORE.readRecords(dir, 'cards');
    assert.equal(read.length, 1);
    assert.equal(read[0].name, 'Sol Ring');
    // The index still records an entry (content-hashed id).
    assert.equal(STORE.readIndex(dir, 'cards').length, 1);
  }

  // 9. BUG B regression: an existing-but-EMPTY shard dir must NOT shadow a populated
  //    legacy flat file. Simulates a crash that created the dir before the first append.
  {
    const dir = await tmpStore();
    const flat = STORE.storePath(dir, 'proofAttempts');
    fs.writeFileSync(flat, [JSON.stringify(attempt('proof_b1')), JSON.stringify(attempt('proof_b2'))].join('\n') + '\n');
    fs.mkdirSync(STORE.shardDir(dir, 'proofAttempts'), { recursive: true }); // empty dir
    assert.equal(fs.existsSync(STORE.shardDir(dir, 'proofAttempts')), true);
    assert.equal(STORE.hasShards(dir, 'proofAttempts'), false, 'empty dir must not count as sharded');
    const read = STORE.readRecords(dir, 'proofAttempts');
    assert.equal(read.length, 2, 'empty shard dir must fall through to the legacy flat file');
    assert.deepEqual(read.map(r => r.proof_id).sort(), ['proof_b1', 'proof_b2']);

    // And migrate-store must still migrate it (not report already-sharded), populating
    // the dir from the legacy file without loss.
    const result = STORE.migrateStore(dir);
    assert.equal(result.proofAttempts.status, 'migrated');
    assert.equal(result.proofAttempts.migrated, 2);
    assert.equal(STORE.hasShards(dir, 'proofAttempts'), true);
    assert.equal(STORE.readRecords(dir, 'proofAttempts').length, 2);
  }

  // 10. BUG A regression: migration interrupted mid-loop must be re-migratable with no
  //     data loss and no double-write. Because the loop builds into a temp dir and only
  //     the final atomic rename publishes the real shard dir, a real mid-loop crash
  //     leaves an ORPHAN temp dir plus the still-intact legacy flat file (the flat-file
  //     rename is the last step, never reached). We simulate exactly that residue.
  {
    const dir = await tmpStore();
    const flat = STORE.storePath(dir, 'proofAttempts');
    const rows = [];
    for (let i = 0; i < 10; i++) rows.push(attempt(hashId('proof', 'partial-' + i)));
    fs.writeFileSync(flat, rows.map(r => JSON.stringify(r)).join('\n') + '\n');

    // Crash residue: a partial temp dir for this stream, real shard dir absent, flat
    // file untouched.
    const sharded = STORE.shardDir(dir, 'proofAttempts');
    const orphanTmp = sharded + '.migrating.99999.123';
    fs.mkdirSync(orphanTmp, { recursive: true });
    fs.writeFileSync(path.join(orphanTmp, 'aa.jsonl'), JSON.stringify(rows[0]) + '\n');
    assert.equal(STORE.hasShards(dir, 'proofAttempts'), false, 'precondition: real shard dir not yet published');
    assert.equal(fs.existsSync(flat), true, 'precondition: legacy flat file still present (rename not reached)');
    // The full-scan reader must still see all legacy rows despite the orphan temp dir.
    assert.equal(STORE.readRecords(dir, 'proofAttempts').length, 10, 'orphan temp dir must not affect reads');

    // Rerun migration: it must NOT report already-sharded, must clear the orphan, and
    // rebuild cleanly from the legacy file.
    const result = STORE.migrateStore(dir);
    assert.equal(result.proofAttempts.status, 'migrated', 'interrupted migration must be re-migratable');
    assert.equal(result.proofAttempts.migrated, 10);

    const read = STORE.readRecords(dir, 'proofAttempts');
    assert.equal(read.length, 10, 'rerun must produce exactly the legacy rows — no loss, no double-write');
    assert.deepEqual(read.map(r => r.proof_id).sort(), rows.map(r => r.proof_id).sort());
    assert.equal(STORE.readIndex(dir, 'proofAttempts').length, 10, 'index must match after re-migration');
    assert.equal(fs.existsSync(flat + '.migrated'), true, 'legacy file retired after successful migration');
    assert.equal(fs.existsSync(flat), false);
    // No leftover temp dirs.
    assert.equal(fs.readdirSync(dir).some(name => name.includes('.migrating.')), false, 'orphan temp dirs must be cleaned up');

    // Idempotent after the recovered migration.
    const again = STORE.migrateStore(dir);
    assert.equal(again.proofAttempts.status, 'already-sharded');
    assert.equal(STORE.readRecords(dir, 'proofAttempts').length, 10);
  }

  // 11. Empty legacy flat file migrates as a no-row no-op (no empty shard dir created).
  {
    const dir = await tmpStore();
    const flat = STORE.storePath(dir, 'engineRuns');
    fs.writeFileSync(flat, '');
    const result = STORE.migrateStore(dir);
    assert.equal(result.engineRuns.status, 'migrated');
    assert.equal(result.engineRuns.migrated, 0);
    assert.equal(fs.existsSync(flat + '.migrated'), true);
    assert.equal(STORE.hasShards(dir, 'engineRuns'), false, 'empty legacy file must not create an empty shard dir');
    assert.deepEqual(STORE.readRecords(dir, 'engineRuns'), []);
  }

  process.stdout.write('Proof review store tests passed\n');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
