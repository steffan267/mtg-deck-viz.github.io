import { describe, expect, it } from 'vitest'
import { normalizeInteractionModel, normalizeMetricsModule } from '../../src/web/services/adapters/legacyModules'

describe('legacy module adapters', () => {
  it('unwraps Vite default-wrapped interaction model modules', () => {
    const api = {
      ZONES: [],
      EVENT_LABEL: {},
      classify: () => ({ role: 'utility', produces: {}, consumes: {}, zones: [], myTypes: [], tribalRefs: [], caps: [] }),
      interactionsBetween: () => [],
    }

    expect(normalizeInteractionModel({ default: api }).classify({ type_line: 'Artifact', oracle_text: '' }).role).toBe('utility')
  })

  it('unwraps Vite default-wrapped metrics modules', () => {
    const api = {
      compute: () => ({ winTuningScore: 0, cohesionScore: 0 }),
      cardPower: () => 0,
    }

    expect(normalizeMetricsModule({ default: api }).cardPower({} as never)).toBe(0)
  })
})

import appSource from '../../src/web/App.vue?raw'

describe('legacy module app wiring', () => {
  it('uses side-effect globals before Vite namespace imports for legacy browser modules', () => {
    expect(appSource).toContain('browserGlobals.INTERACTION_MODEL || INTERACTION_MODEL')
    expect(appSource).toContain('browserGlobals.DECK_METRICS || metricsNamespace')
  })
})
