import type { CandidateCard, DeckPayloadEntry } from '../types'

export interface BrowserBootstrap {
  decks: DeckPayloadEntry[]
  active: number
  candidates?: CandidateCard[]
  title?: string
  moxfieldProxy?: string
  generatedAt?: string
}

const EMPTY_BOOTSTRAP: BrowserBootstrap = { decks: [], active: 0, candidates: [] }

export function emptyBootstrap(): BrowserBootstrap {
  return EMPTY_BOOTSTRAP
}

export async function loadBrowserBootstrap(fetcher: typeof fetch | undefined = globalThis.fetch?.bind(globalThis)): Promise<BrowserBootstrap> {
  if (window.__MTG_BOOTSTRAP__?.decks?.length) return window.__MTG_BOOTSTRAP__
  if (!fetcher) return EMPTY_BOOTSTRAP

  const urls = [window.__MTG_BOOTSTRAP_URL__ || './bootstrap-data.json', './generated/bootstrap-data.json']
  for (const url of [...new Set(urls)]) {
    try {
      const response = await fetcher(url)
      if (!response.ok) continue
      return await response.json() as BrowserBootstrap
    } catch {
      // Try the next known bootstrap location before falling back to an empty app.
    }
  }
  return EMPTY_BOOTSTRAP
}
