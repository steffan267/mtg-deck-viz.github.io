import type {
  ComboDetectionStrategy,
  ComboDetectionStrategyId,
  ComboStrategyBenchmarkCase,
} from '../src/combo-detection'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')

if (!require.extensions['.ts']) {
  require.extensions['.ts'] = (module: NodeJS.Module, filename: string) => {
    const source = fs.readFileSync(filename, 'utf8')
    const output = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
      fileName: filename,
    })
    ;(module as NodeJS.Module & { _compile(source: string, filename: string): void })._compile(output.outputText, filename)
  }
}

const {
  comboDetectionStrategies,
  detectCombosWithStrategy,
  runComboStrategyBenchmark,
} = require('../src/combo-detection') as typeof import('../src/combo-detection')

const EXPECTED_IDS: readonly ComboDetectionStrategyId[] = [
  'brute-force-combinations',
  'rule-template-search',
  'graph-resource-search',
]

const cards: ComboStrategyBenchmarkCase['cards'] = [
  {
    id: 'self-untap-engine',
    name: 'Synthetic Self Untap Engine',
    typeLine: 'Creature — Druid',
    oracleText: '{T}: Add {G}{G}. {0}: Untap this creature.',
  },
  {
    id: 'gain-to-loss',
    name: 'Synthetic Gain Payoff',
    typeLine: 'Enchantment',
    oracleText: 'Whenever you gain life, each opponent loses 1 life.',
  },
  {
    id: 'loss-to-gain',
    name: 'Synthetic Loss Payoff',
    typeLine: 'Enchantment',
    oracleText: 'Whenever an opponent loses life, you gain that much life.',
  },
]

const strategies: readonly ComboDetectionStrategy[] = comboDetectionStrategies
assert.deepEqual(strategies.map(strategy => strategy.id), EXPECTED_IDS)

const original = JSON.stringify(cards)
const result = detectCombosWithStrategy('rule-template-search', { cards, maxCards: 3 })
assert.equal(JSON.stringify(cards), original)
assert.equal(result.strategyId, 'rule-template-search')
assert.deepEqual(result.candidates.map(candidate => candidate.id), [...result.candidates.map(candidate => candidate.id)].sort())
assert.deepEqual(result.proofs.map(proof => proof.family), ['lifegain-lifeloss-loop', 'self-untap-mana-loop'])
assert.deepEqual(JSON.parse(JSON.stringify(result)), result)

const breakEvenColoredUntap = detectCombosWithStrategy('rule-template-search', {
  cards: [
    {
      id: 'break-even-colored-untap',
      name: 'Synthetic Break-Even Colored Untap',
      typeLine: 'Creature — Druid',
      oracleText: '{T}: Add {G}. {G}: Untap this creature.',
    },
  ],
  maxCards: 1,
})
assert.deepEqual(breakEvenColoredUntap.proofs, [], 'colored activation costs must count as mana and reject break-even self-untap loops')

const benchmark = runComboStrategyBenchmark([{ id: 'typed-case', cards }])
assert.equal(benchmark.version, 'combo-strategy-benchmark.v1')
assert.equal(benchmark.generatedAt, '1970-01-01T00:00:00.000Z')
assert.deepEqual(benchmark.cases[0].rows.map(row => row.strategyId), [...EXPECTED_IDS].sort())
assert.equal(benchmark.cases[0].rows.every(row => Number.isInteger(row.candidateCount) && Number.isInteger(row.proofCount)), true)

process.stdout.write('combo detection strategy contract test passed\n')
