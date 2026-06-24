import type { DeckGraph, DeckMetrics, MetricRowViewModel, MetricsModule, WinTuningSignals } from '../../types'
import type { ScoreSection, SignalBar } from '../../types/ui'

export function ensureDeckMetrics(graph: DeckGraph, metrics: MetricsModule): DeckMetrics {
  if (graph.metrics?.winTuningScore != null) return graph.metrics
  const computed = metrics.compute(graph)
  graph.metrics = computed
  return computed
}

function signalScore(signals: WinTuningSignals, key: string): number {
  return signals[key]?.score ?? 0
}

function signalCards(signals: WinTuningSignals, key: string): string[] {
  const cards = signals[key]?.cards || []
  return cards.map(card => (typeof card === 'string' ? card : card.id)).filter(Boolean)
}

export function winTuningSignalBars(signals: WinTuningSignals): SignalBar[] {
  return [
    ['speed', 'Speed'],
    ['consistency', 'Tutors'],
    ['cardFlow', 'Card flow'],
    ['interaction', 'Answers'],
    ['closure', 'Closure'],
    ['resilience', 'Resilience'],
    ['efficiency', 'Efficiency'],
    ['gameChangers', 'Game Changers'],
  ].map(([id, label]) => ({ id, label, value: signalScore(signals, id), max: 100, cards: signalCards(signals, id) }))
}

export function metricsToScoreSections(metrics: DeckMetrics): ScoreSection[] {
  return [
    {
      id: 'win',
      label: 'Win tuning',
      value: metrics.winTuningScore,
      band: metrics.winTuningBand,
      summary: metrics.winSummary,
      evidence: [
        { id: 'bracket', label: `Commander bracket: ${metrics.bracketLabel}` },
        { id: 'game-changers', label: `Game Changers: ${metrics.gameChangerCount}` },
      ],
      signals: winTuningSignalBars(metrics.winTuningSignals),
    },
    {
      id: 'cohesion',
      label: 'Cohesion',
      value: metrics.cohesionScore,
      band: metrics.cohesionBand,
      evidence: [
        { id: 'core-web', label: `Core web: ${metrics.meaningfulWebShare}%` },
        { id: 'edges', label: `Interaction edges: ${metrics.edgeCount}` },
        { id: 'avg-degree', label: `Avg interactions: ${metrics.avgDegree}` },
      ],
    },
    {
      id: 'self-sufficiency',
      label: 'Self-sufficiency',
      value: metrics.selfSufficiencyScore,
      band: metrics.selfSufficiencyBand,
      evidence: [
        { id: 'answers', label: `Answers: ${metrics.selfSufficiencySignals.interaction}` },
        { id: 'card-advantage', label: `Card advantage: ${metrics.selfSufficiencySignals.cardAdvantage}` },
        { id: 'ramp', label: `Ramp: ${metrics.selfSufficiencySignals.ramp}` },
      ],
    },
  ]
}

export function metricsToCompareRows(metrics: DeckMetrics): MetricRowViewModel[] {
  return [
    { id: 'winSummary', label: 'How it wins', value: metrics.winSummary, higherIsBetter: null, section: 'Power at a glance' },
    { id: 'bracketLabel', label: 'Commander bracket', value: metrics.bracketLabel, higherIsBetter: null },
    { id: 'winTuningScore', label: 'Win tuning /100', value: metrics.winTuningScore, band: metrics.winTuningBand, higherIsBetter: true },
    { id: 'gameChangerCount', label: 'Game Changers', value: metrics.gameChangerCount, higherIsBetter: true },
    { id: 'cohesionScore', label: 'Cohesion /100', value: metrics.cohesionScore, band: metrics.cohesionBand, higherIsBetter: true },
    { id: 'selfSufficiencyScore', label: 'Self-sufficiency /100', value: metrics.selfSufficiencyScore, band: metrics.selfSufficiencyBand, higherIsBetter: true },
    { id: 'pctMeaningful', label: '% meaningfully linked', value: metrics.pctMeaningful, suffix: '%', higherIsBetter: true, section: 'Synergy & structure' },
    { id: 'meaningfulWebShare', label: 'Core web %', value: metrics.meaningfulWebShare, suffix: '%', higherIsBetter: true },
    { id: 'pctInteractive', label: '% any interaction', value: metrics.pctInteractive, suffix: '%', higherIsBetter: true },
    { id: 'edgeCount', label: 'Interaction edges', value: metrics.edgeCount, higherIsBetter: true },
    { id: 'islandCount', label: 'Islands (0 links)', value: metrics.islandCount, higherIsBetter: false },
    { id: 'nonlandCount', label: 'Nonland cards', value: metrics.nonlandCount, higherIsBetter: null },
  ]
}
