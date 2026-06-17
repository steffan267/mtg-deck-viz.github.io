import type { DeckGraph, DeckGraphEdge, GraphInteraction, RenderGraphModel, RenderLink, RenderNode } from '../types/graph'

export const STRENGTH_RANK: Record<string, number> = {
  weak: 1,
  moderate: 2,
  strong: 3,
  'combo-critical': 4,
}

const POOL_FAMILIES = new Set(['ramp→sink', 'graveyard', 'energy', 'counters', 'proliferate→counters'])

export interface GraphModelOptions {
  cardPower?: (node: RenderNode) => number
}

export function createGraphModel(graph: DeckGraph, options: GraphModelOptions = {}): RenderGraphModel {
  const nodes = (graph.nodes || [])
    .filter((node) => node.role !== 'zone')
    .map<RenderNode>((node) => ({
      ...node,
      role: String(node.role || 'utility'),
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      fx: null,
      fy: null,
      power: 0,
      linkMass: 0,
      pwLinkMass: 0,
      massByMode: {},
      sizeByMode: {},
    }))

  const byId = new Map(nodes.map((node) => [node.id, node]))
  const links = buildRenderLinks(graph.edges || [], byId)
  computeMass(nodes, links, options.cardPower)

  const centerNode = chooseCenterNode(nodes)
  const comboNodes = computeComboNodes(links)

  return {
    nodes,
    links,
    byId,
    centerNode,
    comboNodes,
    eventLabels: graph.eventLabels || {},
  }
}

export function edgeStrength(link: Pick<RenderLink, 'interactions'>): number {
  if (link.interactions?.length) {
    return Math.max(...link.interactions.map((interaction) => STRENGTH_RANK[interaction.strength] || 1))
  }
  return 2
}

export function edgeFamily(link: Pick<RenderLink, 'events' | 'interactions'>): string {
  const interactions = link.interactions || []
  if (!interactions.length) return link.events?.[0] || 'misc'
  return interactions.reduce((best, interaction) =>
    (STRENGTH_RANK[interaction.strength] || 0) > (STRENGTH_RANK[best.strength] || 0) ? interaction : best,
  ).family
}

export function nodeFamilies(model: RenderGraphModel, node: RenderNode): Array<{ family: string; label: string; count: number; w: number }> {
  const familyMap = new Map<string, { label: string; count: number; w: number }>()
  for (const link of model.links) {
    if (link.source !== node && link.target !== node) continue
    const family = edgeFamily(link)
    const weight = link.interactions?.length
      ? Math.max(...link.interactions.map((interaction) => STRENGTH_RANK[interaction.strength] || 1))
      : 2
    const existing = familyMap.get(family) || { label: model.eventLabels[family] || model.eventLabels[`enable:${family}`] || family, count: 0, w: 0 }
    existing.count += 1
    existing.w = Math.max(existing.w, weight)
    familyMap.set(family, existing)
  }
  return [...familyMap.entries()]
    .map(([family, value]) => ({ family, ...value }))
    .sort((a, b) => b.w * b.count - a.w * a.count || b.count - a.count)
}

function buildRenderLinks(edges: DeckGraphEdge[], byId: Map<string, RenderNode>): RenderLink[] {
  const direct: RenderLink[] = []
  const pool = new Map<string, DeckGraphEdge[]>()

  for (const edge of edges) {
    const source = byId.get(edge.source)
    const target = byId.get(edge.target)
    if (!source || !target) continue

    const family = dominantFamily(edge)
    if (POOL_FAMILIES.has(family)) {
      const entries = pool.get(family) || []
      entries.push(edge)
      pool.set(family, entries)
    } else {
      direct.push({ source, target, events: edge.events, interactions: edge.interactions })
    }
  }

  const output = [...direct]
  for (const [family, edgesInFamily] of pool.entries()) {
    const degree = new Map<string, number>()
    for (const edge of edgesInFamily) {
      degree.set(edge.source, (degree.get(edge.source) || 0) + 1)
      degree.set(edge.target, (degree.get(edge.target) || 0) + 1)
    }

    const members = [...degree.keys()]
    if (members.length <= 3) {
      for (const edge of edgesInFamily) {
        const source = byId.get(edge.source)
        const target = byId.get(edge.target)
        if (source && target) output.push({ source, target, events: edge.events, interactions: edge.interactions })
      }
      continue
    }

    const hub = members.reduce((best, member) => (degree.get(member) || 0) > (degree.get(best) || 0) ? member : best, members[0])
    const strength = edgesInFamily[0]?.interactions?.[0]?.strength || 'weak'
    for (const member of members) {
      if (member === hub) continue
      const source = byId.get(member)
      const target = byId.get(hub)
      if (source && target) output.push({ source, target, events: [family], interactions: [{ family, strength }], hubSpoke: true })
    }
  }

  return output
}

function dominantFamily(edge: DeckGraphEdge): string {
  const interactions = edge.interactions || []
  if (!interactions.length) return edge.events?.[0] || 'misc'
  return interactions.reduce((best, interaction) =>
    (STRENGTH_RANK[interaction.strength] || 0) > (STRENGTH_RANK[best.strength] || 0) ? interaction : best,
  ).family
}

function computeMass(nodes: RenderNode[], links: RenderLink[], cardPower: GraphModelOptions['cardPower']) {
  for (const node of nodes) {
    node.power = cardPower ? cardPower(node) : 0
    node.linkMass = 0
    node.pwLinkMass = 0
  }

  for (const link of links) {
    const strength = edgeStrength(link)
    link.source.linkMass += strength
    link.target.linkMass += strength
    link.source.pwLinkMass += strength * (1 + (link.target.power || 0))
    link.target.pwLinkMass += strength * (1 + (link.source.power || 0))
  }

  for (const node of nodes) {
    node.massByMode = {
      blend: node.linkMass + (node.power || 0) * 2,
      split: node.linkMass,
      pwlink: node.pwLinkMass,
    }
    node.sizeByMode = {
      blend: node.linkMass + (node.power || 0) * 2,
      split: (node.power || 0) * 3,
      pwlink: node.pwLinkMass,
    }
  }
}

function chooseCenterNode(nodes: RenderNode[]): RenderNode | null {
  const commander = nodes.find((node) => node.role === 'commander')
  if (commander) return commander
  return nodes.reduce<RenderNode | null>((best, node) => {
    if (!best) return node
    return (node.massByMode.blend || 0) > (best.massByMode.blend || 0) ? node : best
  }, null)
}

function computeComboNodes(links: RenderLink[]): Set<string> {
  const comboNodes = new Set<string>()
  for (const link of links) {
    if ((link.interactions || []).some((interaction) => interaction.strength === 'combo-critical')) {
      comboNodes.add(link.source.id)
      comboNodes.add(link.target.id)
    }
  }
  return comboNodes
}
