const TARGET_BRACKETS = [1, 2, 3, 4, 5];
const GLOBAL_PAGE_SIZE = 100;
const BRACKET_PAGE_SIZE = 64;

function encodePublicBracketQuery(bracket, pageNumber = 1, pageSize = BRACKET_PAGE_SIZE) {
  return Buffer.from(JSON.stringify({
    hub: '',
    format: 'commander',
    deckName: '',
    cardId: '',
    cardName: '',
    board: '',
    lastSearch: '',
    filter: '',
    authorUserNames: '',
    commanderCardId: '',
    commanderCardName: '',
    partnerCardId: '',
    partnerCardName: '',
    commanderSignatureSpellCardId: '',
    commanderSignatureSpellCardName: '',
    partnerSignatureSpellCardId: '',
    partnerSignatureSpellCardName: '',
    companionCardId: '',
    companionCardName: '',
    bracketSetting: 'equals',
    bracket: String(bracket),
    sortColumn: 'likes',
    sortDirection: 'descending',
    pageNumber,
    pageSize,
    view: 'public',
    hubName: '',
  })).toString('base64');
}

function parseJinaJson(body) {
  const start = String(body || '').indexOf('{');
  if (start < 0) throw new Error('No JSON object found in response body');
  return JSON.parse(String(body).slice(start));
}

function toInt(value) {
  return parseInt(String(value || '0').replace(/,/g, ''), 10) || 0;
}

function parsePublicBracketPage(markdown, bracket) {
  const text = String(markdown || '');
  const lines = text.split(/\r?\n/);
  const entries = [];
  const seen = new Set();
  const re = /^\[(.+?)_Commander_·([^\]]*?)Comment Count is ([\d,]+) Like Count is ([\d,]+) View Count is ([\d,]+)\]\(https:\/\/moxfield\.com\/decks\/([A-Za-z0-9_-]+)\)$/;
  for (const line of lines) {
    const m = line.trim().match(re);
    if (!m) continue;
    const id = m[6];
    if (seen.has(id)) continue;
    seen.add(id);
    const inlineBracket = parseInt(String(m[2]).replace(/\D/g, ''), 10) || bracket;
    const resolvedBracket = TARGET_BRACKETS.includes(inlineBracket) ? inlineBracket : bracket;
    entries.push({
      id,
      name: m[1].trim(),
      likes: toInt(m[4]),
      views: toInt(m[5]),
      comments: toInt(m[3]),
      bracket: resolvedBracket,
      inlineBracket,
      requestedBracket: bracket,
      url: `https://moxfield.com/decks/${id}`,
      source: 'public-bracket-page',
      sourcePage: 1,
    });
  }
  return entries;
}

function isCommanderDeck(row) {
  return row && row.format === 'commander' && row.publicId && TARGET_BRACKETS.includes(row.bracket);
}

function normalizeLeaderboardRow(row, pageNumber, rowIndex) {
  return {
    id: row.publicId,
    name: row.name || '',
    likes: row.likeCount || 0,
    views: row.viewCount || 0,
    comments: row.commentCount || 0,
    bracket: row.bracket,
    autoBracket: row.autoBracket,
    url: row.publicUrl || `https://moxfield.com/decks/${row.publicId}`,
    author: row.createdByUser && row.createdByUser.userName || '',
    source: 'global-likes-api',
    sourcePage: pageNumber,
    sourceRankOnPage: rowIndex + 1,
  };
}


function finalizeDecks(decks) {
  const counts = Object.fromEntries(TARGET_BRACKETS.map(b => [b, 0]));
  return (decks || [])
    .slice()
    .sort((a, b) => (a.bracket - b.bracket) || (b.likes - a.likes) || (b.views - a.views) || (b.comments - a.comments) || String(a.name).localeCompare(String(b.name)) || String(a.id).localeCompare(String(b.id)))
    .map(deck => ({ ...deck, bracketRank: ++counts[deck.bracket] }));
}

function sampleStatus(decks, targetPerBracket) {
  const counts = Object.fromEntries(TARGET_BRACKETS.map(b => [b, 0]));
  for (const deck of decks || []) {
    if (counts[deck.bracket] != null) counts[deck.bracket]++;
  }
  const shortfalls = Object.fromEntries(TARGET_BRACKETS.map(b => [b, Math.max(0, targetPerBracket - counts[b])]));
  return {
    counts,
    shortfalls,
    complete: TARGET_BRACKETS.every(b => counts[b] >= targetPerBracket),
  };
}

function maybeAddDeck(state, deck, targetPerBracket) {
  if (!deck || !TARGET_BRACKETS.includes(deck.bracket) || !deck.id) return false;
  if (state.seen.has(deck.id)) return false;
  if ((state.counts[deck.bracket] || 0) >= targetPerBracket) return false;
  state.seen.add(deck.id);
  state.counts[deck.bracket] = (state.counts[deck.bracket] || 0) + 1;
  state.decks.push({
    ...deck,
    bracketRank: state.counts[deck.bracket],
  });
  return true;
}

function initSampleState(existingDecks = []) {
  const state = {
    decks: [],
    seen: new Set(),
    counts: Object.fromEntries(TARGET_BRACKETS.map(b => [b, 0])),
  };
  for (const deck of existingDecks) maybeAddDeck(state, deck, Number.MAX_SAFE_INTEGER);
  return state;
}

module.exports = {
  TARGET_BRACKETS,
  GLOBAL_PAGE_SIZE,
  BRACKET_PAGE_SIZE,
  encodePublicBracketQuery,
  parseJinaJson,
  parsePublicBracketPage,
  isCommanderDeck,
  normalizeLeaderboardRow,
  finalizeDecks,
  sampleStatus,
  maybeAddDeck,
  initSampleState,
};
