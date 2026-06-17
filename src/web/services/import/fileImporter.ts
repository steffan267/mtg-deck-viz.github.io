import { err } from '../../types/result'
import { titleFromFileName } from './decklist'
import { TextDeckImporter } from './textImporter'
import type { DeckImportContext, DeckImporter, DeckImportSource } from './types'

export class FileDeckImporter implements DeckImporter {
  readonly id = 'file'
  readonly label = 'Decklist file'
  private readonly textImporter = new TextDeckImporter()

  canImport(source: DeckImportSource): boolean {
    return source.kind === 'file'
  }

  async import(source: DeckImportSource, context: DeckImportContext) {
    if (source.kind !== 'file') return err({ code: 'unsupported-source', message: 'File importer only supports file sources' })
    try {
      context.observer?.onProgress?.({ phase: 'reading', label: `Reading ${source.file.name}` })
      const text = await source.file.text()
      return this.textImporter.import({ kind: 'text', text, title: titleFromFileName(source.file.name) }, context)
    } catch (cause) {
      return err({ code: 'file-read-failed', message: cause instanceof Error ? cause.message : 'Could not read decklist file', cause })
    }
  }
}
