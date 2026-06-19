import { err, ok } from '../../types/result'
import type { ParsedDeckCard, ResolvedCard, ResolvedDeckCard } from '../../types/deck'
import type { DeckImportContext, ResolveDeckResult } from './types'
import * as CARD_FACES from '../../../card-faces.js'

interface ScryfallCardFace {
  name?: string
  type_line?: string
  oracle_text?: string
  mana_cost?: string
  colors?: string[]
  oracle_id?: string
  layout?: string
}

interface ScryfallCard {
  id?: string
  oracle_id?: string
  name: string
  layout?: string
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
  for (const entry of decklist) {
    const key = CARD_FACES.normalizeCardNameKey(entry.name)
    qtyByName.set(key, (qtyByName.get(key) ?? 0) + entry.qty)
  }

  const resolvedByKey = new Map<string, ResolvedDeckCard>()
  const notFoundNames: string[] = []
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
        if (notFound.name) notFoundNames.push(notFound.name)
      }
      for (const card of data.data ?? []) {
        const resolvedCard = toResolvedCard(card)
        const key = CARD_FACES.physicalCardKey(resolvedCard)
        const current = resolvedByKey.get(key)
        const qty = qtyFor(card, qtyByName)
        if (current) {
          current.qty = Math.max(current.qty, qty)
          if (CARD_FACES.faceDataScore(resolvedCard) > CARD_FACES.faceDataScore(current.card)) current.card = resolvedCard
        } else {
          resolvedByKey.set(key, { qty, card: resolvedCard })
        }
      }
      if (done < identifiers.length) await delay(SCRYFALL_BATCH_DELAY_MS)
    }
  } catch (cause) {
    return err({ code: 'scryfall-failed', message: cause instanceof Error ? cause.message : 'Scryfall lookup failed', cause, retryable: true })
  }

  const resolved = [...resolvedByKey.values()]
  const resolvedAliases = new Set(resolved.flatMap(entry => CARD_FACES.cardAliases(entry.card)))
  const missing = notFoundNames.filter(name => !resolvedAliases.has(CARD_FACES.normalizeCardNameKey(name)))
  return ok({ title: 'Imported deck', cards: resolved, missing, sourceId: 'scryfall' })
}

function qtyFor(card: ScryfallCard, qtyByName: Map<string, number>): number {
  let total = 0
  for (const alias of CARD_FACES.cardAliases(card)) {
    const qty = qtyByName.get(alias)
    if (qty != null) total += qty
  }
  return total || 1
}

function toResolvedCard(card: ScryfallCard): ResolvedCard {
  const faceAware = CARD_FACES.toFaceAwareResolvedCard(card)
  return {
    name: faceAware.name,
    type_line: faceAware.type_line || '',
    oracle_text: faceAware.oracle_text || '',
    mana_cost: faceAware.mana_cost || '',
    cmc: faceAware.cmc ?? 0,
    edhrec_rank: faceAware.edhrec_rank ?? null,
    color_identity: faceAware.color_identity || [],
    layout: faceAware.layout,
    aliases: faceAware.aliases,
    faces: faceAware.faces,
    cardKey: faceAware.cardKey,
    canonicalName: faceAware.canonicalName,
    card_faces: faceAware.card_faces,
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
