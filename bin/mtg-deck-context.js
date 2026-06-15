#!/usr/bin/env node

const { buildDeckContext, formatMarkdown, parseArgs } = require('../lib/search-commander-cards');

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    process.stdout.write(`${options.usage}\n`);
    return;
  }

  const context = await buildDeckContext(options);
  if (options.format === 'json') {
    process.stdout.write(`${JSON.stringify(context, null, 2)}\n`);
    return;
  }

  process.stdout.write(formatMarkdown(context));
}

main().catch((error) => {
  process.stderr.write(`Failed: ${error.message}\n`);
  process.exitCode = 1;
});
