import type { CandidateCard, GraphNode, Interaction, ResolvedCard, ZoneDescriptor } from '../../types'

export interface InteractionClassification {
  role: string
  produces: Record<string, unknown>
  consumes: Record<string, unknown>
  zones: ZoneDescriptor[]
  myTypes: string[]
  tribalRefs: string[]
  caps: string[]
}

export interface InteractionModelModule {
  ZONES: ZoneDescriptor[]
  EVENT_LABEL: Record<string, string>
  classify(card: Pick<ResolvedCard, 'type_line' | 'oracle_text'>): InteractionClassification
  interactionsBetween(a: GraphNode, b: GraphNode): Interaction[]
  eventsFromInteractions?(interactions: Interaction[]): string[]
}

export function graphNodeFromCandidate(candidate: CandidateCard, model: InteractionModelModule): GraphNode {
  const classification = model.classify({ type_line: candidate.type, oracle_text: candidate.text })
  return {
    id: candidate.name,
    qty: 1,
    role: classification.role,
    cmc: candidate.cmc,
    type: candidate.type,
    mana: candidate.mana,
    text: candidate.text,
    ci: candidate.ci,
    edh: candidate.edh,
    degree: 0,
    produces: classification.produces,
    consumes: classification.consumes,
    zones: classification.zones,
    myTypes: classification.myTypes,
    tribalRefs: classification.tribalRefs,
    caps: classification.caps,
  }
}

export function graphNodeFromResolvedCard(qty: number, card: ResolvedCard, model: InteractionModelModule): GraphNode {
  const oracle = card.oracle_text || card.card_faces?.map(face => face.oracle_text || '').join(' ') || ''
  const mana = card.mana_cost || card.card_faces?.[0]?.mana_cost || ''
  const classification = model.classify({ type_line: card.type_line, oracle_text: oracle })
  return {
    id: card.name,
    qty,
    role: classification.role,
    cmc: card.cmc ?? 0,
    type: card.type_line || '',
    mana,
    text: oracle.replace(/\r/g, ''),
    ci: card.color_identity || [],
    edh: card.edhrec_rank ?? null,
    degree: 0,
    produces: classification.produces,
    consumes: classification.consumes,
    zones: classification.zones,
    myTypes: classification.myTypes,
    tribalRefs: classification.tribalRefs,
    caps: classification.caps,
  }
}

export function interactionEvents(interactions: Interaction[], model: InteractionModelModule): string[] {
  return model.eventsFromInteractions
    ? model.eventsFromInteractions(interactions)
    : interactions.map(interaction => interaction.event || interaction.family).filter((event): event is string => Boolean(event))
}
