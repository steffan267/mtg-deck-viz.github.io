import { describe, expect, it } from 'vitest'
import { buildDeckPlanAnalysis } from '../../src/web/services/deckPlanAnalysis'
import type { DeckGraph, DeckMetrics, GraphNode } from '../../src/web/types'

function node(partial: Partial<GraphNode>): GraphNode {
  return {
    id: partial.id || 'Card',
    role: partial.role || 'utility',
    qty: partial.qty || 1,
    degree: partial.degree || 0,
    text: partial.text || '',
    type: partial.type || '',
    produces: partial.produces || {},
    consumes: partial.consumes || {},
    zones: partial.zones || [],
    caps: partial.caps || [],
    cmc: partial.cmc || 0,
    mana: partial.mana || '',
    ci: partial.ci || [],
    edh: null,
  } as GraphNode
}

function metrics(partial: Partial<DeckMetrics> = {}): DeckMetrics {
  return {
    nonlandCount: 5,
    interactiveCount: 4,
    islandCount: 1,
    islands: ['Off Theme Relic'],
    edgeCount: 2,
    avgDegree: 1,
    weightedAvgDegree: 2,
    satWeightedAvgDegree: 2,
    pctInteractive: 80,
    pctMeaningful: 80,
    density: 0.2,
    largestWeb: 4,
    largestWebShare: 80,
    meaningfulWeb: 4,
    meaningfulWebShare: 80,
    interactiveComponents: 1,
    eventCounts: {},
    combos: [],
    comboCriticalPairs: [],
    comboCriticalTriples: [],
    hasCombo: false,
    cohesionScore: 48,
    cohesionBand: 'Loosely connected',
    selfSufficiencyScore: 44,
    selfSufficiencyBand: 'Somewhat reliant',
    selfSufficiencySignals: { interaction: 1, cardAdvantage: 1, ramp: 1, tutors: 0, resilience: 0, premiumStaples: 0, premiumShare: 0 },
    winTuningScore: 54,
    winTuningBand: 'Casual',
    winTuningSignals: { closure: { score: 42, cards: ['Codie, Vociferous Codex'] } },
    winSummary: '',
    gameChangerCount: 0,
    gameChangers: [],
    commanderBracket: { bracket: 2, label: 'Casual' },
    bracketHint: 2,
    bracketLabel: 'Bracket 2',
    ...partial,
  }
}

describe('buildDeckPlanAnalysis', () => {
  it('turns proof packages and meaningful families into a deck plan breakdown', () => {
    const graph: DeckGraph = {
      nodes: [
        node({ id: 'Codie, Vociferous Codex', role: 'commander', degree: 2, caps: ['is-tap-free-cast-engine'] }),
        node({ id: 'Twiddle', role: 'utility', degree: 2, caps: ['is-cheap-instant-engine-untap-spell'] }),
        node({ id: 'Vitalize', role: 'utility', degree: 1, caps: ['is-cheap-instant-engine-untap-spell'] }),
        node({ id: 'Arcane Signet', role: 'ramp', degree: 1, produces: { mana: ['you'] }, caps: ['is-ramp'] }),
        node({ id: 'Impulse Draw', role: 'draw', degree: 0, produces: { draw: ['you'] } }),
        node({ id: 'Off Theme Relic', role: 'utility', degree: 0 }),
        node({ id: 'Island', role: 'land', degree: 0 }),
      ],
      edges: [
        {
          source: 'Twiddle',
          target: 'Codie, Vociferous Codex',
          interactions: [{ family: 'tap-free-cast→untap-engine', strength: 'strong', kind: 'enablement' }],
          events: ['enable:tap-free-cast→untap-engine'],
        },
        {
          source: 'Vitalize',
          target: 'Codie, Vociferous Codex',
          interactions: [{ family: 'tap-free-cast→untap-engine', strength: 'strong', kind: 'enablement' }],
          events: ['enable:tap-free-cast→untap-engine'],
        },
      ],
      eventLabels: { 'enable:tap-free-cast→untap-engine': 'tap/free-cast engine reset' },
      interactionProofs: [
        {
          schemaVersion: '1',
          id: 'proof:codie-twiddle',
          family: 'tap-free-cast→untap-engine',
          familyTitle: 'Tap/free-cast reset engine',
          cards: ['Codie, Vociferous Codex', 'Twiddle'],
          cardCount: 2,
          status: 'proved',
          confidence: 'medium',
          strength: 'strong',
          result: 'Value engine that can reset a tap/free-cast commander.',
          assumptions: [],
          limitingClauses: [],
          resourceDeltas: [],
          sequence: [],
          contributions: [],
          evidence: [],
          hyperedgeIds: [],
        },
      ],
    }

    const analysis = buildDeckPlanAnalysis(graph, metrics())

    expect(analysis?.primaryPlan).toBe('Tap/free-cast reset engine')
    expect(analysis?.primaryFamily).toBe('tap-free-cast→untap-engine')
    expect(analysis?.packages.map(pkg => pkg.kind)).toContain('proof')
    expect(analysis?.packages.map(pkg => pkg.kind)).toContain('family')
    expect(analysis?.coreEngine.map(card => card.id)).toEqual(expect.arrayContaining(['Codie, Vociferous Codex', 'Twiddle']))
    expect(analysis?.supportShell.map(card => card.id)).toEqual(expect.arrayContaining(['Arcane Signet', 'Impulse Draw']))
    expect(analysis?.offPlanCards.map(card => card.id)).toContain('Off Theme Relic')
    expect(analysis?.signals.find(signal => signal.id === 'plan-density')?.value).toBe(50)
    expect(analysis?.summary).toContain('off-plan')
  })

  it('falls back to score-axis language when no package is detected', () => {
    const analysis = buildDeckPlanAnalysis({
      nodes: [node({ id: 'Sol Ring', role: 'ramp', produces: { mana: ['you'] }, caps: ['is-ramp'] })],
      edges: [],
    }, metrics({ hasCombo: true, cohesionScore: 12, winTuningScore: 30 }))

    expect(analysis?.primaryPlan).toBe('Compact combo plan')
    expect(analysis?.label).toBe('Unclear plan')
    expect(analysis?.weakSpots.map(spot => spot.id)).toContain('engine-packages')
  })
})
