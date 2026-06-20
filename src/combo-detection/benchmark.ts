import type {
  ComboDetectionStrategy,
  ComboStrategyBenchmarkCase,
  ComboStrategyBenchmarkResult,
  ComboStrategyBenchmarkRow,
} from './contracts'
import { comboDetectionStrategies } from './strategies'

export function runComboStrategyBenchmark(
  cases: readonly ComboStrategyBenchmarkCase[],
  strategies: readonly ComboDetectionStrategy[] = comboDetectionStrategies,
  generatedAt = '1970-01-01T00:00:00.000Z',
): ComboStrategyBenchmarkResult {
  return {
    version: 'combo-strategy-benchmark.v1',
    generatedAt,
    cases: [...cases]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(testCase => ({
        caseId: testCase.id,
        rows: strategies
          .map((strategy): ComboStrategyBenchmarkRow => {
            const result = strategy.detect({ cards: testCase.cards, maxCards: 3 })
            return {
              strategyId: strategy.id,
              candidateCount: result.candidates.length,
              proofCount: result.proofs.length,
              proofFamilies: [...new Set(result.proofs.map(proof => proof.family))].sort((a, b) => a.localeCompare(b)),
            }
          })
          .sort((a, b) => a.strategyId.localeCompare(b.strategyId)),
      })),
  }
}
