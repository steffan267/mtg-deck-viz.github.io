import type { CandidateCard, GraphNode, Interaction, ResolvedCard, ZoneDescriptor } from '../../types'
import * as CARD_FACES from '../../../card-faces.js'
import * as FACE_CLASSIFICATION from '../../../face-classification.js'

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
  const oracle = candidate.text || CARD_FACES.mergedOracleText(candidate.faces || [])
  const faceClassified = FACE_CLASSIFICATION.classifyFaceAwareCard({
    name: candidate.name,
    type_line: candidate.type,
    oracle_text: oracle,
    mana_cost: candidate.mana,
    cmc: candidate.cmc,
    color_identity: candidate.ci,
    edhrec_rank: candidate.edh,
    layout: candidate.layout,
    aliases: candidate.aliases,
    faces: candidate.faces,
    card_faces: candidate.faces,
    cardKey: candidate.cardKey,
    canonicalName: candidate.canonicalName,
  }, model)
  const classification = faceClassified.aggregate
  const faceAware = faceClassified.faceAware
  return {
    id: faceAware.name,
    qty: 1,
    role: classification.role,
    cmc: candidate.cmc,
    type: faceAware.type_line || candidate.type,
    mana: faceAware.mana_cost || candidate.mana,
    text: (faceAware.oracle_text || oracle).replace(/\r/g, ''),
    ci: faceAware.color_identity || candidate.ci,
    edh: faceAware.edhrec_rank ?? candidate.edh,
    degree: 0,
    layout: faceAware.layout,
    aliases: faceAware.aliases,
    faces: faceAware.faces,
    faceFacts: faceClassified.faceFacts,
    factSources: faceClassified.factSources,
    faceCompatibilityWarnings: faceClassified.faceCompatibilityWarnings,
    cardKey: faceAware.cardKey,
    canonicalName: faceAware.canonicalName,
    produces: classification.produces,
    consumes: classification.consumes,
    zones: classification.zones,
    myTypes: classification.myTypes,
    tribalRefs: classification.tribalRefs,
    caps: classification.caps,
  }
}

export function graphNodeFromResolvedCard(qty: number, card: ResolvedCard, model: InteractionModelModule): GraphNode {
  const faceClassified = FACE_CLASSIFICATION.classifyFaceAwareCard(card, model)
  const faceAware = faceClassified.faceAware
  const oracle = faceAware.oracle_text || ''
  const mana = faceAware.mana_cost || ''
  const classification = faceClassified.aggregate
  return {
    id: faceAware.name,
    qty,
    role: classification.role,
    cmc: faceAware.cmc ?? 0,
    type: faceAware.type_line || '',
    mana,
    text: oracle.replace(/\r/g, ''),
    ci: faceAware.color_identity || [],
    edh: faceAware.edhrec_rank ?? null,
    degree: 0,
    layout: faceAware.layout,
    aliases: faceAware.aliases,
    faces: faceAware.faces,
    faceFacts: faceClassified.faceFacts,
    factSources: faceClassified.factSources,
    faceCompatibilityWarnings: faceClassified.faceCompatibilityWarnings,
    cardKey: faceAware.cardKey,
    canonicalName: faceAware.canonicalName,
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

export function annotateInteractionFaceEvidence(a: GraphNode, b: GraphNode, interactions: Interaction[]): Interaction[] {
  return FACE_CLASSIFICATION.annotateInteractionsWithFaceEvidence(a, b, interactions)
}
