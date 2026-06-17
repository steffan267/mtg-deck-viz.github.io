import type { MetricsModule } from '../../types'
import type { InteractionModelModule } from './interactionModel'

function unwrapDefault(moduleValue: unknown): Record<string, unknown> {
  const value = moduleValue as Record<string, unknown> & { default?: unknown }
  return value.default && typeof value.default === 'object' ? value.default as Record<string, unknown> : value
}

export function normalizeInteractionModel(moduleValue: unknown): InteractionModelModule {
  const model = unwrapDefault(moduleValue)
  if (typeof model.classify !== 'function' || typeof model.interactionsBetween !== 'function') {
    throw new Error('Interaction model module is missing classify/interactionsBetween')
  }
  return model as unknown as InteractionModelModule
}

export function normalizeMetricsModule(moduleValue: unknown): MetricsModule {
  const metrics = unwrapDefault(moduleValue)
  if (typeof metrics.compute !== 'function' || typeof metrics.cardPower !== 'function') {
    throw new Error('Deck metrics module is missing compute/cardPower')
  }
  return metrics as unknown as MetricsModule
}
