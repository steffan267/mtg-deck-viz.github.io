import type { DeckGraph, GraphEdge, GraphNode, ResolvedDeckCard, ZoneDescriptor } from '../types'
import type { InteractionModelModule } from './adapters/interactionModel'
import type { MetricsModule } from '../types'
import { annotateInteractionFaceEvidence, graphNodeFromResolvedCard, interactionEvents } from './adapters/interactionModel'
import * as CARD_FACES from '../../card-faces.js'

export interface BrowserGraphBuilderOptions {
  includeInteractionProofs?: boolean
  buildInteractionProofPackages?: (cards: GraphNode[]) => DeckGraph['interactionProofs']
}

function isCommanderish(node: GraphNode): boolean {
  const type = node.type.toLowerCase()
  return type.includes('legendary') && (type.includes('creature') || type.includes('planeswalker'))
}

function mergeResolvedDeckCards(cards: ResolvedDeckCard[]): ResolvedDeckCard[] {
  const byPhysicalCard = new Map<string, ResolvedDeckCard>()
  for (const entry of cards) {
    const key = CARD_FACES.physicalCardKey(entry.card)
    const current = byPhysicalCard.get(key)
    if (!current) {
      byPhysicalCard.set(key, { qty: entry.qty, card: entry.card })
      continue
    }
    current.qty += entry.qty
    if (CARD_FACES.faceDataScore(entry.card) > CARD_FACES.faceDataScore(current.card)) current.card = entry.card
  }
  return [...byPhysicalCard.values()]
}

export function createBrowserGraphBuilder(model: InteractionModelModule, metrics: MetricsModule, options: BrowserGraphBuilderOptions = {}) {
  return function buildGraph(cards: ResolvedDeckCard[], onProgress?: (done: number, total: number) => void): DeckGraph {
    const mergedCards = mergeResolvedDeckCards(cards)
    const nodes: GraphNode[] = []
    const missing: string[] = []
    let commanderAssigned = false

    mergedCards.forEach((entry, index) => {
      const node = graphNodeFromResolvedCard(entry.qty, entry.card, model)
      if (!commanderAssigned && isCommanderish(node)) {
        node.role = 'commander'
        commanderAssigned = true
      }
      nodes.push(node)
      onProgress?.(index + 1, mergedCards.length)
    })

    const edges: GraphEdge[] = []
    const seen = new Set<string>()
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = nodes[i]
        const b = nodes[j]
        const interactions = annotateInteractionFaceEvidence(a, b, model.interactionsBetween(a, b))
        if (!interactions.length) continue
        const key = [a.id, b.id].sort().join('||')
        if (seen.has(key)) continue
        seen.add(key)
        edges.push({ source: a.id, target: b.id, interactions, events: interactionEvents(interactions, model) })
      }
    }

    const degree: Record<string, number> = {}
    nodes.forEach(node => { degree[node.id] = 0 })
    edges.forEach(edge => {
      degree[edge.source] = (degree[edge.source] || 0) + 1
      degree[edge.target] = (degree[edge.target] || 0) + 1
    })
    nodes.forEach(node => { node.degree = degree[node.id] || 0 })

    const zoneNodes = (model.ZONES || []).map((zone: ZoneDescriptor): GraphNode => ({
      id: zone.id,
      role: 'zone',
      zoneLabel: zone.label,
      color: zone.color,
      fixed: zone.x != null && zone.y != null ? { x: zone.x, y: zone.y } : undefined,
      cmc: 0,
      type: 'Game zone',
      mana: '',
      text: zone.text || '',
      qty: 0,
      ci: [],
      edh: null,
      produces: {},
      consumes: {},
      zones: [],
      degree: 0,
    }))

    const zoneEdges = nodes.flatMap(node => (node.zones || []).map(zone => ({ source: node.id, target: zone })))
    const graph: DeckGraph = { nodes: [...nodes, ...zoneNodes], edges, zoneEdges, zones: model.ZONES, eventLabels: model.EVENT_LABEL, missing }
    if (options.includeInteractionProofs) {
      graph.interactionProofs = options.buildInteractionProofPackages?.(nodes) || []
      applyInteractionProofCounts(graph.nodes, graph.interactionProofs)
    }
    graph.metrics = metrics.compute(graph)
    return graph
  }
}

function applyInteractionProofCounts(nodes: GraphNode[], proofs: DeckGraph['interactionProofs'] = []) {
  const counts = new Map<string, number>()
  for (const proof of proofs) {
    for (const card of new Set(proof.cards || [])) counts.set(card, (counts.get(card) || 0) + 1)
  }
  for (const node of nodes) node.comboPackageCount = counts.get(node.id) || 0
}
