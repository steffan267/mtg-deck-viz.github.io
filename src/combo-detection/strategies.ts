import type {
  ComboCandidate,
  ComboCardInput,
  ComboDetectionInput,
  ComboDetectionResult,
  ComboDetectionStrategy,
  ComboDetectionStrategyId,
  ComboProof,
  ComboResource,
} from './contracts'

type Feature = {
  id: string
  name: string
  text: string
  produces: ReadonlySet<ComboResource>
  consumes: ReadonlySet<ComboResource>
  manaProduced: number
  activationCost: number
  landUntapCount: number
  selfUntaps: boolean
  repeatableBlink: boolean
}

type Template = {
  family: string
  reason: string
  roles: readonly {
    name: string
    match: (feature: Feature) => boolean
  }[]
  prove: (features: readonly Feature[]) => ComboProof | null
}

const STRATEGY_IDS: readonly ComboDetectionStrategyId[] = [
  'brute-force-combinations',
  'rule-template-search',
  'graph-resource-search',
]

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
}

function normalizeText(value: unknown): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function stableCardId(card: ComboCardInput, index: number): string {
  return String(card.id || card.name || `card-${index + 1}`)
}

function sortedUnique<T extends string>(values: Iterable<T>): T[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b))
}

function manaSymbolValue(symbol: string): number {
  const normalized = symbol.toLowerCase()
  if (normalized === 't' || normalized === 'q') return 0
  if (/^\d+$/.test(normalized)) return Number(normalized)
  if (normalized === 'x') return Number.POSITIVE_INFINITY
  return 1
}

function manaGroupCost(group: string): number {
  return [...group.matchAll(/\{([^}]+)\}/g)]
    .map(match => manaSymbolValue(match[1]))
    .reduce((sum, value) => sum + value, 0)
}

function parseManaSymbolCost(text: string): number {
  const activationCosts = [...text.matchAll(/((?:\{[^}]+\}\s*(?:,\s*)?)*)\s*:\s*untap (?:this|it|target) (?:creature|permanent|artifact)/g)]
    .map(match => manaGroupCost(match[1]))
    .filter(value => Number.isFinite(value))
  if (activationCosts.length) return Math.min(...activationCosts)

  const explicitPayCosts = [...text.matchAll(/\bpay\s+((?:\{[^}]+\}\s*)+)[^.]{0,80}\buntap\b/g)]
    .map(match => manaGroupCost(match[1]))
    .filter(value => Number.isFinite(value))
  if (explicitPayCosts.length) return Math.min(...explicitPayCosts)

  const genericSymbols = [...text.matchAll(/\{(\d+)\}/g)].map(match => Number(match[1])).filter(Number.isFinite)
  return genericSymbols.length ? Math.min(...genericSymbols) : 0
}

function parseCount(text: string, pattern: RegExp, fallback = 1): number {
  const match = text.match(pattern)
  if (!match) return fallback
  const raw = match[1]
  return Number(raw) || NUMBER_WORDS[raw] || fallback
}

function manaProducedBy(text: string): number {
  const repeatedSymbols = text.match(/add(?:s)?\s+((?:\{[wubrgc0-9]+\})+)/i)
  if (repeatedSymbols) return Math.max(1, [...repeatedSymbols[1].matchAll(/\{/g)].length)
  const wordAmount = text.match(/add(?:s)?\s+(one|two|three|four|five|six|seven|\d+)\s+mana/)
  if (wordAmount) return Number(wordAmount[1]) || NUMBER_WORDS[wordAmount[1]] || 1
  return /\badd(?:s)?\b/.test(text) ? 1 : 0
}

function featuresForCards(cards: readonly ComboCardInput[]): Feature[] {
  return cards.map((card, index) => {
    const id = stableCardId(card, index)
    const text = normalizeText(`${card.typeLine || ''} ${card.oracleText || ''} ${card.manaCost || ''}`)
    const produces = new Set<ComboResource>()
    const consumes = new Set<ComboResource>()
    const manaProduced = manaProducedBy(text)
    const activationCost = parseManaSymbolCost(text)
    const landUntapCount = parseCount(text, /untap up to (one|two|three|four|five|six|seven|\d+) lands?/, /untap .* lands?/.test(text) ? 2 : 0)
    const selfUntaps = /untap (this|it|target) (creature|permanent|artifact)/.test(text)
    const repeatableBlink = /exile another target .* you control.*return .* battlefield/.test(text) && /\{\d+\}|:/.test(text)

    if (manaProduced > 0) produces.add('mana')
    if (selfUntaps || landUntapCount > 0) produces.add('untap')
    if (repeatableBlink || /exile target .* you control.*return .* battlefield/.test(text)) produces.add('blink')
    if (/you gain .* life|gain (one|two|three|four|five|six|seven|\d+|x) life|\blifelink\b/.test(text)) produces.add('lifegain')
    if (/opponent loses .* life|opponents lose .* life|deals? .* damage to (each )?opponent/.test(text)) produces.add('lifeloss')
    if (/deals? .* damage/.test(text)) produces.add('damage')
    if (/draw(s)? (a card|cards|that many|one|two|three|four|five|six|seven|\d+)/.test(text)) produces.add('draw')

    if (/\{\d+\}.*untap|pay \{\d+\}.*untap/.test(text) || selfUntaps) consumes.add('mana')
    if (/whenever you gain life|if you gained life/.test(text)) consumes.add('lifegain')
    if (/whenever an opponent loses life|whenever a player loses life/.test(text)) consumes.add('lifeloss')
    if (/whenever .* deals? damage|damage .* draw/.test(text)) consumes.add('damage')
    if (/whenever you draw|whenever a player draws/.test(text)) consumes.add('draw')
    if (/exile another target .* you control.*return .* battlefield/.test(text)) consumes.add('mana')

    return {
      id,
      name: card.name,
      text,
      produces,
      consumes,
      manaProduced,
      activationCost,
      landUntapCount,
      selfUntaps,
      repeatableBlink,
    }
  })
}

function candidateId(strategyId: ComboDetectionStrategyId, cardIds: readonly string[], family?: string): string {
  return [strategyId, family, ...cardIds].filter(Boolean).join('|')
}

function proof(family: string, cards: readonly Feature[], resources: readonly ComboResource[], explanation: string): ComboProof {
  const cardIds = cards.map(card => card.id).sort((a, b) => a.localeCompare(b))
  return {
    id: ['proof', family, ...cardIds].join('|'),
    family,
    cardIds,
    resources: sortedUnique(resources),
    explanation,
  }
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index])
}

function uniqueCandidates(candidates: readonly ComboCandidate[]): ComboCandidate[] {
  const byId = new Map<string, ComboCandidate>()
  for (const candidate of candidates) byId.set(candidate.id, candidate)
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id))
}

function uniqueProofs(proofs: readonly ComboProof[]): ComboProof[] {
  const byId = new Map<string, ComboProof>()
  for (const item of proofs) byId.set(item.id, item)
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id))
}

function combinations<T>(items: readonly T[], size: number): T[][] {
  if (size <= 0) return [[]]
  if (size > items.length) return []
  const result: T[][] = []
  const walk = (start: number, picked: T[]) => {
    if (picked.length === size) {
      result.push([...picked])
      return
    }
    for (let index = start; index <= items.length - (size - picked.length); index++) {
      picked.push(items[index])
      walk(index + 1, picked)
      picked.pop()
    }
  }
  walk(0, [])
  return result
}

const TEMPLATES: readonly Template[] = [
  {
    family: 'self-untap-mana-loop',
    reason: 'single permanent both produces mana and untaps itself below the produced amount',
    roles: [{ name: 'engine', match: card => card.manaProduced > 0 && card.selfUntaps }],
    prove: cards => {
      const engine = cards[0]
      return engine && engine.manaProduced > engine.activationCost
        ? proof('self-untap-mana-loop', cards, ['mana', 'untap'], 'mana produced exceeds the local untap cost')
        : null
    },
  },
  {
    family: 'blink-etb-land-untap-loop',
    reason: 'repeatable blink reuses an enter-the-battlefield land untap trigger',
    roles: [
      { name: 'blink', match: card => card.repeatableBlink },
      { name: 'untapper', match: card => card.landUntapCount > 0 },
    ],
    prove: cards => {
      const blink = cards.find(card => card.repeatableBlink)
      const untapper = cards.find(card => card.landUntapCount > 0)
      return blink && untapper && untapper.landUntapCount >= Math.max(1, blink.activationCost)
        ? proof('blink-etb-land-untap-loop', cards, ['blink', 'mana', 'untap'], 'land untaps can repay the repeatable blink activation')
        : null
    },
  },
  {
    family: 'lifegain-lifeloss-loop',
    reason: 'life gain and opponent life loss triggers feed each other',
    roles: [
      { name: 'gain-to-loss', match: card => card.consumes.has('lifegain') && card.produces.has('lifeloss') },
      { name: 'loss-to-gain', match: card => card.consumes.has('lifeloss') && card.produces.has('lifegain') },
    ],
    prove: cards => cards.some(card => card.consumes.has('lifegain') && card.produces.has('lifeloss'))
      && cards.some(card => card.consumes.has('lifeloss') && card.produces.has('lifegain'))
      ? proof('lifegain-lifeloss-loop', cards, ['lifegain', 'lifeloss'], 'life gain causes life loss, and life loss causes life gain')
      : null,
  },
  {
    family: 'draw-damage-feedback-loop',
    reason: 'draw triggers damage and damage triggers draw',
    roles: [
      { name: 'draw-to-damage', match: card => card.consumes.has('draw') && card.produces.has('damage') },
      { name: 'damage-to-draw', match: card => card.consumes.has('damage') && card.produces.has('draw') },
    ],
    prove: cards => cards.some(card => card.consumes.has('draw') && card.produces.has('damage'))
      && cards.some(card => card.consumes.has('damage') && card.produces.has('draw'))
      ? proof('draw-damage-feedback-loop', cards, ['damage', 'draw'], 'draw and damage triggers form a closed feedback cycle')
      : null,
  },
]

function proofsFor(features: readonly Feature[]): ComboProof[] {
  return uniqueProofs(TEMPLATES.map(template => template.prove(features)).filter((item): item is ComboProof => Boolean(item)))
}

function detectByBruteForce(input: ComboDetectionInput): ComboDetectionResult {
  const strategyId = 'brute-force-combinations'
  const features = featuresForCards(input.cards)
  const maxCards = Math.max(1, Math.min(input.maxCards || 3, 3, features.length))
  const candidates: ComboCandidate[] = []
  const proofs: ComboProof[] = []
  for (let size = 1; size <= maxCards; size++) {
    for (const group of combinations(features, size)) {
      const cardIds = group.map(card => card.id).sort((a, b) => a.localeCompare(b))
      candidates.push({ id: candidateId(strategyId, cardIds), strategyId, cardIds, reason: 'bounded exhaustive package' })
      proofs.push(...proofsFor(group))
    }
  }
  return { strategyId, candidates: uniqueCandidates(candidates), proofs: uniqueProofs(proofs) }
}

function expandRoles(roles: Template['roles'], features: readonly Feature[]): Feature[][] {
  const groups: Feature[][] = []
  const walk = (roleIndex: number, picked: Feature[]) => {
    if (roleIndex === roles.length) {
      const ids = picked.map(card => card.id).sort((a, b) => a.localeCompare(b))
      if (sameSet(ids, sortedUnique(ids))) groups.push([...picked])
      return
    }
    for (const feature of features) {
      if (picked.some(card => card.id === feature.id)) continue
      if (!roles[roleIndex].match(feature)) continue
      picked.push(feature)
      walk(roleIndex + 1, picked)
      picked.pop()
    }
  }
  walk(0, [])
  return groups
}

function detectByRuleTemplates(input: ComboDetectionInput): ComboDetectionResult {
  const strategyId = 'rule-template-search'
  const features = featuresForCards(input.cards)
  const candidates: ComboCandidate[] = []
  const proofs: ComboProof[] = []
  for (const template of TEMPLATES) {
    for (const group of expandRoles(template.roles, features)) {
      const cardIds = group.map(card => card.id).sort((a, b) => a.localeCompare(b))
      candidates.push({ id: candidateId(strategyId, cardIds, template.family), strategyId, cardIds, reason: template.reason })
      const item = template.prove(group)
      if (item) proofs.push(item)
    }
  }
  return { strategyId, candidates: uniqueCandidates(candidates), proofs: uniqueProofs(proofs) }
}

function detectByGraphResources(input: ComboDetectionInput): ComboDetectionResult {
  const strategyId = 'graph-resource-search'
  const features = featuresForCards(input.cards)
  const candidates: ComboCandidate[] = []
  const proofs: ComboProof[] = []
  for (const source of features) {
    for (const resource of source.produces) {
      for (const target of features) {
        if (source.id === target.id || !target.consumes.has(resource)) continue
        for (const returnResource of target.produces) {
          if (!source.consumes.has(returnResource)) continue
          const group = [source, target]
          const cardIds = group.map(card => card.id).sort((a, b) => a.localeCompare(b))
          candidates.push({ id: candidateId(strategyId, cardIds, `${resource}-${returnResource}`), strategyId, cardIds, reason: 'resource producer/consumer cycle' })
          proofs.push(...proofsFor(group))
        }
      }
    }
  }
  for (const feature of features) {
    if (feature.manaProduced > 0 && feature.selfUntaps) {
      const cardIds = [feature.id]
      candidates.push({ id: candidateId(strategyId, cardIds, 'self-resource-cycle'), strategyId, cardIds, reason: 'single-card resource cycle' })
      proofs.push(...proofsFor([feature]))
    }
  }
  return { strategyId, candidates: uniqueCandidates(candidates), proofs: uniqueProofs(proofs) }
}

export const comboDetectionStrategies: readonly ComboDetectionStrategy[] = [
  { id: STRATEGY_IDS[0], label: 'Brute-force combinations', detect: detectByBruteForce },
  { id: STRATEGY_IDS[1], label: 'Rule template search', detect: detectByRuleTemplates },
  { id: STRATEGY_IDS[2], label: 'Graph resource search', detect: detectByGraphResources },
]

export function detectCombosWithStrategy(strategyId: ComboDetectionStrategyId, input: ComboDetectionInput): ComboDetectionResult {
  const strategy = comboDetectionStrategies.find(item => item.id === strategyId)
  if (!strategy) throw new Error(`Unknown combo detection strategy: ${strategyId}`)
  return strategy.detect(input)
}
