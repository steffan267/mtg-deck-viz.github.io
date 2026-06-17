export interface SaltCardReference {
  name: string
  source: string
}

export const EDHREC_SALT_SOURCE = 'https://edhrec.com/top/salt'

// Snapshot from EDHREC "Top 100 Saltiest Cards" checked 2026-06-17.
export const EDHREC_TOP_SALT_CARDS = [
  'Stasis',
  'Winter Orb',
  'Vivi Ornitier',
  'Tergrid, God of Fright',
  'Rhystic Study',
  'The Tabernacle at Pendrell Vale',
  'Armageddon',
  'Static Orb',
  'Vorinclex, Voice of Hunger',
  "Thassa's Oracle",
  'Grand Arbiter Augustin IV',
  'Smothering Tithe',
  'Jin-Gitaxias, Core Augur',
  'The One Ring',
  'Humility',
  'Drannith Magistrate',
  'Expropriate',
  'Sunder',
  'Obliterate',
  'Devastation',
  'Ravages of War',
  'Cyclonic Rift',
  'Jokulhaups',
  'Apocalypse',
  'Opposition Agent',
  'Urza, Lord High Artificer',
  'Fierce Guardianship',
  'Hokori, Dust Drinker',
  'Back to Basics',
  'Nether Void',
  'Jin-Gitaxias, Progress Tyrant',
  'Braids, Cabal Minion',
  'Worldfire',
  'Toxrill, the Corrosive',
  'Aura Shards',
  "Gaea's Cradle",
  'Kinnan, Bonder Prodigy',
  "Yuriko, the Tiger's Shadow",
  "Teferi's Protection",
  'Blood Moon',
  'Farewell',
  'Rising Waters',
  'Decree of Annihilation',
  'Winter Moon',
  'Smokestack',
  'Orcish Bowmasters',
  'Tectonic Break',
  'Edgar Markov',
  'Sen Triplets',
  'Warp World',
  'Sheoldred, the Apocalypse',
  'Emrakul, the Promised End',
  'Scrambleverse',
  "Thieves' Auction",
  'Force of Will',
  'Narset, Parter of Veils',
  'Glacial Chasm',
  'Ruination',
  'Mindslaver',
  'Epicenter',
  'The Ur-Dragon',
  'Notion Thief',
  'Void Winnower',
  'Jodah, the Unifier',
  'Storm, Force of Nature',
  'Wake of Destruction',
  'Force of Negation',
  'Deadpool, Trading Card',
  'Mana Drain',
  'Blightsteel Colossus',
  'Dictate of Erebos',
  'Boil',
  'Winota, Joiner of Forces',
  'Mana Breach',
  'Global Ruin',
  'Catastrophe',
  'Emrakul, the World Anew',
  'Acid Rain',
  'Time Stretch',
  'Grave Pact',
  'Impending Disaster',
  'Ulamog, the Defiler',
  'Demonic Consultation',
  'Underworld Breach',
  'Consecrated Sphinx',
  'Divine Intervention',
  'Thoughts of Ruin',
  'Miirym, Sentinel Wyrm',
  'Vorinclex, Monstrous Raider',
  'Ad Nauseam',
  'Seedborn Muse',
  'Cataclysm',
  'Elesh Norn, Mother of Machines',
  'Boiling Seas',
  'Magus of the Moon',
  'Elesh Norn, Grand Cenobite',
  'Sway of the Stars',
  'Hullbreaker Horror',
  'Necropotence',
  "Atraxa, Praetors' Voice",
] as const

const saltNames = new Set(EDHREC_TOP_SALT_CARDS.map(normalizeCardName))

export function normalizeCardName(name: string): string {
  return name.split('//')[0].trim().toLowerCase()
}

export function saltyCardReferences(cardNames: readonly string[]): SaltCardReference[] {
  const seen = new Set<string>()
  const matches: SaltCardReference[] = []
  for (const name of cardNames) {
    const normalized = normalizeCardName(name)
    if (!saltNames.has(normalized) || seen.has(normalized)) continue
    seen.add(normalized)
    matches.push({ name: name.split('//')[0].trim(), source: EDHREC_SALT_SOURCE })
  }
  return matches.sort((a, b) => a.name.localeCompare(b.name))
}
