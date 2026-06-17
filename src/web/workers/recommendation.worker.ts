import type { CandidateCard, DeckGraph, DeckNode, Interaction } from '../types/deck'
import * as INTERACTION_MODEL from '../../interaction-model.js'
import * as DECK_METRICS from '../../metrics.js'
import type { RecommendationInput, RecommendationRow } from '../services/recommendations/types'
import { normalizeInteractionModel, normalizeMetricsModule } from '../services/adapters/legacyModules'

type LegacyModel = {
  classify(card: { type_line?: string; oracle_text?: string }): Partial<DeckNode>
  interactionsBetween(a: DeckNode, b: DeckNode): Interaction[]
  eventsFromInteractions?: (interactions: Interaction[]) => string[]
}

type LegacyMetrics = {
  compute(graph: DeckGraph): Record<string, unknown>
  cardPower(node: DeckNode): number
}

const scope = self as unknown as Worker & typeof globalThis & {
  INTERACTION_MODEL?: LegacyModel
  DECK_METRICS?: LegacyMetrics
}

const interactionModel = normalizeInteractionModel(scope.INTERACTION_MODEL || INTERACTION_MODEL) as unknown as LegacyModel
const deckMetrics = normalizeMetricsModule(scope.DECK_METRICS || DECK_METRICS) as unknown as LegacyMetrics

const RANK: Record<string, number> = { weak: 1, moderate: 2, strong: 3, 'combo-critical': 4 }
const TOTAL_VALUE_AXIS_SIGMA = { win: 6.94, cohesion: 16.59, self: 7.19 }

scope.onmessage = (event: MessageEvent<RecommendationInput>) => {
  const input = event.data as RecommendationInput
  try {
    const results = recommend(input)
    scope.postMessage({ type: 'done', key: input.key, total: input.candidates.length, results })
  } catch (cause) {
    scope.postMessage({ type: 'error', key: input.key, message: cause instanceof Error ? cause.message : 'Recommendation scoring failed' })
  }
}

function recommend(input: RecommendationInput): RecommendationRow[] {
  const baseMetrics = metrics().compute(input.graph)
  const baseSignals = signalScores(baseMetrics)
  const colors = colorSet(input.graph)
  const existingNames = new Set((input.graph.nodes || []).map(node => node.id.toLowerCase()))
  const weakest = Object.entries(baseSignals)
    .sort((a, b) => a[1] - b[1])
    .slice(0, 4)
    .map(([key, value]) => [key, (100 - value) / 100] as const)

  const rows: RecommendationRow[] = []
  let done = 0
  for (const candidate of input.candidates) {
    if (!candidate?.name || existingNames.has(candidate.name.toLowerCase()) || !inColors(candidate, colors)) {
      done = tick(input.key, done, input.candidates.length)
      continue
    }

    const node = candidateNode(candidate)
    const graph = cloneGraphWith(input.graph, node)
    const nextMetrics = metrics().compute(graph)
    const nextSignals = signalScores(nextMetrics)
    const signalDeltas: Record<string, number> = {}
    for (const key of Object.keys(nextSignals)) signalDeltas[key] = nextSignals[key] - (baseSignals[key] || 0)

    let scoreMissing = 0
    for (const [key, weight] of weakest) scoreMissing += Math.max(0, signalDeltas[key] || 0) * weight

    const deltaWin = round(scoreValue(nextMetrics.winTuningScore) - scoreValue(baseMetrics.winTuningScore))
    const deltaCohesion = round(scoreValue(nextMetrics.cohesionScore) - scoreValue(baseMetrics.cohesionScore))
    const deltaSelf = round(scoreValue(nextMetrics.selfSufficiencyScore) - scoreValue(baseMetrics.selfSufficiencyScore))
    const totalValue =
      Math.max(0, deltaWin) / TOTAL_VALUE_AXIS_SIGMA.win +
      Math.max(0, deltaCohesion) / TOTAL_VALUE_AXIS_SIGMA.cohesion +
      Math.max(0, deltaSelf) / TOTAL_VALUE_AXIS_SIGMA.self

    rows.push({
      name: candidate.name,
      role: node.role,
      cmc: node.cmc || 0,
      power: metrics().cardPower(node),
      newEdges: Math.max(0, node.degree || 0),
      deltaWin,
      deltaCohesion,
      deltaSelf,
      totalValue: round(totalValue, 2),
      scoreMissing: round(scoreMissing, 2),
      signalDeltas,
    })
    done = tick(input.key, done, input.candidates.length)
  }
  return rows
}

function tick(key: string, done: number, total: number): number {
  const nextDone = done + 1
  if (nextDone % 400 === 0) scope.postMessage({ type: 'progress', key, done: nextDone, total })
  return nextDone
}

function candidateNode(candidate: CandidateCard): DeckNode {
  const classification = interactionModel.classify({ type_line: candidate.type, oracle_text: candidate.text })
  return {
    id: candidate.name,
    qty: 1,
    role: String(classification.role || 'support'),
    cmc: candidate.cmc || 0,
    type: candidate.type || '',
    mana: candidate.mana || '',
    text: candidate.text || '',
    ci: candidate.ci || [],
    edh: candidate.edh || null,
    degree: 0,
    produces: classification.produces || {},
    consumes: classification.consumes || {},
    zones: classification.zones || [],
    myTypes: classification.myTypes || [],
    tribalRefs: classification.tribalRefs || [],
    caps: classification.caps || [],
  }
}

function cloneGraphWith(graph: DeckGraph, addedNode: DeckNode): DeckGraph {
  const nodes = (graph.nodes || []).filter(node => node.role !== 'zone').map(node => ({ ...node }))
  const byId = new Map(nodes.map(node => [node.id, node]))
  const edges = (graph.edges || []).filter(edge => byId.has(edge.source) && byId.has(edge.target)).map(edge => ({ ...edge }))
  nodes.push(addedNode)
  byId.set(addedNode.id, addedNode)

  for (const node of nodes) {
    if (node.id === addedNode.id) continue
    const interactions = interactionModel.interactionsBetween(addedNode, node)
    if (interactions.length) {
      edges.push({
        source: addedNode.id,
        target: node.id,
        interactions,
        events: interactionModel.eventsFromInteractions?.(interactions) || interactions.map(interaction => interaction.event || interaction.family || '').filter(Boolean),
      })
    }
  }

  const degree = new Map(nodes.map(node => [node.id, 0]))
  for (const edge of edges) {
    degree.set(edge.source, (degree.get(edge.source) || 0) + 1)
    degree.set(edge.target, (degree.get(edge.target) || 0) + 1)
  }
  for (const node of nodes) node.degree = degree.get(node.id) || 0

  return { nodes, edges, zoneEdges: [], zones: [], eventLabels: graph.eventLabels || {}, metrics: graph.metrics }
}

function colorSet(graph: DeckGraph): Set<string> {
  const realNodes = (graph.nodes || []).filter(node => node.role !== 'zone')
  const commander = realNodes.find(node => node.role === 'commander' && node.ci?.length)
  return new Set((commander ? [commander] : realNodes).flatMap(node => node.ci || []))
}

function inColors(candidate: CandidateCard, colors: Set<string>): boolean {
  return (candidate.ci || []).every(color => colors.has(color))
}

function signalScores(metricsRecord: Record<string, unknown>): Record<string, number> {
  const signals = metricsRecord.winTuningSignals as Record<string, { score?: number }> | undefined
  const out: Record<string, number> = {}
  for (const key of Object.keys(signals || {})) out[key] = signals?.[key]?.score || 0
  return out
}

function model(): LegacyModel {
  return (scope.INTERACTION_MODEL as LegacyModel | undefined) || (INTERACTION_MODEL as unknown as LegacyModel)
}

function metrics(): LegacyMetrics {
  return (scope.DECK_METRICS as LegacyMetrics | undefined) || (DECK_METRICS as unknown as LegacyMetrics)
}

function scoreValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function round(value: number, decimals = 1): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}
