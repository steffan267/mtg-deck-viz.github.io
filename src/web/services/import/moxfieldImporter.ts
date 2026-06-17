import { err, ok } from '../../types/result'
import type { ResolvedCard, ResolvedDeckCard } from '../../types/deck'
import type { DeckImportContext, DeckImporter, DeckImportSource } from './types'

interface MoxfieldCardFace {
  oracle_text?: string
}

interface MoxfieldCard {
  name: string
  type_line?: string
  oracle_text?: string
  mana_cost?: string
  cmc?: number
  edhrec_rank?: number
  color_identity?: string[]
  card_faces?: MoxfieldCardFace[]
}

interface MoxfieldBoardEntry {
  quantity?: number
  card?: MoxfieldCard
}

interface MoxfieldDeckResponse {
  name?: string
  boards?: Record<string, { cards?: Record<string, MoxfieldBoardEntry> }>
}

export class MoxfieldDeckImporter implements DeckImporter {
  readonly id = 'moxfield'
  readonly label = 'Moxfield URL'

  canImport(source: DeckImportSource): boolean {
    return source.kind === 'url' && moxfieldId(source.url) != null
  }

  async import(source: DeckImportSource, context: DeckImportContext) {
    if (source.kind !== 'url') return err({ code: 'unsupported-source', message: 'Moxfield importer only supports URL sources' })
    const id = moxfieldId(source.url)
    if (!id) return err({ code: 'unsupported-source', message: 'Not a Moxfield deck URL' })

    const fetched = await fetchMoxfieldDeck(id, context)
    if (!fetched.ok) return fetched

    try {
      context.observer?.onProgress?.({ phase: 'building', label: `Analysing ${fetched.value.title}` })
      const graph = await context.buildGraph(fetched.value.cards, (done, total) =>
        context.observer?.onProgress?.({ phase: 'building', label: 'Analysing cards', done, total }),
      )
      return ok({ title: fetched.value.title, graph, missing: [], sourceId: this.id })
    } catch (cause) {
      return err({ code: 'build-failed', message: cause instanceof Error ? cause.message : 'Deck analysis failed', cause })
    }
  }
}

export function moxfieldId(input: string): string | null {
  const value = input.trim()
  const match = value.match(/moxfield\.com\/decks\/([A-Za-z0-9_-]+)/)
  return match ? match[1] : /^[A-Za-z0-9_-]{8,}$/.test(value) ? value : null
}

async function fetchMoxfieldDeck(id: string, context: Pick<DeckImportContext, 'fetch' | 'moxfieldProxy' | 'observer'>) {
  const fetcher = context.fetch ?? globalThis.fetch
  if (!fetcher) return err({ code: 'moxfield-failed', message: 'Fetch is unavailable in this environment' })

  const api = `https://api2.moxfield.com/v3/decks/all/${id}`
  const sources = [api]
  if (context.moxfieldProxy) sources.push(`${context.moxfieldProxy.replace(/\/+$/, '')}/${id}`)
  sources.push(`https://r.jina.ai/${api}`)

  let lastError: unknown
  for (const url of sources) {
    try {
      context.observer?.onProgress?.({ phase: 'fetching', label: 'Fetching Moxfield deck' })
      const response = await fetcher(url)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const text = await response.text()
      const jsonStart = text.indexOf('{')
      if (jsonStart < 0) throw new Error('No JSON in Moxfield response')
      const data = JSON.parse(text.slice(jsonStart)) as MoxfieldDeckResponse
      return ok({ title: data.name || `Moxfield ${id}`, cards: resolvedCardsFromMoxfield(data), missing: [], sourceId: 'moxfield' })
    } catch (cause) {
      lastError = cause
    }
  }

  const suffix = context.moxfieldProxy ? '' : ' — configure a CORS proxy if the public fallback is unavailable'
  return err({ code: 'moxfield-failed', message: `Moxfield fetch failed${suffix}`, cause: lastError, retryable: true })
}

function resolvedCardsFromMoxfield(data: MoxfieldDeckResponse): ResolvedDeckCard[] {
  const resolved: ResolvedDeckCard[] = []
  for (const boardName of ['commanders', 'mainboard']) {
    const cards = data.boards?.[boardName]?.cards ?? {}
    for (const entry of Object.values(cards)) {
      if (!entry.card) continue
      resolved.push({ qty: entry.quantity || 1, card: toResolvedCard(entry.card) })
    }
  }
  return resolved
}

function toResolvedCard(card: MoxfieldCard): ResolvedCard {
  return {
    name: card.name,
    type_line: card.type_line || '',
    oracle_text: card.oracle_text || card.card_faces?.map(face => face.oracle_text || '').join(' ') || '',
    mana_cost: card.mana_cost || '',
    cmc: card.cmc ?? 0,
    edhrec_rank: card.edhrec_rank ?? null,
    color_identity: card.color_identity || [],
  }
}
