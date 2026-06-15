#!/usr/bin/env node

const { buildCommanderSearchData, parseArgs } = require('../lib/build-commander-search');

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    process.stdout.write(`${options.usage}\n`);
    return;
  }

  const result = await buildCommanderSearchData(options);
  process.stdout.write(`Done. Wrote ${result.cardCount} cards to ${result.outputPath}\n`);
}

main().catch((error) => {
  process.stderr.write(`Failed: ${error.message}\n`);
  process.exitCode = 1;
});
