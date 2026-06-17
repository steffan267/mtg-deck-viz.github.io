import { err, ok } from '../../types/result'
import type { ParsedDeckCard, ResolvedCard, ResolvedDeckCard } from '../../types/deck'
import type { DeckImportContext, ResolveDeckResult } from './types'

interface ScryfallCardFace {
  oracle_text?: string
  mana_cost?: string
}

interface ScryfallCard {
  name: string
  type_line?: string
  oracle_text?: string
  mana_cost?: string
  cmc?: number
  edhrec_rank?: number
  color_identity?: string[]
  card_faces?: ScryfallCardFace[]
}

interface ScryfallCollectionResponse {
  data?: ScryfallCard[]
  not_found?: Array<{ name?: string }>
}

const SCRYFALL_COLLECTION_URL = 'https://api.scryfall.com/cards/collection'
const SCRYFALL_BATCH_SIZE = 75
const SCRYFALL_BATCH_DELAY_MS = 110

export async function resolveViaScryfall(
  decklist: ParsedDeckCard[],
  context: Pick<DeckImportContext, 'fetch' | 'observer'> = {},
): Promise<ResolveDeckResult> {
  const fetcher = context.fetch ?? globalThis.fetch
  if (!fetcher) return err({ code: 'scryfall-failed', message: 'Fetch is unavailable in this environment' })

  const qtyByName = new Map<string, number>()
  for (const entry of decklist) qtyByName.set(entry.name.toLowerCase(), (qtyByName.get(entry.name.toLowerCase()) ?? 0) + entry.qty)

  const resolved: ResolvedDeckCard[] = []
  const missing: string[] = []
  const identifiers = decklist.map(card => ({ name: card.name }))

  try {
    for (let start = 0; start < identifiers.length; start += SCRYFALL_BATCH_SIZE) {
      const done = Math.min(start + SCRYFALL_BATCH_SIZE, identifiers.length)
      context.observer?.onProgress?.({ phase: 'resolving', label: 'Resolving via Scryfall', done, total: identifiers.length })

      const response = await fetcher(SCRYFALL_COLLECTION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifiers: identifiers.slice(start, done) }),
      })
      if (!response.ok) throw new Error(`Scryfall ${response.status}`)

      const data = (await response.json()) as ScryfallCollectionResponse
      for (const notFound of data.not_found ?? []) {
        if (notFound.name) missing.push(notFound.name)
      }
      for (const card of data.data ?? []) {
        resolved.push({ qty: qtyFor(card, qtyByName), card: toResolvedCard(card) })
      }
      if (done < identifiers.length) await delay(SCRYFALL_BATCH_DELAY_MS)
    }
  } catch (cause) {
    return err({ code: 'scryfall-failed', message: cause instanceof Error ? cause.message : 'Scryfall lookup failed', cause, retryable: true })
  }

  return ok({ title: 'Imported deck', cards: resolved, missing, sourceId: 'scryfall' })
}

function qtyFor(card: ScryfallCard, qtyByName: Map<string, number>): number {
  const exact = qtyByName.get(card.name.toLowerCase())
  if (exact != null) return exact
  return qtyByName.get(card.name.split(' // ')[0].toLowerCase()) ?? 1
}

function toResolvedCard(card: ScryfallCard): ResolvedCard {
  const oracleText = card.oracle_text || card.card_faces?.map(face => face.oracle_text || '').join(' ') || ''
  return {
    name: card.name,
    type_line: card.type_line || '',
    oracle_text: oracleText,
    mana_cost: card.mana_cost || card.card_faces?.[0]?.mana_cost || '',
    cmc: card.cmc ?? 0,
    edhrec_rank: card.edhrec_rank ?? null,
    color_identity: card.color_identity || [],
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
