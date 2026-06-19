/*
 * card-faces.js — shared physical-card/face normalization helpers.
 *
 * The interaction engine keeps one deck object per physical card, while these
 * helpers preserve the face-level facts needed for aliases, display text, and
 * later face-aware proof evidence. The module is intentionally CommonJS so the
 * Node/static builder can require it directly and the Vite browser app can
 * import it like the existing shared interaction-model.js module.
 */

const FACE_AVAILABILITY = Object.freeze({
  SINGLE: 'single',
  EITHER_FACE: 'either-face',
  TRANSFORMS: 'transforms',
  SAME_OBJECT_PARTS: 'same-object-parts',
  SEPARATE_OBJECTS: 'separate-objects',
});

const EITHER_FACE_LAYOUTS = new Set(['split', 'adventure', 'modal_dfc', 'prepare']);
const TRANSFORM_LAYOUTS = new Set(['transform', 'meld']);
const SAME_OBJECT_PART_LAYOUTS = new Set(['flip', 'leveler', 'class', 'case', 'saga', 'battle', 'prototype', 'mutate']);
const SEPARATE_OBJECT_LAYOUTS = new Set(['reversible_card', 'double_faced_token', 'art_series']);

function normalizeText(value) {
  return typeof value === 'string' ? value.replace(/\r/g, '').replace(/\s+/g, ' ').trim() : '';
}

function normalizeCardNameKey(value) {
  return normalizeText(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[‘’`]/g, "'")
    .replace(/[‐‑‒–—―]/g, '-')
    .replace(/\s*\/\/\s*/g, ' // ')
    .toLowerCase();
}

function uniqueSorted(values) {
  return [...new Set((values || []).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function splitNameParts(name) {
  return normalizeText(name).split(/\s*\/\/\s*/).map(normalizeText).filter(Boolean);
}

function splitFieldParts(value) {
  return normalizeText(value).split(/\s*\/\/\s*/).map(normalizeText);
}

function hasCardFaces(card) {
  return Array.isArray(card && card.card_faces) && card.card_faces.length > 0;
}

function canonicalCardName(card) {
  const rootName = normalizeText(card && (card.name || card.cardName || card.id));
  if (rootName) return rootName;
  const faceNames = hasCardFaces(card) ? card.card_faces.map(face => normalizeText(face && face.name)).filter(Boolean) : [];
  return faceNames.join(' // ');
}

function cardAvailability(layout, hasMultipleFaces = false) {
  const normalizedLayout = normalizeText(layout || 'normal').toLowerCase();
  if (!hasMultipleFaces && normalizedLayout === 'normal') return FACE_AVAILABILITY.SINGLE;
  if (SEPARATE_OBJECT_LAYOUTS.has(normalizedLayout)) return FACE_AVAILABILITY.SEPARATE_OBJECTS;
  if (TRANSFORM_LAYOUTS.has(normalizedLayout)) return FACE_AVAILABILITY.TRANSFORMS;
  if (SAME_OBJECT_PART_LAYOUTS.has(normalizedLayout)) return FACE_AVAILABILITY.SAME_OBJECT_PARTS;
  if (EITHER_FACE_LAYOUTS.has(normalizedLayout)) return FACE_AVAILABILITY.EITHER_FACE;
  return hasMultipleFaces ? FACE_AVAILABILITY.EITHER_FACE : FACE_AVAILABILITY.SINGLE;
}

function cardKey(card) {
  return normalizeText(card && (card.oracle_id || card.id)) || normalizeCardNameKey(canonicalCardName(card));
}

function physicalCardKey(card) {
  const key = cardKey(card) || canonicalCardName(card);
  return normalizeCardNameKey(key);
}

function faceDataScore(card) {
  const faceAware = toFaceAwareResolvedCard(card);
  return (Array.isArray(faceAware.faces) ? faceAware.faces.length : 0)
    + (Array.isArray(faceAware.aliases) ? faceAware.aliases.length : 0)
    + (faceAware.oracle_text ? 1 : 0)
    + (faceAware.type_line ? 1 : 0)
    + (faceAware.cardKey ? 1 : 0);
}

function extractCardFaces(card) {
  const faceSource = hasCardFaces(card) ? card.card_faces : [card || {}];
  const multiple = faceSource.length > 1;
  const nameParts = splitNameParts(canonicalCardName(card));
  const typeParts = splitFieldParts(card && card.type_line);
  const layout = normalizeText(card && card.layout) || 'normal';
  const availability = cardAvailability(layout, multiple);

  return faceSource.map((face, index) => {
    const isSyntheticSingleFace = !hasCardFaces(card);
    return {
      index,
      name: normalizeText(face && face.name) || nameParts[index] || canonicalCardName(card),
      type_line: normalizeText(face && face.type_line) || (isSyntheticSingleFace ? normalizeText(card && card.type_line) : typeParts[index] || ''),
      oracle_text: normalizeText(face && face.oracle_text) || (isSyntheticSingleFace ? normalizeText(card && card.oracle_text) : ''),
      mana_cost: normalizeText(face && face.mana_cost) || (isSyntheticSingleFace ? normalizeText(card && card.mana_cost) : ''),
      colors: Array.isArray(face && face.colors) ? face.colors.slice() : undefined,
      oracle_id: normalizeText(face && face.oracle_id) || undefined,
      layout: normalizeText(face && face.layout) || layout,
      availability,
    };
  });
}

function cardAliases(card) {
  const aliases = [
    canonicalCardName(card),
    ...splitNameParts(canonicalCardName(card)),
    ...extractCardFaces(card).map(face => face.name),
  ];
  return uniqueSorted(aliases.map(normalizeCardNameKey));
}

function mergedOracleText(facesOrCard) {
  const faces = Array.isArray(facesOrCard) ? facesOrCard : extractCardFaces(facesOrCard);
  return faces.map(face => normalizeText(face && face.oracle_text)).filter(Boolean).join(' // ');
}

function mergedTypeLine(facesOrCard) {
  const faces = Array.isArray(facesOrCard) ? facesOrCard : extractCardFaces(facesOrCard);
  return faces.map(face => normalizeText(face && face.type_line)).filter(Boolean).join(' // ');
}

function displayManaCost(facesOrCard) {
  const faces = Array.isArray(facesOrCard) ? facesOrCard : extractCardFaces(facesOrCard);
  return faces.map(face => normalizeText(face && face.mana_cost)).find(Boolean) || '';
}

function toFaceAwareResolvedCard(card) {
  const faces = extractCardFaces(card);
  const canonicalName = canonicalCardName(card);
  return Object.assign({}, card, {
    name: canonicalName,
    canonicalName,
    cardKey: cardKey(card),
    layout: normalizeText(card && card.layout) || 'normal',
    aliases: cardAliases(card),
    faces,
    card_faces: faces.map(face => ({
      name: face.name,
      mana_cost: face.mana_cost,
      type_line: face.type_line,
      oracle_text: face.oracle_text,
      colors: face.colors,
      oracle_id: face.oracle_id,
      layout: face.layout,
    })),
    type_line: normalizeText(card && card.type_line) || mergedTypeLine(faces),
    oracle_text: normalizeText(card && card.oracle_text) || mergedOracleText(faces),
    mana_cost: normalizeText(card && card.mana_cost) || displayManaCost(faces),
  });
}

module.exports = {
  FACE_AVAILABILITY,
  cardAliases,
  cardAvailability,
  cardKey,
  canonicalCardName,
  displayManaCost,
  extractCardFaces,
  faceDataScore,
  mergedOracleText,
  mergedTypeLine,
  normalizeCardNameKey,
  physicalCardKey,
  toFaceAwareResolvedCard,
};
