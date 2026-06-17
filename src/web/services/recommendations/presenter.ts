import type { CandidateCard, DeckGraph } from '../../types/deck'
import type { RecommendationMode, RecommendationRow } from './types'

export const recommendationModes: Array<{ id: RecommendationMode; label: string }> = [
  { id: 'total', label: 'Best overall' },
  { id: 'win', label: 'Win tuning' },
  { id: 'cohesion', label: 'Cohesion' },
  { id: 'self', label: 'Self-sufficiency' },
]

export function sortValue(row: RecommendationRow, mode: RecommendationMode): number {
  if (mode === 'win') return row.deltaWin
  if (mode === 'cohesion') return row.deltaCohesion
  if (mode === 'self') return row.power
  return row.totalValue
}

export function visibleRecommendations(rows: RecommendationRow[], mode: RecommendationMode, limit = 28): RecommendationRow[] {
  return [...rows]
    .filter(row => (mode === 'self' ? row.power > 0 : sortValue(row, mode) > 0))
    .sort((a, b) => sortValue(b, mode) - sortValue(a, mode) || b.deltaWin - a.deltaWin || b.power - a.power)
    .slice(0, limit)
}

export function recommendationDetail(row: RecommendationRow, mode: RecommendationMode): string {
  if (mode === 'total') return `+${row.totalValue.toFixed(2)}σ`
  if (mode === 'cohesion') return signed(row.deltaCohesion)
  if (mode === 'win') return signed(row.deltaWin)
  return String(row.power)
}

export function deckSignature(graph: DeckGraph): string {
  return (graph.nodes || [])
    .filter(node => node.role !== 'zone')
    .map(node => `${node.id}:${node.qty || 1}`)
    .sort()
    .join('|')
}

export function candidateByName(candidates: CandidateCard[]): Map<string, CandidateCard> {
  return new Map(candidates.map(candidate => [candidate.name.toLowerCase(), candidate]))
}

export function shortText(text = '', max = 180): string {
  const compact = text.replace(/\s+/g, ' ').trim()
  return compact.length > max ? `${compact.slice(0, max - 1)}…` : compact
}

function signed(value: number): string {
  return `${value >= 0 ? '+' : ''}${value}`
}
