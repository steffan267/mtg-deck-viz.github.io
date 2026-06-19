import type { CardFaceFacts, GraphNode } from '../types/graph'

export interface CardFaceDisplay {
  index: number
  name: string
  typeLine: string
  manaCost: string
  text: string
  availability: string
}

export interface CardFaceOverview {
  label: string
  chip: string
  faces: CardFaceDisplay[]
}

const LAYOUT_LABELS: Record<string, string> = {
  adventure: 'Adventure card',
  flip: 'Flip card',
  meld: 'Meld card',
  modal_dfc: 'Modal double-faced card',
  split: 'Split card',
  transform: 'Transform card',
}

const AVAILABILITY_LABELS: Record<string, string> = {
  'either-face': 'Multi-face card',
  'same-object-parts': 'Multi-part card',
  'separate-objects': 'Separate-object card',
  transforms: 'Transform card',
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function faceSource(node: GraphNode): CardFaceFacts[] {
  const faceFacts = Array.isArray(node.faceFacts) ? node.faceFacts : []
  if (faceFacts.length > 1) return faceFacts
  return Array.isArray(node.faces) ? node.faces : []
}

function splitParts(value: string): string[] {
  return value.split(/\s*\/\/\s*/).map(part => part.trim()).filter(Boolean)
}

function fallbackFaces(node: GraphNode): CardFaceDisplay[] {
  const names = splitParts(node.id)
  if (names.length <= 1) return []
  const typeParts = splitParts(text(node.type))
  const textParts = splitParts(text(node.text))
  return names.map((name, index) => ({
    index,
    name,
    typeLine: typeParts[index] || '',
    manaCost: index === 0 ? text(node.mana) : '',
    text: textParts[index] || '',
    availability: '',
  }))
}

export function cardFacesForDisplay(node: GraphNode | null | undefined): CardFaceDisplay[] {
  if (!node) return []
  const faces = faceSource(node)
  if (faces.length > 1) {
    return faces.map((face, index) => ({
      index: typeof face.index === 'number' ? face.index : index,
      name: text(face.name) || splitParts(node.id)[index] || node.id,
      typeLine: text(face.type_line),
      manaCost: text(face.mana_cost),
      text: text(face.oracle_text),
      availability: text(face.availability),
    }))
  }
  return fallbackFaces(node)
}

function overviewLabel(node: GraphNode, faces: CardFaceDisplay[]): string {
  const layout = text(node.layout).toLowerCase()
  if (layout && LAYOUT_LABELS[layout]) return LAYOUT_LABELS[layout]
  const availability = faces.map(face => face.availability).find(Boolean)
  if (availability && AVAILABILITY_LABELS[availability]) return AVAILABILITY_LABELS[availability]
  return 'Multi-face card'
}

export function cardFaceOverview(node: GraphNode | null | undefined): CardFaceOverview | null {
  const faces = cardFacesForDisplay(node)
  if (!node || faces.length <= 1) return null
  const label = overviewLabel(node, faces)
  return { label, chip: `${faces.length} faces`, faces }
}

export function cardFaceListSummary(node: GraphNode): string | null {
  const overview = cardFaceOverview(node)
  return overview ? overview.chip : null
}
