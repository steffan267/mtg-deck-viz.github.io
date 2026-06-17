import type { DeckMetrics, GraphNode } from '../types'

export interface DeckMetricStatus {
  id: string
  label: string
  value: number
  target: number
  percent: number
  status: string
  title: string
  tone: 'ok' | 'watch' | 'warn'
}

export function buildDeckGuideMetrics(nodes: readonly GraphNode[], metrics: DeckMetrics | null): DeckMetricStatus[] {
  const cards = nodes.filter(node => node.role !== 'zone')
  const landCount = countCards(cards, node => node.role === 'land')
  const rampCount = countCards(cards, isRampCard)
  const drawCount = countCards(cards, isDrawCard)
  const removalCount = countCards(cards, isTargetedRemovalCard)
  const wipeCount = countCards(cards, isBoardWipeCard)
  const planScore = Math.round((((metrics?.winTuningScore || 0) + (metrics?.cohesionScore || 0)) / 2) || 0)
  return [
    minMetric('deck-plan', 'Deck plan', planScore, 70, `${planScore}/100`, 'Measured from win tuning and cohesion: a focused plan should be visible in both the score and graph.'),
    rangeMetric('mana-base', 'Land / mana base', landCount, 36, 38, `${landCount}/36–38`, 'The reference guideline suggests roughly 36–38 lands before deck-specific adjustments.'),
    minMetric('ramp', 'Mana ramp', rampCount, 10, `${rampCount}/10`, 'The reference guideline suggests about 10 dedicated mana ramp cards.'),
    minMetric('card-draw', 'Card draw', drawCount, 10, `${drawCount}/10`, 'The reference guideline suggests about 10 card draw or card-flow cards.'),
    minMetric('targeted-removal', 'Targeted removal', removalCount, 5, `${removalCount}/5`, 'The reference guideline suggests about 5 targeted removal spells.'),
    minMetric('board-wipes', 'Board wipes', wipeCount, 5, `${wipeCount}/5`, 'The reference guideline suggests about 5 board wipes.'),
  ]
}

function countCards(nodes: readonly GraphNode[], predicate: (node: GraphNode) => boolean): number {
  return nodes.reduce((total, node) => total + (predicate(node) ? node.qty || 1 : 0), 0)
}

function isRampCard(node: GraphNode): boolean {
  if (node.role === 'land') return false
  return node.role === 'ramp' || hasCap(node, 'is-ramp') || hasProducedEvent(node, 'mana')
}

function isDrawCard(node: GraphNode): boolean {
  const text = cardText(node)
  return node.role === 'draw' || hasProducedEvent(node, 'draw') || /draw (a|one|two|three|\d+)?\s*cards?/.test(text) || /you may draw a card/.test(text)
}

function isTargetedRemovalCard(node: GraphNode): boolean {
  if (node.role === 'wipe' || isBoardWipeCard(node)) return false
  const text = cardText(node)
  const producesRemoval = ['destroy', 'exile', 'damage', 'bounce', 'counter', 'sacrifice'].some(event => hasProducedEvent(node, event))
  return node.role === 'removal' || (producesRemoval && /target/.test(text)) || /counter target|destroy target|exile target|deals? \d+ damage to target|return target .* to (its owner's )?hand/.test(text)
}

function isBoardWipeCard(node: GraphNode): boolean {
  const text = cardText(node)
  return node.role === 'wipe' || /destroy all|exile all|deals? \d+ damage to each|each creature|all creatures|all nonland permanents|each nonland permanent/.test(text)
}

function hasCap(node: GraphNode, cap: string): boolean {
  return (node.caps || []).includes(cap)
}

function hasProducedEvent(node: GraphNode, event: string): boolean {
  return Object.prototype.hasOwnProperty.call(node.produces || {}, event)
}

function cardText(node: GraphNode): string {
  return String(node.text || '').toLowerCase()
}

function minMetric(id: string, label: string, value: number, target: number, status: string, title: string): DeckMetricStatus {
  const percent = Math.max(0, Math.min(100, Math.round((value / Math.max(1, target)) * 100)))
  return { id, label, value, target, percent, status, title, tone: metricTone(percent) }
}

function rangeMetric(id: string, label: string, value: number, min: number, max: number, status: string, title: string): DeckMetricStatus {
  const percent = value < min
    ? Math.max(0, Math.round((value / Math.max(1, min)) * 100))
    : value > max
      ? Math.max(0, Math.round((max / Math.max(1, value)) * 100))
      : 100
  return { id, label, value, target: min, percent, status, title, tone: metricTone(percent) }
}

function metricTone(percent: number): DeckMetricStatus['tone'] {
  if (percent >= 90) return 'ok'
  if (percent >= 65) return 'watch'
  return 'warn'
}
