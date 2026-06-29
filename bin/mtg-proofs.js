#!/usr/bin/env node
/*
 * mtg-proofs.js — local proof review CLI around the deterministic interaction engine.
 */
const path = require('path');
const PIPELINE = require('../src/proof-review-pipeline');
const STORE = require('../src/proof-review-store');

function usage() {
  return `Usage: node ./bin/mtg-proofs.js <command> [options]

Commands:
  sample                         Create/reference the built-in proof-review sample deck
  run                            Run deterministic proof/package logic and persist review records
  export-review [--limit n]      Export NEEDS_REVIEW proofs to Markdown and JSONL
  import-review <review.jsonl>   Import manual review JSONL and update local statuses
  promote-tests                  Promote accepted/deterministic proofs into JSON fixtures
  draft-proofs [--limit n]       Ask local Ollama to draft untrusted JSON for NEEDS_REVIEW proofs

Options:
  --store-dir <dir>              Override analysis/proof-review storage directory
  --deck <id>                    Deck id for run (default: sample)
  --limit <n>                    export-review default: 20; draft-proofs default: 10
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
    const result = PIPELINE.exportReview(storeDir, { limit: args.limit || 20, exportDir: args.outDir });
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
    process.stdout.write(JSON.stringify({ command, storeDir, drafted: result.drafted, generated: result.generated, rejected: result.rejected, failure_reasons: result.failure_reasons }, null, 2) + '\n');
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
