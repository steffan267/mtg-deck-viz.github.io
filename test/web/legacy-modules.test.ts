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
