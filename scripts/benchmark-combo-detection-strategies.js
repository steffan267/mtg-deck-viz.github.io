#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

function registerTypeScriptRequire() {
  if (require.extensions['.ts']) return;
  let ts;
  try {
    ts = require('typescript');
  } catch (error) {
    throw new Error('typescript is required to run the combo strategy benchmark without a build step');
  }
  require.extensions['.ts'] = (module, filename) => {
    const source = fs.readFileSync(filename, 'utf8');
    const output = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
      fileName: filename,
    });
    module._compile(output.outputText, filename);
  };
}

function parseArgs(argv) {
  const args = { fixture: path.join(__dirname, '..', 'test', 'fixtures', 'combo-strategy-benchmark.json') };
  for (let index = 2; index < argv.length; index++) {
    const value = argv[index];
    if (value === '--fixture') args.fixture = argv[++index];
    else if (value === '--pretty') args.pretty = true;
    else if (value === '--help') args.help = true;
    else throw new Error(`Unknown argument: ${value}`);
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    process.stdout.write('Usage: node scripts/benchmark-combo-detection-strategies.js [--fixture PATH] [--pretty]\n');
    return;
  }
  registerTypeScriptRequire();
  const fixturePath = path.resolve(args.fixture);
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  const { runComboStrategyBenchmark } = require('../src/combo-detection');
  const result = runComboStrategyBenchmark(fixture.cases || [], undefined, '1970-01-01T00:00:00.000Z');
  process.stdout.write(JSON.stringify(result, null, args.pretty ? 2 : 0));
  process.stdout.write('\n');
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
}
