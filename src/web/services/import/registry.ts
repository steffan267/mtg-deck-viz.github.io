import { err } from '../../types/result'
import type { DeckImportContext, DeckImporter, DeckImportResult, DeckImportSource } from './types'

export class DeckImportRegistry {
  private readonly importers: DeckImporter[] = []

  register(importer: DeckImporter): this {
    if (!this.importers.some(existing => existing.id === importer.id)) {
      this.importers.push(importer)
    }
    return this
  }

  list(): readonly DeckImporter[] {
    return this.importers
  }

  find(source: DeckImportSource): DeckImporter | undefined {
    return this.importers.find(importer => importer.canImport(source))
  }

  async import(source: DeckImportSource, context: DeckImportContext): Promise<DeckImportResult> {
    const importer = this.find(source)
    if (!importer) {
      return err({ code: 'unsupported-source', message: `No importer registered for ${source.kind}` })
    }
    return importer.import(source, context)
  }
}

export function createDeckImportRegistry(importers: DeckImporter[] = []): DeckImportRegistry {
  const registry = new DeckImportRegistry()
  for (const importer of importers) registry.register(importer)
  return registry
}
