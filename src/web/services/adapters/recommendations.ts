import type { CandidateCard, DeckGraph, GraphEdge, GraphNode, Interaction, RecommendationCardResult } from '../../types'
import { graphNodeFromCandidate, interactionEvents, type InteractionModelModule } from './interactionModel'
import type { MetricsModule } from '../../types'

const TOTAL_VALUE_AXIS_SIGMA = { win: 6.94, cohesion: 16.59, self: 7.19 }
const STRENGTH_RANK: Record<string, number> = { weak: 1, moderate: 2, strong: 3, 'combo-critical': 4 }

export function deckColorSet(graph: DeckGraph): Set<string> {
  const real = graph.nodes.filter(node => node.role !== 'zone')
  const commander = real.find(node => node.role === 'commander' && node.ci.length)
  return new Set((commander ? [commander] : real).flatMap(node => node.ci))
}

export function deckSignature(graph: DeckGraph): string {
  return graph.nodes
    .filter(node => node.role !== 'zone')
    .map(node => `${node.id}#${node.qty || 1}`)
    .sort()
    .join('|')
}

export function candidateInColors(candidate: CandidateCard, colors: Set<string>): boolean {
  return candidate.ci.every(color => colors.has(color))
}

export function recommendationStrengthScore(interactions: Interaction[]): number {
  return interactions.reduce((sum, interaction) => sum + (STRENGTH_RANK[interaction.strength] || 1), 0)
}

export function cloneGraphWithCandidate(graph: DeckGraph, candidateNode: GraphNode, model: InteractionModelModule): DeckGraph {
  const nodes = graph.nodes.filter(node => node.role !== 'zone').map(node => ({ ...node }))
  const byId = new Map(nodes.map(node => [node.id, node]))
  const edges: GraphEdge[] = graph.edges
    .filter(edge => byId.has(edge.source) && byId.has(edge.target))
    .map(edge => ({ ...edge, interactions: [...edge.interactions], events: [...edge.events] }))

  const added = { ...candidateNode }
  nodes.push(added)
  byId.set(added.id, added)

  for (const node of nodes) {
    if (node.id === added.id) continue
    const interactions = model.interactionsBetween(added, node)
    if (interactions.length) {
      edges.push({ source: added.id, target: node.id, interactions, events: interactionEvents(interactions, model) })
    }
  }

  const degree: Record<string, number> = {}
  nodes.forEach(node => {
    degree[node.id] = 0
  })
  edges.forEach(edge => {
    degree[edge.source] = (degree[edge.source] || 0) + 1
    degree[edge.target] = (degree[edge.target] || 0) + 1
  })
  nodes.forEach(node => {
    node.degree = degree[node.id] || 0
  })

  return { nodes, edges, zoneEdges: [], zones: [], eventLabels: graph.eventLabels, missing: [] }
}

function winSignalScores(graph: DeckGraph): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [key, signal] of Object.entries(graph.metrics?.winTuningSignals || {})) out[key] = signal?.score || 0
  return out
}

export function evaluateCandidateRecommendation(
  graph: DeckGraph,
  candidate: CandidateCard,
  model: InteractionModelModule,
  metrics: MetricsModule,
): RecommendationCardResult {
  const base = graph.metrics?.winTuningScore != null ? graph.metrics : metrics.compute(graph)
  const baseGraph = graph.metrics ? graph : { ...graph, metrics: base }
  const baseSignals = winSignalScores(baseGraph)
  const weakest = Object.entries(baseSignals)
    .sort((a, b) => a[1] - b[1])
    .slice(0, 4)
    .map(([key, value]) => [key, (100 - value) / 100] as const)

  const candidateNode = graphNodeFromCandidate(candidate, model)
  const candidateGraph = cloneGraphWithCandidate(baseGraph, candidateNode, model)
  const nextMetrics = metrics.compute(candidateGraph)
  candidateGraph.metrics = nextMetrics
  const nextSignals = winSignalScores(candidateGraph)
  const signalDeltas: Record<string, number> = {}
  for (const key of Object.keys(nextSignals)) signalDeltas[key] = nextSignals[key] - (baseSignals[key] || 0)

  let scoreMissing = 0
  for (const [key, weight] of weakest) scoreMissing += Math.max(0, signalDeltas[key] || 0) * weight

  const deltaWin = nextMetrics.winTuningScore - base.winTuningScore
  const deltaCohesion = nextMetrics.cohesionScore - base.cohesionScore
  const deltaSelf = nextMetrics.selfSufficiencyScore - base.selfSufficiencyScore
  const totalValue =
    Math.max(0, deltaWin) / TOTAL_VALUE_AXIS_SIGMA.win +
    Math.max(0, deltaCohesion) / TOTAL_VALUE_AXIS_SIGMA.cohesion +
    Math.max(0, deltaSelf) / TOTAL_VALUE_AXIS_SIGMA.self

  return {
    name: candidate.name,
    role: candidateNode.role,
    cmc: candidateNode.cmc,
    power: metrics.cardPower(candidateNode),
    newEdges: Math.max(0, candidateNode.degree || 0),
    deltaWin,
    deltaCohesion,
    deltaSelf,
    totalValue: Number(totalValue.toFixed(2)),
    scoreMissing: Number(scoreMissing.toFixed(2)),
    signalDeltas,
  }
}
