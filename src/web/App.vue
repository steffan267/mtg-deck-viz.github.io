<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import GraphCanvas from './components/graph/GraphCanvas.vue'
import ImportControls from './components/import/ImportControls.vue'
import RecommendationsDrawer from './components/recommendations/RecommendationsDrawer.vue'
import ModalShell from './components/common/ModalShell.vue'
import DeckList from './components/sidebar/DeckList.vue'
import DeckTabs from './components/sidebar/DeckTabs.vue'
import SidebarShell from './components/sidebar/SidebarShell.vue'
import DeckMetricsGuide from './components/sidebar/DeckMetricsGuide.vue'
import ScorePanel from './components/score/ScorePanel.vue'
import SignalBarList from './components/score/SignalBarList.vue'
import ToolbarButton from './components/common/ToolbarButton.vue'
import { metricsToCompareRows, metricsToScoreSections } from './services/adapters/metrics'
import { normalizeCandidateIndex, normalizeDeckPayload } from './services/adapters/payload'
import { emptyBootstrap, loadBrowserBootstrap } from './services/bootstrap'
import { createBrowserRecommendationProvider } from './services/recommendations'
import { saltyCardReferences } from './services/saltList'
import { buildDeckGuideMetrics } from './services/deckGuideMetrics'
import { createBrowserGraphBuilder } from './services/browserGraphBuilder'
import { useDeckImport } from './composables/useDeckImport'
import { layoutStrategies } from './services/graphLayoutStrategies'
import { cardFaceOverview } from './services/cardFaceDisplay'
import * as INTERACTION_MODEL from '../interaction-model.js'
import * as DECK_METRICS_NAMESPACE from '../metrics.js'
import { useRecommendations } from './composables/useRecommendations'
import type { CandidateCard, DeckGraph, DeckPayloadEntry, DeckMetrics, GraphNode, MetricsModule, MetricItem, RankGroup, ScoreSection, SignalBar } from './types'
import { normalizeInteractionModel, normalizeMetricsModule } from './services/adapters/legacyModules'
import type { DeckImportSource } from './services/import'
import type { GraphInteraction, InteractionProofPackage, RenderNode } from './types/graph'

const ROLE_COLORS: Record<string, string> = {
  commander: '#f0c040', land: '#6b6478', ramp: '#54c98a', draw: '#5aa6ff', payoff: '#d9434f',
  removal: '#ff7a3d', wipe: '#ff7a3d', tutor: '#c084fc', protection: '#9ad17a', finisher: '#ff5c8a',
  political: '#e0a85a', utility: '#bfb6d4', creature: '#9ad17a', engine: '#54c98a', combo: '#ff7a3d',
}

const ROLE_LABELS: Record<string, string> = {
  commander: 'Commander', land: 'Land', ramp: 'Ramp / mana', draw: 'Card draw', payoff: 'Payoff',
  removal: 'Removal', wipe: 'Board wipe', tutor: 'Tutor', protection: 'Protection', finisher: 'Finisher',
  political: 'Politics / goad', utility: 'Utility', creature: 'Creature', engine: 'Engine', combo: 'Combo',
}

const bootstrap = ref(emptyBootstrap())
const bootstrapped = ref(false)
const payload = normalizeDeckPayload(bootstrap.value, bootstrap.value.title || 'Deck Interaction Map')
const candidates = ref<CandidateCard[]>(normalizeCandidateIndex(bootstrap.value.candidates || []))
const decks = ref<DeckPayloadEntry[]>(payload.decks)
const activeIndex = ref(payload.active)
const selectedNodeId = ref<string | null>(null)
const hoveredNodeId = ref<string | null>(null)
const hoverPosition = ref<{ x: number; y: number } | null>(null)
const searchTerm = ref('')
const layoutMode = ref('blend')
const frozen = ref(false)
const hideIsolated = ref(false)
const draggingDeck = ref(false)
const moxfieldProxy = ref(window.__MOXFIELD_PROXY__ || '')
const showRecommendations = ref(false)
const currentPage = ref<'visualization' | 'breakdown'>('visualization')
const selectedFamily = ref<string | null>(null)
const showHelp = ref(false)
const showCompare = ref(false)
const showInteractionProofs = ref(false)
const selectedBreakdownId = ref<string | null>(null)
const selectedBreakdownCategoryId = ref<string | null>(null)
const selectedProofFamily = ref<string | null>(null)
const selectedProofCardCount = ref<number | null>(null)
const selectedProofPackageId = ref<string | null>(null)
const graphCanvasRef = ref<InstanceType<typeof GraphCanvas> | null>(null)

const activeDeck = computed(() => decks.value[activeIndex.value] || null)
const activeGraph = computed<DeckGraph | null>(() => activeDeck.value?.graph || null)
const graphNodes = computed(() => activeGraph.value?.nodes || [])
const cardNodes = computed(() => graphNodes.value.filter(node => node.role !== 'zone'))
const interactionProofs = computed<InteractionProofPackage[]>(() => activeGraph.value?.interactionProofs || [])
const interactionProofsMaterialized = computed(() => Array.isArray(activeGraph.value?.interactionProofs))
const proofToolbarLabel = computed(() => interactionProofsMaterialized.value ? `Proofs: ${interactionProofs.value.length}` : 'Proofs')
const activeMetrics = computed(() => activeGraph.value?.metrics || null)
const baseScoreSections = computed(() => activeMetrics.value ? metricsToScoreSections(activeMetrics.value) : [])
const scoreSections = computed<ScoreSection[]>(() => enrichScoreSections(baseScoreSections.value))
const layoutModeLabel = computed(() => layoutStrategies.find(strategy => strategy.id === layoutMode.value)?.label || layoutStrategies[0].label)
const saltReferences = computed(() => saltyCardReferences(cardNodes.value.map(node => node.id)))
const deckGuideMetrics = computed(() => buildDeckGuideMetrics(cardNodes.value, activeMetrics.value))

const browserGlobals = globalThis as typeof globalThis & {
  INTERACTION_MODEL?: unknown
  DECK_METRICS?: unknown
  __MTG_INTERACTION_PROOF_PACKAGES__?: { buildInteractionProofPackages?: (cards: GraphNode[]) => InteractionProofPackage[] }
}
const metricsNamespace = DECK_METRICS_NAMESPACE as unknown as MetricsModule
const deckMetrics = normalizeMetricsModule(browserGlobals.DECK_METRICS || metricsNamespace)
const interactionModel = normalizeInteractionModel(browserGlobals.INTERACTION_MODEL || INTERACTION_MODEL)
const buildGraph = createBrowserGraphBuilder(interactionModel, deckMetrics, { includeInteractionProofs: false })
const deckImport = useDeckImport({
  buildGraph,
  fetch: globalThis.fetch?.bind(globalThis),
  get moxfieldProxy() { return moxfieldProxy.value },
})
const recommendationProvider = createBrowserRecommendationProvider()
const recommendations = useRecommendations(recommendationProvider, () => activeGraph.value, () => candidates.value)
watch(showRecommendations, value => {
  if (value && !recommendations.result.value && !recommendations.loading.value) recommendations.start()
  else if (!value) recommendations.reset()
})

onMounted(async () => {
  bootstrap.value = await loadBrowserBootstrap()
  const loaded = normalizeDeckPayload(bootstrap.value, bootstrap.value.title || 'Deck Interaction Map')
  decks.value = loaded.decks
  activeIndex.value = loaded.active
  candidates.value = normalizeCandidateIndex(bootstrap.value.candidates || [])
  moxfieldProxy.value = window.__MOXFIELD_PROXY__ || bootstrap.value.moxfieldProxy || ''
  bootstrapped.value = true
})

const deckTabs = computed(() => decks.value.map((deck, index) => ({
  id: String(index),
  label: deck.title,
  score: deck.graph.metrics?.winTuningScore,
  closeable: decks.value.length > 1,
})))

const rankGroups = computed<RankGroup[]>(() => {
  const real = cardNodes.value.filter(node => node.role !== 'land')
  const connected = [...real].sort((a, b) => (b.degree || 0) - (a.degree || 0)).slice(0, 8)
  const islands = real.filter(node => (node.degree || 0) === 0).slice(0, 8)
  return [
    { id: 'connected', label: 'Most connected cards', rows: connected.map(rankRow) },
    { id: 'islands', label: 'Islands (0 interactions)', rows: islands.map(node => ({ ...rankRow(node), value: 0 })) },
  ].filter(group => group.rows.length)
})

const activeNode = computed(() => {
  const id = selectedNodeId.value || hoveredNodeId.value
  return id ? cardNodes.value.find(node => node.id === id) || null : null
})

const compareRows = computed(() => decks.value.map((deck, index) => ({
  id: String(index),
  title: deck.title,
  active: index === activeIndex.value,
  cards: deck.graph.nodes.filter(node => node.role !== 'zone').length,
  interactions: deck.graph.edges.length,
  score: deck.graph.metrics?.winTuningScore ?? null,
})))

const compareMetricRows = computed(() => {
  const rowsByDeck = decks.value.map(deck => metricsToCompareRows((deck.graph.metrics || deckMetrics.compute(deck.graph)) as DeckMetrics))
  const rowIds = rowsByDeck[0]?.map(row => row.id) || []
  return rowIds.map((id) => {
    const first = rowsByDeck[0].find(row => row.id === id)!
    const values = rowsByDeck.map(rows => rows.find(row => row.id === id)?.value ?? '—')
    return { id, label: first.label, section: first.section, values }
  })
})

const selectedBreakdownSection = computed(() => selectedBreakdownId.value ? scoreSections.value.find(section => section.id === selectedBreakdownId.value) || null : null)
const scoreBreakdownMetrics = computed(() => selectedBreakdownSection.value && activeMetrics.value ? breakdownMetrics(selectedBreakdownSection.value, activeMetrics.value) : [])
const scoreBreakdownLists = computed(() => selectedBreakdownSection.value && activeMetrics.value && activeGraph.value ? breakdownLists(selectedBreakdownSection.value, activeMetrics.value, activeGraph.value) : [])
const scoreBreakdownCategories = computed(() => selectedBreakdownSection.value ? breakdownTabs(selectedBreakdownSection.value, scoreBreakdownMetrics.value, scoreBreakdownLists.value) : [])
const activeBreakdownCategory = computed(() => scoreBreakdownCategories.value.find(category => category.id === selectedBreakdownCategoryId.value) || null)
const activeBreakdownCards = computed(() => activeBreakdownCategory.value ? categoryCards(activeBreakdownCategory.value) : [])
const selectedBreakdownNodeIds = computed(() => activeBreakdownCards.value.map(card => card.id))
const selectedProofPackage = computed(() => selectedProofPackageId.value ? interactionProofs.value.find(pkg => pkg.id === selectedProofPackageId.value) || null : null)
const selectedProofNodeIds = computed(() => selectedProofPackage.value?.cards || [])
const highlightedNodeIds = computed(() => [...new Set([...selectedBreakdownNodeIds.value, ...selectedProofNodeIds.value])])
const scoreModelCategories = computed(() => scoreBreakdownCategories.value.filter(category => category.group === 'score'))
const graphExploreCategories = computed(() => scoreBreakdownCategories.value.filter(category => category.group !== 'score'))
const proofFamilyFilters = computed(() => {
  const counts = new Map<string, { family: string; label: string; count: number }>()
  for (const proof of interactionProofs.value) {
    const entry = counts.get(proof.family) || { family: proof.family, label: proof.familyTitle || labelEvent(activeGraph.value || { eventLabels: {} } as DeckGraph, proof.family), count: 0 }
    entry.count += 1
    counts.set(proof.family, entry)
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
})
const proofCardCountFilters = computed(() => {
  const counts = new Map<number, number>()
  for (const proof of interactionProofs.value) counts.set(proof.cardCount, (counts.get(proof.cardCount) || 0) + 1)
  return [...counts.entries()].sort((a, b) => a[0] - b[0]).map(([cardCount, count]) => ({ cardCount, count }))
})
const filteredInteractionProofs = computed(() => interactionProofs.value
  .filter(proof => !selectedProofFamily.value || proof.family === selectedProofFamily.value)
  .filter(proof => !selectedProofCardCount.value || proof.cardCount === selectedProofCardCount.value))

watch(selectedBreakdownId, () => {
  selectedBreakdownCategoryId.value = null
})

const activeNodeFamilies = computed(() => activeNode.value && activeGraph.value ? nodeFamilies(activeNode.value, activeGraph.value) : [])
const activeNodeLinks = computed(() => activeNode.value && activeGraph.value ? nodeLinks(activeNode.value, activeGraph.value) : [])
const activeNodeProofs = computed(() => activeNode.value ? interactionProofs.value.filter(proof => proof.cards.includes(activeNode.value!.id)) : [])
const activeNodeEvents = computed(() => activeNode.value && activeGraph.value ? eventSummary(activeNode.value, activeGraph.value) : '')
const activeNodeFaceOverview = computed(() => cardFaceOverview(activeNode.value))
const activeNodePills = computed(() => {
  const node = activeNode.value
  if (!node) return []
  const pills = [{ label: ROLE_LABELS[node.role] || node.role, color: ROLE_COLORS[node.role] || '#888' }]
  if (activeNodeFaceOverview.value) pills.push({ label: activeNodeFaceOverview.value.chip, color: '#9cc8ff' })
  if (node.degree != null) pills.push({ label: `${node.degree} links`, color: '#ff8a93' })
  if (node.power) pills.push({ label: `power ${node.power}`, color: '#e0c85a' })
  if (node.linkMass) pills.push({ label: `link mass ${node.linkMass}`, color: '#5aa6ff' })
  return pills
})


function enrichScoreSections(sections: ScoreSection[]): ScoreSection[] {
  return sections.map((section) => {
    if (section.id === 'win') {
      return { ...section, subtitle: section.summary || 'Speed, tutors, card flow, answers, closure, and resilience.', saltReferences: saltReferences.value, signals: (section.signals || []).map(signal => withSignalTitle(withSelectableFamily(signal), 'win')) }
    }
    if (section.id === 'cohesion') {
      return { ...section, subtitle: 'Interaction families and density across the deck.', signals: interactionFamilySignals.value.map(signal => withSignalTitle(signal, 'cohesion')) }
    }
    if (section.id === 'self-sufficiency') {
      return { ...section, subtitle: 'Standalone card quality before synergy bonuses.', signals: selfSufficientSignals.value.map(signal => withSignalTitle(signal, 'self-sufficiency')) }
    }
    return section
  })
}

const interactionFamilySignals = computed<SignalBar[]>(() => {
  const graph = activeGraph.value
  if (!graph) return []
  const counts = new Map<string, number>()
  for (const edge of graph.edges || []) {
    for (const interaction of edge.interactions || []) {
      counts.set(interaction.family, (counts.get(interaction.family) || 0) + 1)
    }
    if (!(edge.interactions || []).length && edge.events?.[0]) counts.set(edge.events[0], (counts.get(edge.events[0]) || 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || labelEvent(graph, a[0]).localeCompare(labelEvent(graph, b[0])))
    .slice(0, 10)
    .map(([family, count]) => ({ id: family, label: labelEvent(graph, family), value: count, max: Math.max(1, graph.edges.length), selectableFamily: family }))
})

const selfSufficientSignals = computed<SignalBar[]>(() => {
  const nodes = cardNodes.value.filter(node => node.role !== 'land')
  const scored = nodes
    .map(node => ({ node, score: deckMetrics.cardPower(node) || 0 }))
    .sort((a, b) => b.score - a.score || a.node.id.localeCompare(b.node.id))
    .slice(0, 8)
  const max = Math.max(1, ...scored.map(row => row.score))
  return scored.map(({ node, score }) => ({ id: node.id, label: shortName(node.id), value: score, max, cards: [node.id] }))
})

function withSelectableFamily(signal: SignalBar): SignalBar {
  const family = familyForWinSignal(signal.id)
  return family ? { ...signal, selectableFamily: family } : signal
}

function familyForWinSignal(signalId: string): string | undefined {
  const families = interactionFamilySignals.value.map(signal => signal.id)
  const termsBySignal: Record<string, string[]> = {
    speed: ['mana', 'ramp', 'cost'],
    consistency: ['tutor', 'search'],
    cardFlow: ['draw', 'discard', 'card'],
    interaction: ['removal', 'destroy', 'damage', 'exile', 'answer'],
    closure: ['payoff', 'lifeloss', 'damage', 'combo'],
    resilience: ['graveyard', 'protection', 'reanimate'],
    efficiency: ['mana', 'cost', 'cast'],
  }
  const terms = termsBySignal[signalId] || []
  return families.find(family => terms.some(term => family.toLowerCase().includes(term)))
}

function rankRow(node: GraphNode) {
  return { id: node.id, label: shortName(node.id), value: node.degree || 0, color: ROLE_COLORS[node.role] || '#888', role: node.role }
}

function shortName(name: string) {
  return name.split('//')[0].replace(/,.*$/, '').trim()
}

function labelEvent(graph: DeckGraph, event: string) {
  return graph.eventLabels?.[event] || graph.eventLabels?.[`enable:${event}`] || event
}

function interactionStrength(interactions: GraphInteraction[] | undefined) {
  const ranks: Record<string, number> = { weak: 1, moderate: 2, strong: 3, 'combo-critical': 4 }
  return interactions?.length ? Math.max(...interactions.map(interaction => ranks[interaction.strength] || 1)) : 2
}

function dominantFamily(edge: { events?: string[]; interactions?: GraphInteraction[] }, graph: DeckGraph) {
  const interactions = edge.interactions || []
  if (!interactions.length) return labelEvent(graph, edge.events?.[0] || 'misc')
  const top = interactions.reduce((best, interaction) =>
    interactionStrength([interaction]) > interactionStrength([best]) ? interaction : best,
  )
  return labelEvent(graph, top.family)
}

function nodeFamilies(node: GraphNode, graph: DeckGraph) {
  const families = new Map<string, { label: string; count: number; weight: number }>()
  for (const edge of graph.edges || []) {
    if (edge.source !== node.id && edge.target !== node.id) continue
    const label = dominantFamily(edge, graph)
    const weight = interactionStrength(edge.interactions)
    const current = families.get(label) || { label, count: 0, weight: 0 }
    current.count += 1
    current.weight = Math.max(current.weight, weight)
    families.set(label, current)
  }
  return [...families.values()].sort((a, b) => b.weight * b.count - a.weight * a.count || b.count - a.count).slice(0, 8)
}

function nodeLinks(node: GraphNode, graph: DeckGraph) {
  return (graph.edges || [])
    .filter(edge => edge.source === node.id || edge.target === node.id)
    .map(edge => ({
      card: edge.source === node.id ? edge.target : edge.source,
      family: dominantFamily(edge, graph),
      strength: interactionStrength(edge.interactions),
    }))
    .sort((a, b) => b.strength - a.strength || a.card.localeCompare(b.card))
    .slice(0, 12)
}

function eventSummary(node: GraphNode, graph: DeckGraph) {
  const produces = Object.keys(node.produces || {}).map(event => labelEvent(graph, event))
  const consumes = Object.keys(node.consumes || {}).map(event => labelEvent(graph, event))
  const lines = []
  if (produces.length) lines.push(`Produces: ${produces.join(', ')}`)
  if (consumes.length) lines.push(`Reacts to: ${consumes.join(', ')}`)
  return lines.join('\n')
}

function selectDeck(tabId: string) {
  activeIndex.value = Number(tabId)
  selectedNodeId.value = null
  selectedFamily.value = null
  selectedProofPackageId.value = null
  refreshRecommendationsForDeckChange()
}

function closeDeck(tabId: string) {
  if (decks.value.length <= 1) return
  const index = Number(tabId)
  const activeDeckBeforeClose = activeDeck.value
  decks.value.splice(index, 1)
  const preservedIndex = activeDeckBeforeClose ? decks.value.indexOf(activeDeckBeforeClose) : -1
  activeIndex.value = preservedIndex >= 0 ? preservedIndex : Math.max(0, Math.min(activeIndex.value, decks.value.length - 1))
  refreshRecommendationsForDeckChange()
}

function selectScoreSignal(signal: SignalBar) {
  if (signal.selectableFamily) {
    selectedFamily.value = selectedFamily.value === signal.selectableFamily ? null : signal.selectableFamily
    selectedNodeId.value = null
    return
  }
  selectedFamily.value = null
  selectedNodeId.value = signal.cards?.[0] && selectedNodeId.value !== signal.cards[0] ? signal.cards[0] : null
}

function openScoreBreakdown(section: ScoreSection) {
  if (section.id === 'win') materializeInteractionProofs()
  selectedBreakdownId.value = section.id
}

function selectBreakdownSignal(signal: SignalBar) {
  selectScoreSignal(signal)
}

function selectBreakdownCategory(category: BreakdownTab) {
  selectedBreakdownCategoryId.value = selectedBreakdownCategoryId.value === category.id ? null : category.id
  selectedFamily.value = null
  selectedNodeId.value = null
  selectedProofPackageId.value = null
}

function selectBreakdownRow(row: BreakdownListRow) {
  if (row.proofId) {
    const proof = interactionProofs.value.find(pkg => pkg.id === row.proofId)
    if (proof) {
      showInteractionProofs.value = true
      selectProofPackage(proof)
    }
    return
  }
  if (row.family) {
    selectedFamily.value = row.family
    selectedNodeId.value = null
    selectedProofPackageId.value = null
    return
  }
  const card = row.cards?.[0]
  if (card) {
    selectCard(card)
  }
}

function closeScoreBreakdown() {
  selectedBreakdownId.value = null
  selectedBreakdownCategoryId.value = null
}

function selectCard(id: string) {
  selectedFamily.value = null
  selectedProofPackageId.value = null
  selectedNodeId.value = id
}

function resetView() {
  selectedNodeId.value = null
  selectedFamily.value = null
  selectedProofPackageId.value = null
  hoveredNodeId.value = null
  hoverPosition.value = null
  searchTerm.value = ''
  graphCanvasRef.value?.resetView()
}

function cycleLayoutMode() {
  const index = layoutStrategies.findIndex(strategy => strategy.id === layoutMode.value)
  layoutMode.value = layoutStrategies[(index + 1) % layoutStrategies.length].id
}

function relayout() {
  graphCanvasRef.value?.relayout()
}

function hoverCard(node: RenderNode | null, position: { x: number; y: number } | null) {
  hoveredNodeId.value = node?.id || null
  hoverPosition.value = position
}

async function importDeck(source: DeckImportSource) {
  const result = await deckImport.importDeck(source)
  if (!result.ok) return
  decks.value.push({ title: result.value.title, graph: result.value.graph, sourceId: result.value.sourceId })
  activeIndex.value = decks.value.length - 1
  selectedNodeId.value = null
  selectedFamily.value = null
  selectedProofPackageId.value = null
  searchTerm.value = ''
  refreshRecommendationsForDeckChange()
}

function refreshRecommendationsForDeckChange() {
  recommendations.reset()
  if (showRecommendations.value) recommendations.start()
}

function dropDeck(event: DragEvent) {
  draggingDeck.value = false
  const file = event.dataTransfer?.files?.[0]
  if (file) void importDeck({ kind: 'file', file })
}

function clearSelectedProofPackage() {
  selectedProofPackageId.value = null
  selectedFamily.value = null
}

function selectProofFamily(family: string | null) {
  selectedProofFamily.value = selectedProofFamily.value === family ? null : family
  clearSelectedProofPackage()
}

function selectProofCardCount(cardCount: number | null) {
  selectedProofCardCount.value = selectedProofCardCount.value === cardCount ? null : cardCount
  clearSelectedProofPackage()
}

function resetProofFilters() {
  selectedProofFamily.value = null
  selectedProofCardCount.value = null
  clearSelectedProofPackage()
}

function selectProofPackage(proof: InteractionProofPackage) {
  const selecting = selectedProofPackageId.value !== proof.id
  selectedProofPackageId.value = selecting ? proof.id : null
  selectedFamily.value = selecting ? proof.family : null
  selectedNodeId.value = null
  selectedBreakdownCategoryId.value = null
}

function materializeInteractionProofs() {
  const deck = activeDeck.value
  const graph = deck?.graph
  if (!deck || !graph) return []
  if (Array.isArray(graph.interactionProofs)) return graph.interactionProofs
  const packages = browserGlobals.__MTG_INTERACTION_PROOF_PACKAGES__?.buildInteractionProofPackages?.(cardNodes.value) || []
  decks.value.splice(activeIndex.value, 1, { ...deck, graph: { ...graph, interactionProofs: packages } })
  return packages
}

function toggleInteractionProofs() {
  if (!showInteractionProofs.value) materializeInteractionProofs()
  showInteractionProofs.value = !showInteractionProofs.value
}

function proofCardNames(proof: InteractionProofPackage) {
  return proof.cards.map(shortName).join(' + ')
}

function proofDeltaText(delta: unknown) {
  const value = delta && typeof delta === 'object' ? delta as Record<string, unknown> : {}
  if (value.delta) return `${value.resource || 'resource'} ${value.delta}`
  if (value.min === value.max) return `${value.resource || 'resource'} ${value.min}`
  if (value.min != null || value.max != null) return `${value.resource || 'resource'} ${value.min ?? '?'}..${value.max ?? '?'}`
  return String(delta || '')
}

function proofStepText(step: { card?: string; action?: string; delta?: unknown; cost?: unknown }) {
  const suffixes = []
  if (step.cost) suffixes.push(`cost ${JSON.stringify(step.cost)}`)
  if (step.delta) suffixes.push(`delta ${JSON.stringify(step.delta)}`)
  return `${step.card ? `${shortName(step.card)} — ` : ''}${step.action || 'step'}${suffixes.length ? ` (${suffixes.join('; ')})` : ''}`
}

function proofContributionFacts(contribution: { facts?: string[] }) {
  return (contribution.facts || []).map(titleCase).join(', ') || 'Inferred from card text'
}

interface BreakdownListRow {
  id: string
  label: string
  value?: string | number
  note?: string
  cards?: string[]
  family?: string
  proofId?: string
}

interface BreakdownList {
  id: string
  title: string
  description?: string
  rows: BreakdownListRow[]
}

interface BreakdownTab extends BreakdownList {
  count: number
  countLabel: string
  group?: 'score' | 'graph'
}


function breakdownMetrics(section: ScoreSection, metrics: DeckMetrics): MetricItem[] {
  const rows: MetricItem[] = [
    { id: 'score', label: 'Score', value: `${section.value}${section.max ? `/${section.max}` : '/100'}` },
    { id: 'band', label: 'Band', value: section.band || '—' },
  ]
  if (section.id === 'win') {
    rows.push(
      { id: 'summary', label: 'Win profile', value: metrics.winSummary || '—' },
      { id: 'bracket', label: 'Commander bracket', value: metrics.bracketLabel || '—' },
      { id: 'bracket-hint', label: 'Bracket hint', value: formatBreakdownValue(metrics.bracketHint) },
      { id: 'game-changers', label: 'Game Changers', value: metrics.gameChangerCount },
      { id: 'combos', label: 'Detected combos', value: metrics.combos?.length || 0 },
      { id: 'combo-critical', label: 'Combo-critical pairs', value: metrics.comboCriticalPairs?.length || 0 },
      { id: 'combo-critical-triples', label: 'Combo-critical triples', value: metrics.comboCriticalTriples?.length || 0 },
      { id: 'interaction-proofs', label: 'Proof packages', value: interactionProofs.value.length },
    )
  } else if (section.id === 'cohesion') {
    rows.push(
      { id: 'nonland', label: 'Nonland cards', value: metrics.nonlandCount },
      { id: 'interactive', label: 'Interactive cards', value: metrics.interactiveCount },
      { id: 'pct-interactive', label: 'Any interaction', value: `${metrics.pctInteractive}%` },
      { id: 'pct-meaningful', label: 'Meaningfully linked', value: `${metrics.pctMeaningful}%` },
      { id: 'core-web', label: 'Core web share', value: `${metrics.meaningfulWebShare}%` },
      { id: 'largest-web', label: 'Largest web', value: `${metrics.largestWeb} (${metrics.largestWebShare}%)` },
      { id: 'edges', label: 'Interaction edges', value: metrics.edgeCount },
      { id: 'density', label: 'Density', value: formatBreakdownValue(metrics.density) },
      { id: 'avg-degree', label: 'Avg interactions', value: metrics.avgDegree },
      { id: 'weighted-degree', label: 'Weighted avg interactions', value: metrics.weightedAvgDegree },
      { id: 'islands', label: 'Islands', value: metrics.islandCount },
      { id: 'components', label: 'Interactive components', value: metrics.interactiveComponents },
    )
  } else if (section.id === 'self-sufficiency') {
    rows.push(
      { id: 'nonland', label: 'Nonland cards', value: metrics.nonlandCount },
      ...Object.entries(metrics.selfSufficiencySignals || {}).map(([id, value]) => ({
        id,
        label: titleCase(id),
        value: formatBreakdownValue(value),
      })),
    )
  }
  return rows
}

function breakdownTabs(section: ScoreSection, metrics: MetricItem[], lists: BreakdownList[]): BreakdownTab[] {
  const ingredients: BreakdownTab = {
    id: 'score-ingredients',
    title: `${section.label} score factors`,
    description: scoreIngredientsDescription(section.id),
    count: metrics.length,
    countLabel: `${metrics.length} metrics`,
    group: 'score',
    rows: metrics.map(metric => ({
      id: metric.id,
      label: metric.label,
      value: metric.value,
      note: metric.title,
    })),
  }
  return [ingredients, ...lists.map(list => ({ ...list, count: list.rows.length, countLabel: countLabelForBreakdown(list), group: 'graph' as const }))]
}

function scoreIngredientsDescription(sectionId: string): string {
  if (sectionId === 'win') return 'The headline score combines bracket hint, win profile, Game Changers, detected combos, and the win-tuning signal bars above.'
  if (sectionId === 'cohesion') return 'The headline score divides the deck into interaction density, core web share, meaningful links, average degree, components, and isolated cards.'
  if (sectionId === 'self-sufficiency') return 'The headline score divides standalone card quality into answer density, card advantage, ramp, tutors, resilience, premium staples, and premium share.'
  return 'The headline score is divided into the ingredients below.'
}

function countLabelForBreakdown(list: BreakdownList): string {
  const units: Record<string, string> = {
    'family-counts': 'families',
    'event-counts': 'events',
    'connected-cards': 'cards',
    islands: 'cards',
    signals: 'cards',
    'game-changers': 'cards',
    combos: 'combos',
    'combo-critical-pairs': 'pairs',
    'combo-critical-triples': 'triples',
    'interaction-proofs': 'proofs',
    'top-self-sufficient': 'cards',
    'standalone-signals': 'signals',
  }
  return `${list.rows.length} ${units[list.id] || 'items'}`
}

function withSignalTitle(signal: SignalBar, sectionId: string): SignalBar {
  if (signal.title) return signal
  if (sectionId === 'win') {
    const descriptions: Record<string, string> = {
      speed: 'Fast mana, ramp, and low setup cost that let the deck act before opponents stabilize.',
      consistency: 'Tutors and search effects that repeatedly find engines, answers, or finishers.',
      cardFlow: 'Draw, filtering, and repeatable card access that keeps the deck from running out of action.',
      interaction: 'Answers and disruption that prevent opposing wins or clear blockers.',
      closure: 'Finishers, payoffs, combos, and pressure that convert setup into a win.',
      resilience: 'Protection, recursion, and recovery that keep the plan alive through disruption.',
      efficiency: 'Mana efficiency and cost reduction that improve action density per turn.',
      gameChangers: 'Commander bracket Game Changers present in the list.',
      legality: 'Deck-size and basic structural checks that keep the score grounded.',
    }
    return { ...signal, title: descriptions[signal.id] || 'Contributes to the win-tuning score.' }
  }
  if (sectionId === 'cohesion') {
    return { ...signal, title: `Counts ${signal.value} interaction edge${signal.value === 1 ? '' : 's'} in this mechanical family. Higher counts mean more cards participate in the same plan.` }
  }
  if (sectionId === 'self-sufficiency') {
    return { ...signal, title: `${signal.label} has a standalone card-power score of ${formatBreakdownValue(signal.value)} before synergy bonuses. Click it to inspect that card.` }
  }
  return signal
}

function breakdownLists(section: ScoreSection, metrics: DeckMetrics, graph: DeckGraph): BreakdownList[] {
  if (section.id === 'win') {
    return [
      {
        id: 'signals',
        title: 'Win-tuning signal cards',
        description: 'Cards that feed each win-tuning signal. The value on each row is the signal bucket that card contributed to.',
        rows: signalCardRows(section.signals || []),
      },
      {
        id: 'game-changers',
        title: 'Game Changers',
        description: 'Cards detected as Commander bracket Game Changers. These raise the deck pressure profile regardless of graph synergy.',
        rows: (metrics.gameChangers || []).map(card => ({ id: card, label: shortName(card), cards: [card] })),
      },
      {
        id: 'combos',
        title: 'Detected combos',
        description: 'Known compact combo packages detected in the deck. These increase closure and win-tuning confidence.',
        rows: (metrics.combos || []).map((combo, index) => ({ id: `combo-${index}`, label: combo.map(shortName).join(' + '), cards: combo })),
      },
      {
        id: 'combo-critical-pairs',
        title: 'Combo-critical pairs',
        description: 'Pairs whose interaction family is considered combo-critical by the graph model.',
        rows: (metrics.comboCriticalPairs || []).map(pair => ({ id: `${pair.a}-${pair.b}-${pair.family}`, label: `${shortName(pair.a)} ↔ ${shortName(pair.b)}`, value: labelEvent(graph, pair.family), cards: [pair.a, pair.b], family: pair.family })),
      },
      {
        id: 'combo-critical-triples',
        title: 'Combo-critical triples',
        description: 'Three-card packages assembled from multiple strong interaction families.',
        rows: (metrics.comboCriticalTriples || []).map((triple, index) => ({ id: `combo-triple-${index}-${triple.family}`, label: triple.cards.map(shortName).join(' + '), value: labelEvent(graph, triple.family), cards: triple.cards, family: triple.family })),
      },
      {
        id: 'interaction-proofs',
        title: 'Interaction proof packages',
        description: 'Bounded proof-search packages with cards, sequence, confidence, assumptions, and result.',
        rows: interactionProofs.value.map(proof => ({ id: proof.id, label: proofCardNames(proof), value: `${proof.cardCount}-card · ${proof.confidence}`, cards: proof.cards, family: proof.family, proofId: proof.id })),
      },
    ].filter(list => list.rows.length)
  }
  if (section.id === 'cohesion') {
    return [
      {
        id: 'family-counts',
        title: 'Interaction families',
        description: 'Counts of meaningful mechanical interaction families. Clicking the signal bars above highlights the corresponding family in the graph.',
        rows: interactionFamilySignals.value.map(signal => ({ id: signal.id, label: signal.label, value: signal.value, family: signal.id, cards: cardsForFamily(graph, signal.id) })),
      },
      {
        id: 'event-counts',
        title: 'Raw interaction events',
        description: 'Lower-level produced/reacted-to event counts used to build the interaction families.',
        rows: Object.entries(metrics.eventCounts || {})
          .sort((a, b) => Number(b[1]) - Number(a[1]) || labelEvent(graph, a[0]).localeCompare(labelEvent(graph, b[0])))
          .slice(0, 16)
          .map(([event, count]) => ({ id: event, label: labelEvent(graph, event), value: count, family: event, cards: cardsForFamily(graph, event) })),
      },
      {
        id: 'connected-cards',
        title: 'Most connected cards',
        description: 'Cards with the most direct interaction links. These are usually the structural hubs of the deck.',
        rows: (rankGroups.value.find(group => group.id === 'connected')?.rows || []).map(row => ({ id: row.id, label: row.label, value: row.value, cards: [row.id] })),
      },
      {
        id: 'islands',
        title: 'Unlinked cards',
        description: 'Nonland cards with zero graph links. More islands reduce cohesion because they do not participate in the interaction web.',
        rows: (rankGroups.value.find(group => group.id === 'islands')?.rows || (metrics.islands || []).map(card => ({ id: card, label: shortName(card), value: 0 }))).map(row => ({ id: row.id, label: row.label, value: row.value, cards: [row.id] })),
      },
    ].filter(list => list.rows.length)
  }
  if (section.id === 'self-sufficiency') {
    return [
      {
        id: 'top-self-sufficient',
        title: 'Highest rated self-sufficient cards',
        description: 'Cards with the strongest standalone power from the card-power model before synergy bonuses.',
        rows: selfSufficientSignals.value.map(signal => ({ id: signal.id, label: signal.label, value: signal.value, cards: signal.cards || [signal.id] })),
      },
      {
        id: 'standalone-signals',
        title: 'Standalone capability counts',
        description: 'Capability buckets that make the deck function even when synergy pieces are not assembled.',
        rows: Object.entries(metrics.selfSufficiencySignals || {}).map(([id, value]) => ({ id, label: titleCase(id), value: formatBreakdownValue(value) })),
      },
    ].filter(list => list.rows.length)
  }
  return []
}

function signalCardRows(signals: SignalBar[]): BreakdownListRow[] {
  return signals.flatMap(signal => (signal.cards || []).slice(0, 8).map(card => ({
    id: `${signal.id}-${card}`,
    label: shortName(card),
    value: signal.label,
    cards: [card],
    family: signal.selectableFamily,
  })))
}

function cardsForFamily(graph: DeckGraph, family: string): string[] {
  const cards = new Set<string>()
  for (const edge of graph.edges || []) {
    const matches = (edge.interactions || []).some(interaction => interaction.family === family) || edge.events?.includes(family)
    if (matches) {
      cards.add(edge.source)
      cards.add(edge.target)
    }
  }
  return [...cards].filter(id => cardNodes.value.some(node => node.id === id))
}

function categoryCards(category: BreakdownTab) {
  const ids = new Set<string>()
  for (const row of category.rows) for (const card of row.cards || []) ids.add(card)
  return [...ids]
    .map(id => cardNodes.value.find(node => node.id === id))
    .filter((node): node is GraphNode => !!node)
    .map(node => ({ id: node.id, label: shortName(node.id), role: ROLE_LABELS[node.role] || node.role, degree: node.degree || 0, text: node.text }))
}

function firstCategoryFamily(category: BreakdownTab): string | undefined {
  return category.rows.find(row => row.family)?.family
}

function titleCase(value: string) {
  return value.replace(/([A-Z])/g, ' $1').replace(/[-_]/g, ' ').replace(/\b\w/g, char => char.toUpperCase()).trim()
}

function formatBreakdownValue(value: unknown): string | number {
  if (typeof value === 'number') return Number.isInteger(value) ? value : Number(value.toFixed(2))
  if (typeof value === 'string') return value
  if (value == null) return '—'
  return String(value)
}
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <nav class="app-nav" aria-label="Primary">
        <button class="app-nav__item" :class="{ active: currentPage === 'visualization' }" type="button" @click="currentPage = 'visualization'">Deck visualisation</button>
        <button class="app-nav__item" :class="{ active: currentPage === 'breakdown' }" type="button" @click="currentPage = 'breakdown'">Deck breakdown</button>
      </nav>
    </header>

    <div v-if="currentPage === 'visualization'" class="app">
      <SidebarShell :title="activeDeck?.title || 'Deck Interaction Map'" subtitle="Edges = real mechanical interactions. Hover a card to trace its web · click for detail.">
        <DeckTabs :tabs="deckTabs" :active-id="String(activeIndex)" @select-tab="selectDeck" @close-tab="closeDeck">
          <template #after="{ nextIndex }">
            <div class="deck-tabs-add" role="listitem">
              <span class="deck-tabs-add__index">{{ nextIndex }}</span>
              <div class="deck-tabs-add__body">
                <ImportControls :loading="deckImport.loading.value" :progress="deckImport.progress.value" :error="deckImport.error.value" @import="importDeck" />
              </div>
            </div>
          </template>
        </DeckTabs>
        <DeckList :nodes="cardNodes" :selected-id="selectedNodeId" :role-labels="ROLE_LABELS" @select-card="selectCard" />
        <label class="search-box">
          <span>Search cards</span>
          <input v-model.trim="searchTerm" type="search" placeholder="Search cards…" />
        </label>
        <ScorePanel :sections="scoreSections" selectable-signals @signal-select="selectScoreSignal">
          <template #section="{ section }">
            <button class="btn score-breakdown-button" type="button" @click.stop="openScoreBreakdown(section)">Breakdown</button>
          </template>
        </ScorePanel>
        <DeckMetricsGuide :metrics="deckGuideMetrics" />
      </SidebarShell>

      <aside v-if="selectedBreakdownSection" class="breakdown-drawer" aria-label="Score breakdown drawer">
        <header class="breakdown-drawer__header">
          <div>
            <p>{{ selectedBreakdownSection.label }}</p>
            <h2>{{ selectedBreakdownSection.value }} <small>{{ selectedBreakdownSection.band }}</small></h2>
          </div>
          <button type="button" aria-label="Close score breakdown" @click="closeScoreBreakdown">×</button>
        </header>
        <p class="breakdown-drawer__summary">{{ selectedBreakdownSection.summary || selectedBreakdownSection.subtitle }}</p>

        <section v-if="selectedBreakdownSection.signals?.length" class="breakdown-drawer__section">
          <h3>Signals</h3>
          <p>Signals explain score contribution; categories below show observed deck counts. Click either to highlight the graph.</p>
          <SignalBarList :signals="selectedBreakdownSection.signals" selectable @select="selectBreakdownSignal" />
        </section>

        <section class="breakdown-drawer__section">
          <h3>Categories</h3>
          <p>Click a category to highlight matching graph cards and inspect its cards.</p>
          <div v-if="scoreModelCategories.length" class="breakdown-category-group">
            <h4>Score model</h4>
            <button
              v-for="category in scoreModelCategories"
              :key="category.id"
              class="breakdown-category"
              :class="{ active: activeBreakdownCategory?.id === category.id }"
              type="button"
              @click="selectBreakdownCategory(category)"
            >
              <span>{{ category.title }}</span>
              <b>{{ category.countLabel }}</b>
              <small v-if="category.description">{{ category.description }}</small>
            </button>
          </div>
          <div v-if="graphExploreCategories.length" class="breakdown-category-group">
            <h4>Explore graph</h4>
            <button
              v-for="category in graphExploreCategories"
              :key="category.id"
              class="breakdown-category"
              :class="{ active: activeBreakdownCategory?.id === category.id }"
              type="button"
              @click="selectBreakdownCategory(category)"
            >
              <span>{{ category.title }}</span>
              <b>{{ category.countLabel }}</b>
              <small v-if="category.description">{{ category.description }}</small>
            </button>
          </div>
        </section>

        <section v-if="activeBreakdownCategory" class="breakdown-drawer__section">
          <h3>{{ activeBreakdownCategory.title }}</h3>
          <ul class="breakdown-row-list">
            <li v-for="row in activeBreakdownCategory.rows" :key="row.id">
              <button type="button" @click="selectBreakdownRow(row)">
                <span>{{ row.label }}</span>
                <strong v-if="row.value != null">{{ row.value }}</strong>
                <small v-if="row.note">{{ row.note }}</small>
              </button>
            </li>
          </ul>
        </section>
      </aside>


      <main class="main" @dragenter.prevent="draggingDeck = true" @dragover.prevent="draggingDeck = true" @dragleave.prevent="draggingDeck = false" @drop.prevent="dropDeck">
        <div v-if="!bootstrapped || deckImport.loading.value" class="loading-state">
          <div class="spinner"></div>
          <div>{{ deckImport.progress.value?.label || 'Loading deck graph…' }}</div>
          <div v-if="deckImport.progress.value?.total" class="loading-state__count">{{ deckImport.progress.value.done || 0 }}/{{ deckImport.progress.value.total }}</div>
        </div>
        <div v-if="draggingDeck" class="drop-overlay"><div>Drop decklist to add it</div></div>
        <div class="topbar">
          <ToolbarButton label="Reset view" @click="resetView" />
          <ToolbarButton label="Re-layout" @click="relayout" />
          <ToolbarButton :label="frozen ? 'Unfreeze' : 'Freeze'" :active="frozen" @click="frozen = !frozen" />
          <ToolbarButton :label="`Gravity: ${layoutModeLabel}`" @click="cycleLayoutMode" />
          <ToolbarButton :label="`Hide isolated: ${hideIsolated ? 'on' : 'off'}`" :active="hideIsolated" @click="hideIsolated = !hideIsolated" />
          <ToolbarButton label="Compare" :active="showCompare" @click="showCompare = true" />
          <ToolbarButton :label="proofToolbarLabel" :active="showInteractionProofs" @click="toggleInteractionProofs" />
          <ToolbarButton label="Help" :active="showHelp" @click="showHelp = true" />
          <ToolbarButton label="Recommendations" :active="showRecommendations" @click="showRecommendations = !showRecommendations" />
        </div>

        <GraphCanvas
          ref="graphCanvasRef"
          :graph="activeGraph"
          :layout-mode="layoutMode"
          :hide-isolated="hideIsolated"
          :search-term="searchTerm"
          :selected-node-id="selectedNodeId"
          :selected-node-ids="highlightedNodeIds"
          :selected-family="selectedFamily"
          :frozen="frozen"
          :role-colors="ROLE_COLORS"
          :card-power="node => deckMetrics.cardPower(node) || 0"
          @node:hover="hoverCard"
          @node:select="node => { selectedFamily = null; selectedNodeId = node?.id || null }"
        />

        <div v-if="hoveredNodeId && activeNode && !selectedNodeId && hoverPosition" class="node-tip" :style="{ left: `${hoverPosition.x + 16}px`, top: `${hoverPosition.y + 16}px` }">
          <div class="node-tip__role" :style="{ color: ROLE_COLORS[activeNode.role] || '#888' }">{{ ROLE_LABELS[activeNode.role] || activeNode.role }}</div>
          <strong>{{ shortName(activeNode.id) }}</strong>
          <small>{{ activeNode.type }}</small>
          <p v-if="activeNodeEvents">{{ activeNodeEvents }}</p>
          <div class="family-chips">
            <span v-for="family in activeNodeFamilies.slice(0, 4)" :key="family.label" class="family-chip"> {{ family.label }} <b>×{{ family.count }}</b></span>
          </div>
        </div>

        <div class="hint">drag nodes · scroll to zoom · pan background · paste Moxfield URL + Enter to compare decks</div>

        <aside v-if="activeBreakdownCategory" class="category-card-drawer" aria-label="Breakdown category cards">
          <header>
            <div>
              <p>{{ selectedBreakdownSection?.label }}</p>
              <h2>{{ activeBreakdownCategory.title }} <small>{{ activeBreakdownCategory.count }}</small></h2>
            </div>
            <button type="button" aria-label="Close category cards" @click="selectedBreakdownCategoryId = null">×</button>
          </header>
          <p v-if="activeBreakdownCategory.description">{{ activeBreakdownCategory.description }}</p>
          <div v-if="activeBreakdownCards.length" class="category-card-drawer__cards">
            <button v-for="card in activeBreakdownCards" :key="card.id" type="button" @click="selectCard(card.id)">
              <strong>{{ card.label }}</strong>
              <span>{{ card.role }} · {{ card.degree }} links</span>
              <small v-if="card.text">{{ card.text }}</small>
            </button>
          </div>
          <p v-else class="category-card-drawer__empty">This category has counts but no direct card list.</p>
        </aside>

        <aside v-if="showInteractionProofs" class="proof-drawer" aria-label="Interaction proof packages">
          <header>
            <div>
              <p>Interaction proofs</p>
              <h2>Proof packages <small>{{ interactionProofs.length }}</small></h2>
            </div>
            <button type="button" aria-label="Close interaction proofs" @click="showInteractionProofs = false">×</button>
          </header>
          <p>Bounded proof search groups the exact cards, contribution roles, sequence, result, assumptions, confidence, and repeatability notes. Selecting a package highlights all pieces in the graph.</p>

          <div v-if="interactionProofs.length" class="proof-filters" aria-label="Proof filters">
            <button type="button" :class="{ active: !selectedProofFamily }" @click="selectProofFamily(null)">All families</button>
            <button v-for="family in proofFamilyFilters" :key="family.family" type="button" :class="{ active: selectedProofFamily === family.family }" @click="selectProofFamily(family.family)">
              {{ family.label }} <b>{{ family.count }}</b>
            </button>
            <button type="button" :class="{ active: !selectedProofCardCount }" @click="selectProofCardCount(null)">All sizes</button>
            <button v-for="filter in proofCardCountFilters" :key="filter.cardCount" type="button" :class="{ active: selectedProofCardCount === filter.cardCount }" @click="selectProofCardCount(filter.cardCount)">
              {{ filter.cardCount }} cards <b>{{ filter.count }}</b>
            </button>
            <button type="button" @click="resetProofFilters">Reset</button>
          </div>

          <p v-if="!interactionProofs.length" class="proof-drawer__empty">No bounded proof packages were found for this deck yet. Pair edges and score breakdowns are still available.</p>
          <p v-else-if="!filteredInteractionProofs.length" class="proof-drawer__empty">No proof packages match the current filters.</p>

          <article
            v-for="proof in filteredInteractionProofs"
            :key="proof.id"
            class="proof-card"
            :class="{ active: selectedProofPackageId === proof.id }"
          >
            <button type="button" class="proof-card__summary" @click="selectProofPackage(proof)">
              <span>{{ proof.familyTitle }}</span>
              <strong>{{ proofCardNames(proof) }}</strong>
              <small>{{ proof.cardCount }} cards · {{ proof.confidence }} confidence · {{ proof.strength }}</small>
            </button>
            <div class="proof-card__body">
              <p><b>Result:</b> {{ proof.result }}</p>
              <p v-if="proof.repeatability?.reason"><b>Repeatability:</b> {{ proof.repeatability.status || 'candidate' }} — {{ proof.repeatability.reason }}</p>
              <div v-if="proof.resourceDeltas.length" class="proof-card__chips">
                <span v-for="delta in proof.resourceDeltas" :key="`${proof.id}-${proofDeltaText(delta)}`">{{ proofDeltaText(delta) }}</span>
              </div>
              <h3>Contributions</h3>
              <ul>
                <li v-for="contribution in proof.contributions" :key="`${proof.id}-${contribution.card}`">
                  <button type="button" @click="selectCard(contribution.card)">
                    <strong>{{ shortName(contribution.card) }}</strong>
                    <span>{{ titleCase(contribution.role) }} · {{ proofContributionFacts(contribution) }}</span>
                  </button>
                </li>
              </ul>
              <h3>Sequence</h3>
              <ol>
                <li v-for="step in proof.sequence" :key="`${proof.id}-step-${step.index}`">{{ proofStepText(step) }}</li>
              </ol>
              <div v-if="proof.assumptions.length || proof.limitingClauses.length" class="proof-card__notes">
                <p v-if="proof.assumptions.length"><b>Assumptions:</b> {{ proof.assumptions.join('; ') }}</p>
                <p v-if="proof.limitingClauses.length"><b>Limits:</b> {{ proof.limitingClauses.join('; ') }}</p>
              </div>
            </div>
          </article>
        </aside>


        <div v-if="selectedNodeId && activeNode" class="detail-card" role="dialog" aria-label="Card detail">
          <button class="detail-card__close" type="button" aria-label="Close card detail" @click="selectedNodeId = null">×</button>
          <h2>{{ shortName(activeNode.id) }}</h2>
          <div class="detail-card__pills">
            <span v-for="pill in activeNodePills" :key="pill.label" :style="{ color: pill.color, backgroundColor: `${pill.color}22` }">{{ pill.label }}</span>
          </div>
          <p v-if="activeNodeEvents" class="detail-card__events">{{ activeNodeEvents }}</p>
          <p v-if="activeNode.text" class="detail-card__text">{{ activeNode.text }}</p>
          <section v-if="activeNodeFaceOverview" class="detail-card__faces" aria-label="Card faces">
            <h3>{{ activeNodeFaceOverview.label }} <small>{{ activeNodeFaceOverview.faces.length }} faces</small></h3>
            <p>Shown separately so front/back or alternate faces are visible instead of only merged graph text.</p>
            <article v-for="face in activeNodeFaceOverview.faces" :key="`${activeNode.id}-face-${face.index}`" class="detail-card__face">
              <header>
                <strong>{{ face.name }}</strong>
                <span v-if="face.manaCost">{{ face.manaCost }}</span>
              </header>
              <small v-if="face.typeLine">{{ face.typeLine }}</small>
              <p v-if="face.text">{{ face.text }}</p>
            </article>
          </section>
          <div v-if="activeNodeFamilies.length" class="detail-card__families">
            <span v-for="family in activeNodeFamilies" :key="family.label" class="family-chip">{{ family.label }} <b>×{{ family.count }}</b></span>
          </div>
          <div v-if="activeNodeLinks.length" class="detail-card__links">
            <h3>Interaction web</h3>
            <button v-for="link in activeNodeLinks" :key="`${link.card}-${link.family}`" type="button" @click="selectCard(link.card)">
              <span>{{ shortName(link.card) }}</span>
              <small>{{ link.family }}</small>
            </button>
          </div>
          <div v-if="activeNodeProofs.length" class="detail-card__proofs">
            <h3>Proof packages</h3>
            <button v-for="proof in activeNodeProofs" :key="proof.id" type="button" @click="showInteractionProofs = true; selectProofPackage(proof)">
              <span>{{ proof.familyTitle }}</span>
              <small>{{ proof.cards.length }} cards · {{ proof.confidence }}</small>
            </button>
          </div>
        </div>

        <ModalShell :open="showCompare" title="Compare decks" id="compare-decks" @close="showCompare = false">
          <table class="compare-table">
            <thead><tr><th>Deck</th><th>Cards</th><th>Interactions</th><th>Score</th></tr></thead>
            <tbody>
              <tr v-for="row in compareRows" :key="row.id" :class="{ active: row.active }">
                <td>{{ row.title }}</td>
                <td>{{ row.cards }}</td>
                <td>{{ row.interactions }}</td>
                <td>{{ row.score == null ? '—' : row.score }}</td>
              </tr>
            </tbody>
          </table>
          <table class="compare-table compare-table--metrics">
            <tbody>
              <template v-for="row in compareMetricRows" :key="row.id">
                <tr v-if="row.section" class="compare-table__section"><th :colspan="decks.length + 1">{{ row.section }}</th></tr>
                <tr>
                  <th>{{ row.label }}</th>
                  <td v-for="(value, index) in row.values" :key="`${row.id}-${index}`" :class="{ active: index === activeIndex }">{{ value }}</td>
                </tr>
              </template>
            </tbody>
          </table>
        </ModalShell>

        <ModalShell :open="showHelp" title="How to use the graph" id="graph-help" @close="showHelp = false">
          <div class="help-grid">
            <section><h3>Read the map</h3><p>Cards are dots. Lines are real mechanical interactions: one card produces an event another card reacts to. Hover a card to trace its web; click for detail.</p></section>
            <section><h3>Add & compare decks</h3><p>Paste a Moxfield URL, import a decklist file, or paste text. Use deck tabs to switch and Compare for side-by-side scores.</p></section>
            <section><h3>Layout controls</h3><p>Drag dots, scroll to zoom, pan the background, freeze physics, hide isolated cards, or cycle Gravity modes to reveal synergy and standalone power.</p></section>
            <section><h3>Recommendations</h3><p>Open Recommendations to rank candidate adds in a worker, then inspect top adds or the current decklist.</p></section>
          </div>
        </ModalShell>
      </main>
    </div>

    <main v-else class="breakdown-page">
      <section class="breakdown-card">
        <p class="breakdown-card__eyebrow">Deck breakdown</p>
        <h1>Deck breakdown</h1>
        <p>This page is reserved for a dedicated breakdown view. The current graph, scoring, comparison, import, and recommendations stay under Deck visualisation.</p>
      </section>
    </main>

    <RecommendationsDrawer
      :open="currentPage === 'visualization' && showRecommendations"
      :loading="recommendations.loading.value"
      :progress="recommendations.progress.value"
      :error="recommendations.error.value"
      :rows="recommendations.rows.value"
      :deck-cards="cardNodes"
      :candidates="candidates"
      :role-labels="ROLE_LABELS"
      v-model:mode="recommendations.mode.value"
      @close="showRecommendations = false"
      @select-card="selectCard"
    />
  </div>
</template>

<style scoped>
:global(*){box-sizing:border-box}:global(html),:global(body),:global(#app){height:100%;margin:0}:global(body){background:#0e0d12;color:#e8e4f0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;overflow:hidden}:global(:root){--bg:#0e0d12;--panel:#17151d;--panel2:#1f1c28;--line:#2c2838;--text:#e8e4f0;--dim:#9a93ac;--accent:#d9434f}.app-shell{display:flex;flex-direction:column;height:100vh;width:100vw}.app-header{align-items:center;background:rgba(14,13,18,.92);border-bottom:1px solid var(--line);display:flex;justify-content:center;min-height:52px;padding:8px 16px;z-index:10}.app-nav{background:var(--panel);border:1px solid var(--line);border-radius:999px;box-shadow:0 10px 30px rgba(0,0,0,.24);display:flex;gap:4px;padding:4px}.app-nav__item{background:transparent;border:0;border-radius:999px;color:var(--dim);cursor:pointer;font:inherit;font-size:13px;font-weight:700;padding:8px 15px}.app-nav__item:hover,.app-nav__item.active{background:var(--panel2);color:var(--text)}.app-nav__item.active{box-shadow:inset 0 0 0 1px rgba(217,67,79,.55);color:#fff}.app{display:flex;flex:1;min-height:0;width:100vw}.main{flex:1;min-width:0;position:relative}.breakdown-page{align-items:center;display:grid;flex:1;justify-content:center;padding:32px}.breakdown-card{background:var(--panel);border:1px solid var(--line);border-radius:18px;box-shadow:0 16px 48px rgba(0,0,0,.34);max-width:620px;padding:32px;text-align:center}.breakdown-card__eyebrow{color:var(--accent);font-size:12px;font-weight:800;letter-spacing:.08em;margin:0 0 8px;text-transform:uppercase}.breakdown-card h1{font-size:34px;margin:0 0 10px}.breakdown-card p:last-child{color:var(--dim);line-height:1.5;margin:0}.loading-state{align-items:center;background:rgba(8,7,11,.78);display:grid;gap:9px;inset:0;justify-content:center;place-content:center;position:absolute;text-align:center;z-index:7}.loading-state>div:not(.spinner){background:rgba(23,21,29,.95);border:1px solid var(--line);border-radius:10px;padding:8px 14px}.loading-state__count{color:var(--dim);font-size:12px}.spinner{animation:spin .8s linear infinite;border:3px solid #44394f;border-top-color:var(--accent);border-radius:50%;height:34px;margin:auto;width:34px}.drop-overlay{align-items:center;background:rgba(14,13,18,.78);border:2px dashed var(--accent);display:flex;inset:0;justify-content:center;position:absolute;z-index:9}.drop-overlay div{background:var(--panel);border:1px solid var(--line);border-radius:14px;font-size:18px;padding:20px 28px}.topbar{align-items:center;display:flex;flex-wrap:wrap;gap:8px;left:14px;max-width:68%;position:absolute;top:14px;z-index:5}.hint{bottom:12px;color:var(--dim);font-size:11px;left:50%;pointer-events:none;position:absolute;transform:translateX(-50%);z-index:4}.search-box{border-top:1px solid var(--line);display:grid;gap:6px;font-size:11px;margin:8px -16px 0;padding:10px 16px;text-transform:uppercase;color:var(--dim)}.search-box input,:global(input),:global(select),:global(textarea){background:var(--panel2);border:1px solid var(--line);border-radius:8px;color:var(--text);font:inherit;font-size:12px;padding:7px 9px}.search-box input:focus,:global(input:focus),:global(select:focus),:global(textarea:focus){border-color:var(--accent);outline:none}.deck-tabs-add{background:rgba(255,255,255,.025);border:1px dashed var(--line);border-radius:10px;color:var(--text);display:grid;gap:8px;grid-template-columns:auto 1fr;padding:8px}.deck-tabs-add:hover{border-color:rgba(217,67,79,.55)}.deck-tabs-add__index{align-items:center;background:var(--panel2);border:1px solid var(--line);border-radius:999px;color:var(--dim);display:inline-flex;font-size:11px;font-weight:800;height:22px;justify-content:center;line-height:1;width:22px}.deck-tabs-add__body{display:grid;gap:7px;min-width:0}:global(.deck-tabs-add .import-controls){align-items:stretch;display:grid;gap:6px;grid-template-columns:1fr}:global(.deck-tabs-add .import-controls__url input),:global(.deck-tabs-add textarea){min-width:0;width:100%}:global(.deck-tabs-add .btn){justify-content:center;text-align:center;width:100%}.score-breakdown-button{font-size:11px;justify-content:center;margin-top:8px;width:100%}.breakdown-drawer{background:rgba(23,21,29,.97);border-right:1px solid var(--line);box-shadow:10px 0 30px rgba(0,0,0,.25);display:flex;flex-direction:column;gap:12px;max-width:380px;min-width:340px;overflow:auto;padding:14px;width:26vw;z-index:4}.breakdown-drawer__header{align-items:flex-start;display:flex;gap:10px;justify-content:space-between}.breakdown-drawer__header p{color:var(--dim);font-size:11px;font-weight:800;letter-spacing:.08em;margin:0;text-transform:uppercase}.breakdown-drawer__header h2{font-size:28px;line-height:1;margin:4px 0 0}.breakdown-drawer__header small{color:var(--dim);font-size:12px;letter-spacing:.08em;text-transform:uppercase}.breakdown-drawer__header button,.category-card-drawer header button{background:transparent;border:0;color:var(--dim);cursor:pointer;font-size:24px;line-height:1}.breakdown-drawer__header button:hover,.category-card-drawer header button:hover{color:var(--text)}.breakdown-drawer__summary,.breakdown-drawer__section>p,.category-card-drawer>p{color:var(--dim);font-size:12px;line-height:1.4;margin:0}.breakdown-drawer__section{background:rgba(255,255,255,.025);border:1px solid var(--line);border-radius:12px;padding:12px}.breakdown-drawer__section h3{font-size:12px;letter-spacing:.08em;margin:0 0 6px;text-transform:uppercase}.breakdown-drawer__definitions{border-top:1px solid var(--line);display:grid;gap:8px;margin:10px 0 0;padding-top:10px}.breakdown-drawer__definitions dt{color:var(--text);font-size:11px;font-weight:800;text-transform:uppercase}.breakdown-drawer__definitions dd{color:var(--dim);font-size:12px;line-height:1.35;margin:2px 0 0}.breakdown-category{background:rgba(255,255,255,.035);border:1px solid var(--line);border-radius:10px;color:var(--text);cursor:pointer;display:grid;font:inherit;gap:4px;grid-template-columns:minmax(0,1fr) auto;margin-top:7px;padding:9px;text-align:left;width:100%}.breakdown-category:hover,.breakdown-category.active{border-color:rgba(90,166,255,.45)}.breakdown-category b{background:rgba(90,166,255,.14);border-radius:999px;color:#9cc8ff;font-size:11px;padding:2px 7px}.breakdown-category small{color:var(--dim);font-size:11px;grid-column:1 / -1;line-height:1.35}.breakdown-row-list{display:grid;gap:6px;list-style:none;margin:8px 0 0;padding:0}.breakdown-row-list button{background:rgba(255,255,255,.035);border:1px solid transparent;border-radius:8px;color:var(--text);cursor:pointer;display:grid;font:inherit;font-size:12px;gap:2px 8px;grid-template-columns:minmax(0,1fr) auto;padding:7px 9px;text-align:left;width:100%}.breakdown-row-list button:hover{border-color:var(--accent)}.breakdown-row-list strong{color:#9cc8ff}.breakdown-row-list small{color:var(--dim);grid-column:1 / -1}.category-card-drawer{background:rgba(23,21,29,.96);border:1px solid var(--line);border-radius:14px;box-shadow:0 14px 48px rgba(0,0,0,.5);display:grid;gap:10px;max-height:calc(100vh - 96px);max-width:360px;overflow:auto;padding:14px;position:absolute;right:14px;top:64px;width:360px;z-index:6}.category-card-drawer header{align-items:flex-start;display:flex;gap:10px;justify-content:space-between}.category-card-drawer header p{color:var(--dim);font-size:11px;font-weight:800;letter-spacing:.08em;margin:0;text-transform:uppercase}.category-card-drawer h2{font-size:17px;line-height:1.2;margin:3px 0 0}.category-card-drawer h2 small{color:#9cc8ff;font-size:12px}.category-card-drawer__cards{display:grid;gap:7px}.category-card-drawer__cards button{background:rgba(255,255,255,.035);border:1px solid transparent;border-radius:9px;color:var(--text);cursor:pointer;display:grid;gap:3px;padding:9px;text-align:left}.category-card-drawer__cards button:hover{border-color:var(--accent)}.category-card-drawer__cards span,.category-card-drawer__cards small,.category-card-drawer__empty{color:var(--dim);font-size:11px;line-height:1.35}.score-breakdown{display:grid;gap:14px}.score-breakdown__hero{align-items:start;background:rgba(255,255,255,.035);border:1px solid var(--line);border-radius:14px;display:grid;gap:12px;grid-template-columns:auto 1fr;padding:14px}.score-breakdown__eyebrow{color:var(--dim);font-size:11px;font-weight:800;letter-spacing:.08em;margin:0;text-transform:uppercase}.score-breakdown__hero h3{font-size:42px;line-height:1;margin:4px 0 0}.score-breakdown__hero h3 small{color:var(--dim);font-size:13px;letter-spacing:.08em;text-transform:uppercase}.score-breakdown__hero p{color:#cfc8dc;line-height:1.45;margin:0}.score-breakdown__section{background:rgba(255,255,255,.025);border:1px solid var(--line);border-radius:12px;padding:12px}.score-breakdown__section h4{font-size:13px;margin:0 0 4px;text-transform:uppercase}.score-breakdown__section p{color:var(--dim);font-size:12px;margin:0}.score-breakdown__definitions{border-top:1px solid var(--line);display:grid;gap:8px;margin:10px 0 0;padding-top:10px}.score-breakdown__definitions div{display:grid;gap:2px}.score-breakdown__definitions dt{color:var(--text);font-size:11px;font-weight:800;text-transform:uppercase}.score-breakdown__definitions dd{color:var(--dim);font-size:12px;line-height:1.35;margin:0}.score-breakdown__tabs{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}.score-breakdown__tab{align-items:center;background:rgba(255,255,255,.035);border:1px solid var(--line);border-radius:999px;color:var(--dim);cursor:pointer;display:inline-flex;font:inherit;font-size:12px;font-weight:800;gap:7px;padding:6px 10px}.score-breakdown__tab[aria-selected=true]{background:rgba(90,166,255,.13);border-color:rgba(90,166,255,.35);color:var(--text)}.score-breakdown__tab b{background:rgba(255,255,255,.1);border-radius:999px;color:#9cc8ff;font-size:11px;line-height:1;padding:3px 6px}.score-breakdown__tabpanel{margin-top:10px}.score-breakdown__list{display:grid;gap:6px;list-style:none;margin:10px 0 0;padding:0}.score-breakdown__list li{align-items:center;background:rgba(255,255,255,.035);border-radius:8px;display:grid;gap:2px 8px;grid-template-columns:minmax(0,1fr) auto;padding:7px 9px}.score-breakdown__list strong{color:#9cc8ff;font-size:12px;text-align:right}.score-breakdown__list small{color:var(--dim);font-size:11px;grid-column:1 / -1}.node-tip{background:rgba(23,21,29,.96);border:1px solid var(--line);border-radius:10px;box-shadow:0 12px 40px rgba(0,0,0,.45);max-width:320px;padding:10px 12px;pointer-events:none;position:absolute;z-index:8}.node-tip__role{font-size:9px;font-weight:700;text-transform:uppercase}.node-tip strong{display:block;font-size:13px;margin-top:2px}.node-tip small{color:var(--dim);display:block;font-size:11px}.node-tip p{color:#cfc8dc;font-size:11px;line-height:1.35;margin:7px 0 0;white-space:pre-line}.detail-card{background:rgba(23,21,29,.95);border:1px solid var(--line);border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.5);max-height:calc(100vh - 96px);max-width:430px;overflow:auto;padding:14px;position:absolute;right:14px;top:64px;z-index:6}.detail-card__close{background:transparent;border:0;color:var(--dim);cursor:pointer;float:right;font-size:20px}.detail-card h2{font-size:16px;margin:0 24px 8px 0}.detail-card__pills,.detail-card__families,.family-chips{display:flex;flex-wrap:wrap;gap:6px}.detail-card__pills span,.family-chip{border-radius:999px;font-size:10px;padding:2px 7px}.family-chip{background:rgba(90,166,255,.14);color:#9cc8ff}.detail-card__events{color:#cfc8dc;font-size:11px;line-height:1.35;margin:8px 0;white-space:pre-line}.detail-card__text{font-size:12px;line-height:1.4;margin:8px 0;max-height:150px;overflow:auto}.detail-card__links{border-top:1px solid var(--line);display:grid;gap:5px;margin-top:10px;padding-top:8px}.detail-card__links h3{color:var(--dim);font-size:11px;letter-spacing:.04em;margin:0;text-transform:uppercase}.detail-card__links button{align-items:center;background:rgba(255,255,255,.04);border:1px solid transparent;border-radius:7px;color:var(--text);cursor:pointer;display:flex;justify-content:space-between;padding:6px 8px;text-align:left}.detail-card__links button:hover{border-color:var(--accent)}.detail-card__links small{color:var(--dim);margin-left:8px}.compare-table{border-collapse:collapse;margin-top:12px;width:100%}.compare-table th,.compare-table td{border-top:1px solid var(--line);padding:8px;text-align:left;vertical-align:top}.compare-table th{color:var(--dim);font-size:11px;text-transform:uppercase}.compare-table td{font-variant-numeric:tabular-nums}.compare-table td.active,.compare-table tr.active td{color:#f0c040}.compare-table__section th{background:var(--panel2);color:var(--text);letter-spacing:.04em}.help-grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}.help-grid section{background:rgba(255,255,255,.035);border:1px solid var(--line);border-radius:12px;padding:12px}.help-grid h3{margin:0 0 6px}.help-grid p{color:#cfc8dc;font-size:13px;line-height:1.45;margin:0}.btn,:global(.btn){align-items:center;background:linear-gradient(180deg,var(--panel2),var(--panel));border:1px solid var(--line);border-radius:8px;color:var(--text);cursor:pointer;display:inline-flex;font-size:12px;font-weight:700;gap:6px;padding:7px 12px;text-decoration:none}.btn:hover,.btn.active,:global(.btn:hover),:global(.btn.active){border-color:var(--accent);box-shadow:0 0 0 1px rgba(217,67,79,.22)}.btn:disabled,:global(.btn:disabled){cursor:not-allowed;opacity:.55}@keyframes spin{to{transform:rotate(360deg)}}@media(max-width:860px){:global(body){overflow:auto;overscroll-behavior:none}.app-shell{height:auto;min-height:100dvh;width:100%;overflow-x:hidden}.app-header{justify-content:flex-start;min-height:50px;padding:7px 10px;position:sticky;top:0}.app-nav{max-width:100%;overflow:auto}.app-nav__item{white-space:nowrap}.app{display:flex;flex-direction:column;min-height:calc(100dvh - 50px);width:100%}.main{display:flex;flex:1;flex-direction:column;min-height:56dvh;overflow:hidden}.topbar{background:rgba(14,13,18,.86);border-bottom:1px solid var(--line);display:grid;gap:6px;grid-template-columns:repeat(2,minmax(0,1fr));left:auto;max-width:none;order:0;padding:8px;position:relative;top:auto;width:100%;z-index:6}.topbar :global(.toolbar-button){justify-content:center;min-height:36px;width:100%}:global(.graph-canvas-shell){flex:1;height:auto;min-height:360px;order:1}.hint{background:rgba(14,13,18,.78);bottom:6px;border-radius:999px;font-size:10px;max-width:calc(100% - 20px);overflow:hidden;padding:4px 8px;text-overflow:ellipsis;white-space:nowrap}.breakdown-drawer{border-bottom:1px solid var(--line);border-right:0;box-shadow:0 10px 30px rgba(0,0,0,.25);max-height:46dvh;max-width:none;min-width:0;width:100%}.category-card-drawer,.detail-card{border-radius:14px 14px 0 0;bottom:0;left:8px;max-height:48dvh;max-width:none;overflow:auto;position:fixed;right:8px;top:auto;width:auto}.node-tip{display:none}.compare-table{display:block;max-width:100%;overflow-x:auto;white-space:nowrap}.breakdown-page{min-height:calc(100dvh - 50px);padding:18px}.breakdown-card{padding:22px}.score-breakdown__hero{grid-template-columns:1fr}}
@media(max-width:520px){.app-nav{border-radius:14px;width:100%}.app-nav__item{flex:1;padding:8px 10px}.topbar{grid-template-columns:1fr}.deck-tabs-add{grid-template-columns:1fr}.deck-tabs-add__index{display:none}.search-box{margin-left:-12px;margin-right:-12px;padding-left:12px;padding-right:12px}.breakdown-drawer{max-height:52dvh;padding:10px}.breakdown-category{grid-template-columns:1fr}.breakdown-category b{justify-self:start}.category-card-drawer,.detail-card{left:0;right:0}.detail-card__links button{align-items:flex-start;display:grid;gap:2px}.detail-card__links small{margin-left:0}.help-grid{grid-template-columns:1fr}.drop-overlay div{font-size:15px;margin:12px;text-align:center}.breakdown-card h1{font-size:28px}}
.proof-drawer{background:rgba(17,15,23,.97);border:1px solid var(--line);border-radius:14px;box-shadow:0 14px 48px rgba(0,0,0,.52);display:grid;gap:10px;max-height:calc(100vh - 96px);max-width:430px;overflow:auto;padding:14px;position:absolute;right:14px;top:64px;width:430px;z-index:7}.proof-drawer header{align-items:flex-start;display:flex;gap:10px;justify-content:space-between}.proof-drawer header p{color:var(--dim);font-size:11px;font-weight:800;letter-spacing:.08em;margin:0;text-transform:uppercase}.proof-drawer h2{font-size:18px;line-height:1.2;margin:3px 0 0}.proof-drawer h2 small{color:#ffbf7a;font-size:12px}.proof-drawer header button{background:transparent;border:0;color:var(--dim);cursor:pointer;font-size:24px;line-height:1}.proof-drawer header button:hover{color:var(--text)}.proof-drawer>p,.proof-drawer__empty{color:var(--dim);font-size:12px;line-height:1.4;margin:0}.proof-filters{display:flex;flex-wrap:wrap;gap:6px}.proof-filters button{background:rgba(255,255,255,.035);border:1px solid var(--line);border-radius:999px;color:var(--dim);cursor:pointer;font:inherit;font-size:11px;font-weight:800;padding:5px 8px}.proof-filters button.active,.proof-filters button:hover{border-color:#ffbf7a;color:var(--text)}.proof-filters b{color:#ffbf7a}.proof-card{background:rgba(255,255,255,.025);border:1px solid var(--line);border-radius:12px;display:grid;overflow:hidden}.proof-card.active{border-color:#ffbf7a;box-shadow:0 0 0 1px rgba(255,191,122,.18)}.proof-card__summary{background:rgba(255,255,255,.035);border:0;color:var(--text);cursor:pointer;display:grid;font:inherit;gap:3px;padding:10px;text-align:left;width:100%}.proof-card__summary span{color:#ffbf7a;font-size:11px;font-weight:800;letter-spacing:.04em;text-transform:uppercase}.proof-card__summary strong{font-size:13px}.proof-card__summary small{color:var(--dim);font-size:11px}.proof-card__body{display:grid;gap:8px;padding:10px}.proof-card__body p{color:#cfc8dc;font-size:12px;line-height:1.35;margin:0}.proof-card__body h3{color:var(--dim);font-size:11px;letter-spacing:.06em;margin:4px 0 0;text-transform:uppercase}.proof-card__body ul,.proof-card__body ol{display:grid;gap:5px;margin:0;padding-left:18px}.proof-card__body li{color:#cfc8dc;font-size:12px;line-height:1.35}.proof-card__body li button{background:rgba(255,255,255,.035);border:1px solid transparent;border-radius:8px;color:var(--text);cursor:pointer;display:grid;font:inherit;gap:2px;padding:7px;text-align:left;width:100%}.proof-card__body li button:hover{border-color:var(--accent)}.proof-card__body li span{color:var(--dim);font-size:11px}.proof-card__chips{display:flex;flex-wrap:wrap;gap:5px}.proof-card__chips span{background:rgba(255,191,122,.13);border-radius:999px;color:#ffcf9b;font-size:10px;font-weight:800;padding:3px 7px}.proof-card__notes{border-top:1px solid var(--line);display:grid;gap:5px;padding-top:8px}.detail-card__proofs{border-top:1px solid var(--line);display:grid;gap:5px;margin-top:10px;padding-top:8px}.detail-card__proofs h3{color:var(--dim);font-size:11px;letter-spacing:.04em;margin:0;text-transform:uppercase}.detail-card__proofs button{align-items:center;background:rgba(255,255,255,.04);border:1px solid transparent;border-radius:7px;color:var(--text);cursor:pointer;display:flex;justify-content:space-between;padding:6px 8px;text-align:left}.detail-card__proofs button:hover{border-color:var(--accent)}.detail-card__proofs small{color:var(--dim);margin-left:8px}
@media(max-width:860px){.proof-drawer{border-radius:14px 14px 0 0;bottom:0;left:8px;max-height:60dvh;max-width:none;overflow:auto;position:fixed;right:8px;top:auto;width:auto}}
@media(max-width:520px){.proof-drawer{left:0;right:0}.detail-card__proofs button{align-items:flex-start;display:grid;gap:2px}.detail-card__proofs small{margin-left:0}}
.detail-card__faces{border-top:1px solid var(--line);display:grid;gap:7px;margin-top:10px;padding-top:8px}.detail-card__faces h3{align-items:center;color:var(--dim);display:flex;font-size:11px;gap:7px;justify-content:space-between;letter-spacing:.04em;margin:0;text-transform:uppercase}.detail-card__faces h3 small{background:rgba(90,166,255,.14);border-radius:999px;color:#9cc8ff;font-size:10px;letter-spacing:0;padding:2px 7px;text-transform:none}.detail-card__faces>p{color:var(--dim);font-size:11px;line-height:1.35;margin:0}.detail-card__face{background:rgba(255,255,255,.035);border:1px solid var(--line);border-radius:9px;display:grid;gap:4px;padding:8px}.detail-card__face header{align-items:flex-start;display:flex;gap:8px;justify-content:space-between}.detail-card__face strong{font-size:12px;line-height:1.25}.detail-card__face span{color:#f0c040;font-size:11px;white-space:nowrap}.detail-card__face small{color:var(--dim);font-size:11px;line-height:1.3}.detail-card__face p{color:#cfc8dc;font-size:11px;line-height:1.35;margin:0;white-space:pre-line}
</style>
