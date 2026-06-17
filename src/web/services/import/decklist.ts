import type { ParsedDeckCard } from '../../types/deck'

export function parseDecklist(text: string): ParsedDeckCard[] {
  const cards: ParsedDeckCard[] = []
  for (let line of text.split('\n')) {
    line = line.trim()
    if (!line || line.startsWith('#') || /^(commander|deck|sideboard|maybeboard)\b/i.test(line)) continue
    const match = line.match(/^(\d+)\s*x?\s+(.+)$/i) || line.match(/^()(.+)$/)
    if (!match) continue
    const qty = match[1] ? Number.parseInt(match[1], 10) : 1
    const name = match[2]
      .replace(/\s*\([A-Za-z0-9]{2,6}\)\s*[A-Za-z0-9-]*\s*/g, ' ')
      .replace(/\*[^*]+\*/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    if (name) cards.push({ qty, name })
  }
  return cards
}

export function titleFromFileName(name: string): string {
  return name.replace(/\.[^.]+$/, '') || 'Imported deck'
}
