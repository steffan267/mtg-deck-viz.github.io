import type { BuildGraphFn, ImportedDeck, ParsedDeckCard, ResolvedDeckCard } from './graph'
import type { Result } from './result'

export type DeckImportSource =
  | { kind: 'file'; file: File }
  | { kind: 'text'; text: string; title?: string }
  | { kind: 'url'; url: string }

export type ImportProgressPhase = 'reading' | 'resolving' | 'fetching' | 'building' | 'done'

export interface ImportProgress {
  phase: ImportProgressPhase
  label: string
  done?: number
  total?: number
}

export interface DeckImportObserver {
  onProgress?(progress: ImportProgress): void
}

export interface DeckImportContext {
  buildGraph: BuildGraphFn
  fetch?: typeof fetch
  moxfieldProxy?: string
  observer?: DeckImportObserver
}

export interface DeckImportError {
  code: string
  message: string
  cause?: unknown
  retryable?: boolean
}

export interface DeckImportIntermediate {
  title: string
  cards: ResolvedDeckCard[]
  missing: string[]
  sourceId: string
}

export type DeckImportResult = Result<ImportedDeck, DeckImportError>
export type ResolveDeckResult = Result<DeckImportIntermediate, DeckImportError>
export type ParseDecklistResult = Result<ParsedDeckCard[], DeckImportError>

export interface DeckImporter {
  readonly id: string
  readonly label: string
  canImport(source: DeckImportSource): boolean
  import(source: DeckImportSource, context: DeckImportContext): Promise<DeckImportResult>
}
