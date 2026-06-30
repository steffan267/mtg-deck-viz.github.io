#!/usr/bin/env node
/*
 * mtg-proofs.js — local proof review CLI around the deterministic interaction engine.
 */
const path = require('path');
const PIPELINE = require('../src/proof-review-pipeline');
const STORE = require('../src/proof-review-store');
const { buildCoverageReport } = require('../scripts/coverage-report');

function usage() {
  return `Usage: node ./bin/mtg-proofs.js <command> [options]

Commands:
  sample                         Create/reference the built-in proof-review sample deck
  run                            Run deterministic proof/package logic and persist review records
  export-review [--limit n] [--compact] [--force]
                                 Export NEEDS_REVIEW proofs to Markdown and JSONL
                                 (default v1; --compact = token-lean v2 batch;
                                 --force = re-export even if an identical batch exists)
  import-review <review.jsonl>   Import manual review JSONL and update local statuses
  promote-tests                  Promote accepted/deterministic proofs into JSON fixtures
  draft-proofs [--limit n]       Ask local Ollama to draft untrusted JSON for NEEDS_REVIEW proofs
  prepare-review-candidates      Build import-compatible local-LLM review candidate files
  combo-sweep [--limit n]        Route EDHREC combos through the deterministic engine (NEEDS_REVIEW only)
  coverage-report                Rank REVIEW_READY drafts by interaction family (read-only)
  migrate-store                  Shard+index legacy flat-file streams (idempotent)

Options:
  --store-dir <dir>              Override analysis/proof-review storage directory
  --deck <id>                    Deck id for run (default: sample)
  --limit <n>                    export-review default: 20; draft-proofs default: 10; prepare-review-candidates default: 100; combo-sweep default: 50
  --combo-cache <path>           combo-sweep combo cache (default: analysis/edhrec-combos/edhrec-combo-cache.json)
  --out-dir <dir>                Export-review output directory
  --fixture-dir <dir>            promote-tests fixture directory
`;
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--store-dir') args.storeDir = path.resolve(argv[++i]);
    else if (arg === '--deck') args.deck = argv[++i];
    else if (arg === '--limit') args.limit = Number(argv[++i]);
    else if (arg === '--out-dir') args.outDir = path.resolve(argv[++i]);
    else if (arg === '--fixture-dir') args.fixtureDir = path.resolve(argv[++i]);
    else if (arg === '--combo-cache') args.comboCache = path.resolve(argv[++i]);
    else if (arg === '--compact') args.compact = true;
    else if (arg === '--force') args.force = true;
    else if (arg === '-h' || arg === '--help') args.help = true;
    else args._.push(arg);
  }
  return args;
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const command = args._[0];
  const storeDir = args.storeDir || STORE.DEFAULT_PROOF_REVIEW_DIR;
  if (args.help || !command) {
    process.stdout.write(usage());
    return;
  }

  if (command === 'sample') {
    const result = PIPELINE.createSample(storeDir);
    process.stdout.write(JSON.stringify({ command, storeDir, ...result }, null, 2) + '\n');
    return;
  }

  if (command === 'run') {
    const result = PIPELINE.runDeterministic(storeDir, { deckId: args.deck || 'sample' });
    process.stdout.write(JSON.stringify({ command, storeDir, run_id: result.run_id, summary: result.run.summary }, null, 2) + '\n');
    return;
  }

  if (command === 'export-review') {
    const result = PIPELINE.exportReview(storeDir, { limit: args.limit || 20, exportDir: args.outDir, compact: args.compact === true, force: args.force === true });
    process.stdout.write(JSON.stringify({ command, storeDir, ...result }, null, 2) + '\n');
    return;
  }

  if (command === 'import-review') {
    const reviewPath = args._[1];
    const result = PIPELINE.importReview(storeDir, reviewPath);
    process.stdout.write(JSON.stringify({ command, storeDir, ...result }, null, 2) + '\n');
    return;
  }

  if (command === 'promote-tests') {
    const result = PIPELINE.promoteTests(storeDir, { fixtureDir: args.fixtureDir });
    process.stdout.write(JSON.stringify({ command, storeDir, ...result }, null, 2) + '\n');
    return;
  }

  if (command === 'draft-proofs') {
    const result = await PIPELINE.draftProofs(storeDir, { limit: args.limit || 10 });
    process.stdout.write(JSON.stringify({
      command,
      storeDir,
      drafted: result.drafted,
      generated: result.generated,
      review_ready: result.review_ready,
      critic_rejected: result.critic_rejected,
      rejected: result.rejected,
      exhausted: result.exhausted,
      failure_reasons: result.failure_reasons,
    }, null, 2) + '\n');
    return;
  }

  if (command === 'prepare-review-candidates') {
    const result = PIPELINE.prepareReviewCandidates(storeDir, {
      limit: Number.isFinite(args.limit) ? args.limit : 100,
      exportDir: args.outDir,
    });
    process.stdout.write(JSON.stringify({ command, storeDir, ...result }, null, 2) + '\n');
    return;
  }

  if (command === 'combo-sweep') {
    const result = PIPELINE.runComboSweep(storeDir, {
      limit: Number.isFinite(args.limit) ? args.limit : 50,
      comboCachePath: args.comboCache,
    });
    process.stdout.write(JSON.stringify({
      command,
      storeDir,
      run_id: result.run_id,
      summary: {
        processed: result.processed,
        skipped: result.skipped,
        attempts_created: result.attempts_created,
        remaining: result.remaining,
        total_combos: result.total_combos,
        exhausted: result.exhausted,
      },
      exhausted: result.exhausted,
    }, null, 2) + '\n');
    return;
  }

  if (command === 'migrate-store') {
    const result = STORE.migrateStore(storeDir);
    process.stdout.write(JSON.stringify({ command, storeDir, streams: result }, null, 2) + '\n');
    return;
  }

  if (command === 'coverage-report') {
    const result = Object.assign({}, buildCoverageReport(storeDir), { generatedAt: new Date().toISOString() });
    process.stdout.write(JSON.stringify({ command, storeDir, ...result }, null, 2) + '\n');
    return;
  }

  throw new Error('Unknown command: ' + command + '\n' + usage());
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.message || error);
    process.exit(1);
  });
} else {
  module.exports = { main, parseArgs };
}
