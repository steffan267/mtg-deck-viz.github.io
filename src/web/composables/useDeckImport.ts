import { computed, ref } from 'vue'
import type { ImportedDeck } from '../types/deck'
import type { DeckImportContext, DeckImportObserver, DeckImportResult, DeckImportSource, ImportProgress } from '../services/import'
import { createDefaultDeckImportRegistry, type DeckImportRegistry } from '../services/import'

export interface UseDeckImportOptions extends Omit<DeckImportContext, 'observer'> {
  registry?: DeckImportRegistry
}

export function useDeckImport(options: UseDeckImportOptions) {
  const registry = options.registry ?? createDefaultDeckImportRegistry()
  const loading = ref(false)
  const progress = ref<ImportProgress | null>(null)
  const error = ref<string | null>(null)
  const lastImportedDeck = ref<ImportedDeck | null>(null)

  const observer: DeckImportObserver = {
    onProgress(nextProgress) {
      progress.value = nextProgress
    },
  }

  const canImport = (source: DeckImportSource) => registry.find(source) != null

  async function importDeck(source: DeckImportSource): Promise<DeckImportResult> {
    loading.value = true
    error.value = null
    progress.value = null
    const result = await registry.import(source, { ...options, observer })
    loading.value = false
    if (result.ok) {
      progress.value = { phase: 'done', label: `Added ${result.value.title}` }
      lastImportedDeck.value = result.value
    } else {
      error.value = result.error.message
    }
    return result
  }

  return {
    importers: computed(() => registry.list()),
    loading,
    progress,
    error,
    lastImportedDeck,
    canImport,
    importDeck,
  }
}
