/// <reference types="vite/client" />

import type { DeckPayloadEntry, CandidateCard } from './types'

declare module '*.vue' {
  const component: unknown
  export default component
}

declare global {
  interface Window {
    __MTG_BOOTSTRAP__?: {
      decks: DeckPayloadEntry[]
      active: number
      candidates?: CandidateCard[]
      title?: string
      moxfieldProxy?: string
      generatedAt?: string
    }
    __MOXFIELD_PROXY__?: string
    __MTG_BOOTSTRAP_URL__?: string
    INTERACTION_MODEL?: unknown
    DECK_METRICS?: unknown
  }
}

export {}
