import type {
  CandidateCard,
  DeckGraph,
  DeckPayload,
  DeckPayloadEntry,
  GraphEdge,
  GraphNode,
  Interaction,
  ZoneDescriptor,
  ZoneEdge,
} from '../../types'

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function asArray<T>(value: unknown, map: (item: unknown) => T): T[] {
  return Array.isArray(value) ? value.map(map) : []
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function asNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function asDictionary(value: unknown): Record<string, unknown> {
  return asRecord(value)
}

export function normalizeInteraction(value: unknown): Interaction {
  const input = asRecord(value)
  return {
    ...input,
    family: asString(input.family ?? input.event ?? input.kind, 'misc'),
    strength: asString(input.strength, 'weak'),
    kind: typeof input.kind === 'string' ? input.kind : undefined,
    event: typeof input.event === 'string' ? input.event : undefined,
    direction: typeof input.direction === 'string' ? input.direction : undefined,
  }
}

export function normalizeZone(value: unknown): ZoneDescriptor {
  const input = asRecord(value)
  return {
    ...input,
    id: asString(input.id),
    label: asString(input.label ?? input.id),
    color: typeof input.color === 'string' ? input.color : undefined,
    x: typeof input.x === 'number' ? input.x : undefined,
    y: typeof input.y === 'number' ? input.y : undefined,
    text: typeof input.text === 'string' ? input.text : undefined,
  }
}

export function normalizeGraphNode(value: unknown): GraphNode {
  const input = asRecord(value)
  const fixed = asRecord(input.fixed)
  const hasFixed = typeof fixed.x === 'number' && typeof fixed.y === 'number'
  return {
    ...input,
    id: asString(input.id),
    qty: asNumber(input.qty, 1),
    role: asString(input.role, 'unknown'),
    cmc: asNumber(input.cmc),
    type: asString(input.type),
    mana: asString(input.mana),
    text: asString(input.text),
    ci: asStringArray(input.ci),
    edh: asNullableNumber(input.edh),
    degree: asNumber(input.degree),
    produces: asDictionary(input.produces),
    consumes: asDictionary(input.consumes),
    zones: asArray(input.zones, normalizeZone),
    myTypes: asStringArray(input.myTypes),
    tribalRefs: asStringArray(input.tribalRefs),
    caps: asStringArray(input.caps),
    zoneLabel: typeof input.zoneLabel === 'string' ? input.zoneLabel : undefined,
    color: typeof input.color === 'string' ? input.color : undefined,
    fixed: hasFixed ? { x: fixed.x as number, y: fixed.y as number } : undefined,
  }
}

export function normalizeGraphEdge(value: unknown): GraphEdge {
  const input = asRecord(value)
  return {
    ...input,
    source: asString(input.source),
    target: asString(input.target),
    interactions: asArray(input.interactions, normalizeInteraction),
    events: asStringArray(input.events),
    hubSpoke: typeof input.hubSpoke === 'boolean' ? input.hubSpoke : undefined,
  }
}

export function normalizeZoneEdge(value: unknown): ZoneEdge {
  const input = asRecord(value)
  const rawTarget = input.target
  return {
    ...input,
    source: asString(input.source),
    target: typeof rawTarget === 'string' ? rawTarget : normalizeZone(rawTarget),
  }
}

export function normalizeDeckGraph(value: unknown): DeckGraph {
  const input = asRecord(value)
  return {
    ...input,
    nodes: asArray(input.nodes, normalizeGraphNode),
    edges: asArray(input.edges, normalizeGraphEdge),
    zoneEdges: asArray(input.zoneEdges, normalizeZoneEdge),
    zones: asArray(input.zones, normalizeZone),
    eventLabels: Object.fromEntries(
      Object.entries(asRecord(input.eventLabels)).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
    ),
    missing: asStringArray(input.missing),
    metrics: input.metrics as DeckGraph['metrics'],
  }
}

export function normalizeDeckPayloadEntry(value: unknown): DeckPayloadEntry {
  const input = asRecord(value)
  return {
    ...input,
    title: asString(input.title, 'Deck'),
    graph: normalizeDeckGraph(input.graph),
    sourceId: typeof input.sourceId === 'string' ? input.sourceId : undefined,
  }
}

export function normalizeDeckPayload(value: unknown, title = 'Deck'): DeckPayload {
  const input = asRecord(value)
  if (Array.isArray(input.decks)) {
    const decks = input.decks.map(normalizeDeckPayloadEntry)
    const active = Math.min(Math.max(asNumber(input.active), 0), Math.max(0, decks.length - 1))
    return { decks, active }
  }

  const graph = normalizeDeckGraph(value)
  return { decks: [{ title, graph }], active: 0 }
}

export function normalizeCandidateCard(value: unknown): CandidateCard {
  const input = asRecord(value)
  return {
    ...input,
    name: asString(input.name),
    ci: asStringArray(input.ci),
    cmc: asNumber(input.cmc),
    type: asString(input.type),
    mana: asString(input.mana),
    text: asString(input.text),
    edh: asNullableNumber(input.edh),
    tags: asStringArray(input.tags),
  }
}

export function normalizeCandidateIndex(value: unknown): CandidateCard[] {
  return asArray(value, normalizeCandidateCard).filter(candidate => candidate.name)
}
