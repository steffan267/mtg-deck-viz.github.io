export type CardRole =
  | 'commander'
  | 'land'
  | 'ramp'
  | 'draw'
  | 'removal'
  | 'protection'
  | 'finisher'
  | 'engine'
  | 'combo'
  | 'zone'
  | string

export type InteractionStrength = 'weak' | 'moderate' | 'strong' | 'combo-critical' | string
export type InteractionKind = 'reaction' | 'enablement' | string
export type InteractionDirection = 'A→B' | 'B→A' | '↔' | string
export type CardFaceAvailability = 'single' | 'either-face' | 'transforms' | 'same-object-parts' | 'separate-objects'

export interface CardFaceFacts {
  index: number
  name: string
  type_line: string
  oracle_text: string
  mana_cost: string
  colors?: string[]
  oracle_id?: string
  layout?: string
  availability?: CardFaceAvailability
  [key: string]: unknown
}

export interface CardFaceSource {
  index?: number | null
  name: string
  availability?: string
  layout?: string
  snippet?: string
  [key: string]: unknown
}

export interface CardFaceClassification extends CardFaceFacts {
  role?: string
  produces?: Record<string, unknown>
  consumes?: Record<string, unknown>
  zones?: unknown[]
  caps?: string[]
  myTypes?: string[]
  tribalRefs?: string[]
  classification?: unknown
}

export interface Interaction {
  family: string
  strength: InteractionStrength
  kind?: InteractionKind
  event?: string
  direction?: InteractionDirection
  label?: string
  subjects?: string[]
  sourceFace?: CardFaceSource | null
  targetFace?: CardFaceSource | null
  faceEvidence?: { source?: CardFaceSource | null; target?: CardFaceSource | null; [key: string]: unknown }
  [key: string]: unknown
}

export interface ZoneDescriptor {
  id: string
  label: string
  color?: string
  x?: number
  y?: number
  text?: string
  [key: string]: unknown
}

export interface FixedPosition {
  x: number
  y: number
}

export interface GraphNode {
  id: string
  qty: number
  role: CardRole
  cmc: number
  type: string
  mana: string
  text: string
  ci: string[]
  edh: number | null
  degree: number
  produces: Record<string, unknown>
  consumes: Record<string, unknown>
  zones: ZoneDescriptor[]
  myTypes?: string[]
  tribalRefs?: string[]
  caps?: string[]
  layout?: string
  aliases?: string[]
  faces?: CardFaceFacts[]
  faceFacts?: CardFaceClassification[]
  factSources?: Record<string, Record<string, unknown[]>>
  faceCompatibilityWarnings?: unknown[]
  cardKey?: string
  canonicalName?: string
  zoneLabel?: string
  color?: string
  fixed?: FixedPosition
  [key: string]: unknown
}

export interface GraphEdge {
  source: string
  target: string
  interactions: Interaction[]
  events: string[]
  hubSpoke?: boolean
  [key: string]: unknown
}

export interface InteractionProofContribution {
  card: string
  role: string
  facts: string[]
  text?: string
  faces?: CardFaceSource[]
  [key: string]: unknown
}

export interface InteractionProofStep {
  index: number
  card?: string
  action: string
  delta?: unknown
  cost?: unknown
  [key: string]: unknown
}

export interface InteractionProofDelta {
  resource?: string
  min?: string | number
  max?: string | number
  delta?: string
  confidence?: string
  source?: string
  [key: string]: unknown
}

export interface InteractionProofEvidence {
  card?: string
  predicate?: string
  text?: string
  faces?: CardFaceSource[]
  face?: CardFaceSource
  [key: string]: unknown
}

export interface InteractionProofPackage {
  schemaVersion: string
  id: string
  family: string
  familyTitle: string
  cards: string[]
  cardCount: number
  status: string
  confidence: string
  strength: InteractionStrength
  result: string
  repeatability?: { status?: string; reason?: string; [key: string]: unknown } | null
  assumptions: string[]
  limitingClauses: string[]
  resourceDeltas: InteractionProofDelta[]
  sequence: InteractionProofStep[]
  contributions: InteractionProofContribution[]
  evidence: InteractionProofEvidence[]
  hyperedgeIds: string[]
  [key: string]: unknown
}

export interface ZoneEdge {
  source: string
  target: string | ZoneDescriptor
  [key: string]: unknown
}

export interface ComboCriticalPair {
  a: string
  b: string
  family: string
  families?: string[]
}

export interface ComboCriticalTriple {
  cards: string[]
  family: string
}

export interface CommanderBracketComboPackage {
  cards: string[]
  family: string
  manaValue: number
}

export interface CommanderBracketFlags {
  gameChangerCount?: number
  gameChangers?: string[]
  tutorRaw?: number
  tutorCards?: Array<{ id: string; w?: number }>
  fewTutors?: boolean
  massLandDenialCards?: string[]
  extraTurnCards?: string[]
  hasChainedExtraTurns?: boolean
  chainedExtraTurnCards?: string[]
  comboPairs?: CommanderBracketComboPackage[]
  comboTriples?: CommanderBracketComboPackage[]
  earlyComboPairs?: CommanderBracketComboPackage[]
  lateComboPairs?: CommanderBracketComboPackage[]
  earlyComboTriples?: CommanderBracketComboPackage[]
  lateComboTriples?: CommanderBracketComboPackage[]
  winTuningScore?: number
  winTuningBand?: string
  [key: string]: unknown
}

export interface CommanderBracketResult {
  bracket: number | string
  label: string
  flags?: CommanderBracketFlags
  ruleBreaks?: string[]
  [key: string]: unknown
}

export interface DeckGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
  interactionProofs?: InteractionProofPackage[]
  zoneEdges?: ZoneEdge[]
  zones?: ZoneDescriptor[]
  eventLabels?: Record<string, string>
  missing?: string[]
  metrics?: import('./metrics').DeckMetrics
  [key: string]: unknown
}

export interface DeckPayloadEntry {
  title: string
  graph: DeckGraph
  sourceId?: string
  [key: string]: unknown
}

export interface DeckPayload {
  decks: DeckPayloadEntry[]
  active: number
}

export interface ParsedDeckCard {
  qty: number
  name: string
}

export interface ResolvedCard {
  name: string
  type_line: string
  oracle_text: string
  mana_cost: string
  cmc: number
  edhrec_rank: number | null
  color_identity: string[]
  layout?: string
  aliases?: string[]
  faces?: CardFaceFacts[]
  cardKey?: string
  canonicalName?: string
  card_faces?: Array<Partial<CardFaceFacts>>
  [key: string]: unknown
}

export interface ResolvedDeckCard {
  qty: number
  card: ResolvedCard
}

export interface CandidateCard {
  name: string
  ci: string[]
  cmc: number
  type: string
  mana: string
  text: string
  edh: number | null
  tags: string[]
  layout?: string
  aliases?: string[]
  faces?: CardFaceFacts[]
  cardKey?: string
  canonicalName?: string
  [key: string]: unknown
}

export interface ImportedDeck {
  title: string
  graph: DeckGraph
  missing: string[]
  sourceId: string
}

export type BuildGraphFn = (
  cards: ResolvedDeckCard[],
  onProgress?: (done: number, total: number) => void,
) => Promise<DeckGraph> | DeckGraph

export type GraphInteraction = Interaction
export type DeckGraphEdge = GraphEdge

export interface RenderNode extends GraphNode {
  x: number
  y: number
  vx: number
  vy: number
  fx: number | null
  fy: number | null
  power: number
  linkMass: number
  pwLinkMass: number
  massByMode: Record<string, number>
  sizeByMode: Record<string, number>
}

export interface RenderLink {
  source: RenderNode
  target: RenderNode
  events: string[]
  interactions: Interaction[]
  hubSpoke?: boolean
}

export interface RenderGraphModel {
  nodes: RenderNode[]
  links: RenderLink[]
  byId: Map<string, RenderNode>
  centerNode: RenderNode | null
  comboNodes: Set<string>
  eventLabels: Record<string, string>
}

export interface GraphViewport {
  x: number
  y: number
  k: number
}

export interface GraphRenderInput {
  graph: DeckGraph
  layoutMode?: string
  roleVisibility?: Readonly<Record<string, boolean>>
  hideIsolated?: boolean
  searchTerm?: string
  selectedNodeId?: string | null
  selectedNodeIds?: readonly string[]
  selectedFamily?: string | null
  spotlightCombos?: boolean
  frozen?: boolean
}

export interface GraphRendererEvents {
  nodeHover?: (node: RenderNode | null, position: { x: number; y: number } | null) => void
  nodeSelect?: (node: RenderNode | null) => void
  viewportChange?: (viewport: GraphViewport) => void
}

export interface GraphRenderer {
  mount(canvas: HTMLCanvasElement): void
  update(input: GraphRenderInput): void
  resize(): void
  resetView(): void
  relayout(): void
  destroy(): void
}

export interface GraphLayoutStrategy {
  id: string
  label: string
  massOf(node: RenderNode): number
  sizeMassOf(node: RenderNode): number
}
