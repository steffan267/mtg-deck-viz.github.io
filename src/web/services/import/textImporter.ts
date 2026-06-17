import { err, ok } from '../../types/result'
import { parseDecklist } from './decklist'
import { resolveViaScryfall } from './scryfall'
import type { DeckImportContext, DeckImporter, DeckImportSource } from './types'

export class TextDeckImporter implements DeckImporter {
  readonly id = 'text'
  readonly label = 'Pasted decklist'

  canImport(source: DeckImportSource): boolean {
    return source.kind === 'text' && source.text.trim().length > 0
  }

  async import(source: DeckImportSource, context: DeckImportContext) {
    if (source.kind !== 'text') return err({ code: 'unsupported-source', message: 'Text importer only supports text sources' })

    const parsed = parseDecklist(source.text)
    if (!parsed.length) return err({ code: 'empty-deck', message: 'No cards found in decklist text' })

    const resolved = await resolveViaScryfall(parsed, context)
    if (!resolved.ok) return resolved

    try {
      context.observer?.onProgress?.({ phase: 'building', label: `Analysing ${source.title || 'deck'}` })
      const graph = await context.buildGraph(resolved.value.cards, (done, total) =>
        context.observer?.onProgress?.({ phase: 'building', label: 'Analysing cards', done, total }),
      )
      graph.missing = [...(graph.missing ?? []), ...resolved.value.missing]
      return ok({ title: source.title || 'Imported deck', graph, missing: resolved.value.missing, sourceId: this.id })
    } catch (cause) {
      return err({ code: 'build-failed', message: cause instanceof Error ? cause.message : 'Deck analysis failed', cause })
    }
  }
}
