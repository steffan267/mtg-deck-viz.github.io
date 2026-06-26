import type { DeckGraph, DeckMetrics, GraphEdge, GraphNode, InteractionProofPackage } from '../types'

export interface DeckPlanCardRef {
  id: string
  label: string
  role: string
  note?: string
  value?: number | string
}

export interface DeckPlanPackage {
  id: string
  label: string
  family: string
  cards: string[]
  strength: string
  kind: 'proof' | 'family'
  count: number
  summary: string
}

export interface DeckPlanSignal {
  id: string
  label: string
  value: number
  max: number
  tone: 'ok' | 'watch' | 'warn'
  summary: string
}

export interface DeckPlanAnalysis {
  score: number
  label: string
  summary: string
  primaryPlan: string
  primaryFamily: string | null
  planDensity: number
  engineCardCount: number
  supportCardCount: number
  offPlanCount: number
  packages: DeckPlanPackage[]
  coreEngine: DeckPlanCardRef[]
  supportShell: DeckPlanCardRef[]
  weakSpots: DeckPlanCardRef[]
  offPlanCards: DeckPlanCardRef[]
  signals: DeckPlanSignal[]
}

const FAMILY_LABELS: Record<string, string> = {
  'tap-free-cast→untap-engine': 'Tap/free-cast reset engine',
  'imprint-untap-spell-loop': 'Repeatable untap spell loop',
  'self-untap-mana-loop': 'Self-untap mana loop',
  'self-untap-mana→ability-copy-loop': 'Self-untap ability-copy loop',
  'lifegain-lifeloss-loop': 'Life gain/life loss loop',
  'draw-damage-feedback-loop': 'Draw/damage feedback loop',
  'aristocrats-body-outlet-payoff': 'Aristocrats engine',
  'token-source-modifier-payoff': 'Token amplifier engine',
  'death→drain': 'Death-drain engine',
  'death→draw': 'Death-draw engine',
  'death→tokens': 'Death-token engine',
  enchantress: 'Enchantress engine',
  magecraft: 'Magecraft spell engine',
  'go-wide→payoff': 'Go-wide payoff engine',
  'combat-enabler': 'Combat payoff engine',
  'land-recursion→landfall': 'Landfall recursion engine',
}

const SUPPORT_ROLES = new Set(['ramp', 'draw', 'tutor', 'removal', 'wipe', 'protection'])
const OFF_PLAN_ALLOWED_ROLES = new Set(['commander', 'land', ...SUPPORT_ROLES])
const MEANINGFUL_STRENGTH = new Set(['moderate', 'strong', 'combo-critical'])

export function buildDeckPlanAnalysis(graph: DeckGraph | null, metrics: DeckMetrics | null): DeckPlanAnalysis | null {
  if (!graph || !metrics) return null
  const cards = (graph.nodes || []).filter(node => node.role !== 'zone')
  const nonlands = cards.filter(node => node.role !== 'land')
  const proofPackages = graph.interactionProofs || []
  const familyPackages = interactionFamilyPackages(graph.edges || [], graph.eventLabels || {})
  const proofPlanPackages = proofPackages.map(proofPackage)
  const packages = [...proofPlanPackages, ...familyPackages]
    .sort((a, b) => packageRank(b) - packageRank(a) || b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 8)

  const engineIds = new Set<string>()
  for (const pkg of packages) for (const card of pkg.cards) engineIds.add(card)
  const coreEngine = [...engineIds]
    .map(id => cardRef(cardsById(cards).get(id), packageNote(id, packages)))
    .filter((ref): ref is DeckPlanCardRef => Boolean(ref))
    .sort((a, b) => Number(b.value || 0) - Number(a.value || 0) || a.label.localeCompare(b.label))
    .slice(0, 12)

  const supportShell = nonlands
    .filter(node => SUPPORT_ROLES.has(String(node.role)) || supportCap(node))
    .filter(node => !engineIds.has(node.id))
    .sort((a, b) => (b.degree || 0) - (a.degree || 0) || a.id.localeCompare(b.id))
    .slice(0, 12)
    .map(node => cardRef(node, supportNote(node)))
    .filter((ref): ref is DeckPlanCardRef => Boolean(ref))

  const offPlanCards = nonlands
    .filter(node => !engineIds.has(node.id))
    .filter(node => !OFF_PLAN_ALLOWED_ROLES.has(String(node.role)))
    .filter(node => (node.degree || 0) === 0)
    .slice(0, 12)
    .map(node => cardRef(node, 'No current graph links into the detected plan.'))
    .filter((ref): ref is DeckPlanCardRef => Boolean(ref))

  const primaryPackage = packages[0] || null
  const primaryPlan = primaryPackage ? primaryPackage.label : fallbackPlan(metrics)
  const primaryFamily = primaryPackage?.family || null
  const planDensity = nonlands.length ? Math.round((engineIds.size / nonlands.length) * 100) : 0
  const offPlanShare = nonlands.length ? Math.round((offPlanCards.length / nonlands.length) * 100) : 0
  const score = Math.round(
    0.36 * metrics.cohesionScore +
    0.24 * metrics.winTuningScore +
    0.20 * planDensity +
    0.12 * Math.min(100, packages.length * 12) +
    0.08 * Math.max(0, 100 - offPlanShare * 3),
  )
  const weakSpots = buildWeakSpots(metrics, nonlands.length, packages.length, planDensity, offPlanCards.length)
  const signals = [
    signal('plan-density', 'Plan density', planDensity, 'Share of nonland cards participating in detected engines and meaningful packages.'),
    signal('engine-packages', 'Engine packages', Math.min(100, packages.length * 12), 'Detected proof packages and meaningful interaction families.'),
    signal('cohesion', 'Cohesion', metrics.cohesionScore, 'Graph cohesion from meaningful links and core-web share.'),
    signal('closure', 'Closure', signalScore(metrics, 'closure'), 'Win-tuning closure signal: finishers, combos, and ways to actually end the game.'),
    signal('off-plan', 'Off-plan control', Math.max(0, 100 - offPlanShare * 3), 'Penalty guard for unlinked non-support cards.'),
  ]

  return {
    score,
    label: score >= 75 ? 'Focused plan' : score >= 55 ? 'Visible plan' : score >= 35 ? 'Loose plan' : 'Unclear plan',
    summary: summarize(primaryPlan, score, packages.length, offPlanCards.length),
    primaryPlan,
    primaryFamily,
    planDensity,
    engineCardCount: engineIds.size,
    supportCardCount: supportShell.length,
    offPlanCount: offPlanCards.length,
    packages,
    coreEngine,
    supportShell,
    weakSpots,
    offPlanCards,
    signals,
  }
}

function interactionFamilyPackages(edges: readonly GraphEdge[], labels: Record<string, string>): DeckPlanPackage[] {
  const byFamily = new Map<string, { cards: Set<string>; count: number; strength: string }>()
  for (const edge of edges) {
    for (const interaction of edge.interactions || []) {
      if (!MEANINGFUL_STRENGTH.has(interaction.strength)) continue
      const entry = byFamily.get(interaction.family) || { cards: new Set<string>(), count: 0, strength: interaction.strength }
      entry.cards.add(edge.source)
      entry.cards.add(edge.target)
      entry.count += 1
      entry.strength = stronger(entry.strength, interaction.strength)
      byFamily.set(interaction.family, entry)
    }
  }
  return [...byFamily.entries()].map(([family, entry]) => ({
    id: `family:${family}`,
    label: familyLabel(family, labels),
    family,
    cards: [...entry.cards],
    strength: entry.strength,
    kind: 'family' as const,
    count: entry.count,
    summary: `${entry.count} meaningful link${entry.count === 1 ? '' : 's'} across ${entry.cards.size} card${entry.cards.size === 1 ? '' : 's'}.`,
  }))
}

function proofPackage(pkg: InteractionProofPackage): DeckPlanPackage {
  return {
    id: pkg.id,
    label: pkg.familyTitle || familyLabel(pkg.family, {}),
    family: pkg.family,
    cards: pkg.cards || [],
    strength: pkg.strength || 'strong',
    kind: 'proof',
    count: pkg.cards?.length || 0,
    summary: pkg.result || pkg.repeatability?.reason || `${pkg.cardCount}-card package`,
  }
}

function packageRank(pkg: DeckPlanPackage): number {
  const strength = pkg.strength === 'combo-critical' ? 5 : pkg.strength === 'strong' ? 4 : pkg.strength === 'moderate' ? 3 : 1
  return strength + (pkg.kind === 'proof' ? 1 : 0)
}

function stronger(left: string, right: string): string {
  return packageRank({ id: '', label: '', family: '', cards: [], strength: right, kind: 'family', count: 0, summary: '' })
    > packageRank({ id: '', label: '', family: '', cards: [], strength: left, kind: 'family', count: 0, summary: '' }) ? right : left
}

function cardsById(cards: readonly GraphNode[]): Map<string, GraphNode> {
  return new Map(cards.map(card => [card.id, card]))
}

function cardRef(node: GraphNode | undefined, note?: string): DeckPlanCardRef | null {
  if (!node) return null
  return { id: node.id, label: shortName(node.id), role: String(node.role), note, value: node.degree || 0 }
}

function packageNote(id: string, packages: readonly DeckPlanPackage[]): string {
  const found = packages.find(pkg => pkg.cards.includes(id))
  return found ? found.label : 'Core engine card.'
}

function supportNote(node: GraphNode): string {
  if (String(node.role) === 'ramp' || hasCap(node, 'is-ramp')) return 'Mana or acceleration support.'
  if (String(node.role) === 'draw' || produced(node, 'draw')) return 'Card flow or refill support.'
  if (String(node.role) === 'tutor') return 'Access and consistency support.'
  if (String(node.role) === 'protection') return 'Protects the plan or key pieces.'
  if (String(node.role) === 'removal' || String(node.role) === 'wipe') return 'Interaction shell.'
  return 'Functional support card.'
}

function supportCap(node: GraphNode): boolean {
  return hasCap(node, 'is-ramp') || produced(node, 'draw') || produced(node, 'destroy') || produced(node, 'exile')
}

function hasCap(node: GraphNode, cap: string): boolean {
  return (node.caps || []).includes(cap)
}

function produced(node: GraphNode, event: string): boolean {
  return Object.prototype.hasOwnProperty.call(node.produces || {}, event)
}

function familyLabel(family: string, labels: Record<string, string>): string {
  return FAMILY_LABELS[family] || labels[`enable:${family}`] || labels[family] || titleCase(family)
}

function fallbackPlan(metrics: DeckMetrics): string {
  if (metrics.hasCombo) return 'Compact combo plan'
  if (metrics.cohesionScore >= metrics.selfSufficiencyScore) return 'Synergy engine plan'
  if (metrics.selfSufficiencyScore >= 60) return 'Self-sufficient good-stuff plan'
  return 'Value and interaction plan'
}

function buildWeakSpots(metrics: DeckMetrics, nonlandCount: number, packageCount: number, planDensity: number, offPlanCount: number): DeckPlanCardRef[] {
  const weakSpots: DeckPlanCardRef[] = []
  if (planDensity < 25) weakSpots.push({ id: 'plan-density', label: 'Low plan density', role: 'signal', note: 'Few nonland cards are part of detected engines.', value: `${planDensity}%` })
  if (packageCount === 0) weakSpots.push({ id: 'engine-packages', label: 'No engine packages', role: 'signal', note: 'No proof package or meaningful family is currently driving the plan.', value: 0 })
  if (metrics.winTuningScore < 42) weakSpots.push({ id: 'win-tuning', label: 'Low win tuning', role: 'signal', note: 'The deck has limited speed, access, closure, or resilience.', value: metrics.winTuningScore })
  if (signalScore(metrics, 'closure') < 35) weakSpots.push({ id: 'closure', label: 'Thin closure', role: 'signal', note: 'The deck may assemble value without a clear finish.', value: signalScore(metrics, 'closure') })
  if (offPlanCount > Math.max(4, nonlandCount * 0.12)) weakSpots.push({ id: 'off-plan', label: 'Many off-plan cards', role: 'signal', note: 'Several non-support nonlands have no current graph links.', value: offPlanCount })
  return weakSpots.slice(0, 5)
}

function signal(id: string, label: string, value: number, summary: string): DeckPlanSignal {
  return { id, label, value, max: 100, summary, tone: value >= 70 ? 'ok' : value >= 40 ? 'watch' : 'warn' }
}

function signalScore(metrics: DeckMetrics, key: string): number {
  return metrics.winTuningSignals?.[key]?.score || 0
}

function summarize(primaryPlan: string, score: number, packageCount: number, offPlanCount: number): string {
  const plan = `${primaryPlan} is the clearest detected plan.`
  const quality = score >= 75 ? 'The supporting cards point in the same direction.'
    : score >= 55 ? 'The deck has a visible plan with some loose edges.'
      : score >= 35 ? 'The plan exists, but the shell still has a lot of drift.'
        : 'The current graph sees more isolated cards than plan structure.'
  const packages = packageCount ? `${packageCount} engine signal${packageCount === 1 ? '' : 's'} found.` : 'No engine packages found yet.'
  const islands = offPlanCount ? `${offPlanCount} off-plan card${offPlanCount === 1 ? '' : 's'} need review.` : 'No major off-plan cluster detected.'
  return `${plan} ${quality} ${packages} ${islands}`
}

function titleCase(value: string): string {
  return value.replace(/[→_-]/g, ' ').replace(/\b\w/g, char => char.toUpperCase()).trim()
}

function shortName(value: string): string {
  return value.length > 34 ? `${value.slice(0, 31)}...` : value
}
