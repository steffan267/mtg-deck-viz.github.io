const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_DATA_FILE = path.resolve(process.cwd(), 'data/out/commander-search.json');
const DEFAULT_LIMIT = 80;
const COLOR_ORDER = ['W', 'U', 'B', 'R', 'G'];
const CATEGORY_TAGS = [
  'ramp',
  'draw',
  'removal',
  'board_wipe',
  'counterspell',
  'tutor',
  'graveyard',
  'reanimation',
  'tokens',
  'sacrifice',
  'lifegain',
  'artifact_synergy',
  'enchantment_synergy',
  'spellslinger',
  'combat',
  'mill',
  'discard',
  'blink',
  'stax',
  'extra_turn',
  'land'
];

function parseArgs(argv) {
  const options = {
    dataFile: DEFAULT_DATA_FILE,
    commander: null,
    colors: null,
    theme: [],
    limit: DEFAULT_LIMIT,
    format: 'markdown',
    help: false,
    usage: [
      'Usage: node ./bin/mtg-deck-context.js [options]',
      '',
      'Options:',
      '  --commander <name>   Pick color identity from a commander-like card and score around its text',
      '  --colors <WUBRG|C>    Restrict suggestions to a Commander color identity when no commander is given',
      '  --theme <text|tag>    Add a theme/tag to score for. Repeatable, or comma-separated',
      '  --limit <number>      Number of suggestions to output. Default: 80',
      '  --format <markdown|json>',
      '  --data-file <path>    commander-search.json path. Default: data/out/commander-search.json',
      '  --help                Show this help text',
      '',
      'Examples:',
      '  node ./bin/mtg-deck-context.js --commander "The Wise Mothman" --theme mill --limit 120',
      '  node ./bin/mtg-deck-context.js --colors UB --theme "zombies,graveyard" --format json'
    ].join('\n')
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case '--data-file':
        options.dataFile = path.resolve(argv[++index] ?? '');
        break;
      case '--commander':
        options.commander = argv[++index] ?? '';
        break;
      case '--colors':
        options.colors = normalizeColors(argv[++index] ?? '');
        break;
      case '--theme':
        options.theme.push(...String(argv[++index] ?? '').split(',').map((value) => value.trim()).filter(Boolean));
        break;
      case '--limit':
        options.limit = Number.parseInt(argv[++index] ?? '', 10);
        break;
      case '--format':
        options.format = argv[++index] ?? 'markdown';
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isInteger(options.limit) || options.limit < 1) {
    throw new Error('--limit must be a positive integer');
  }

  if (!['markdown', 'json'].includes(options.format)) {
    throw new Error('--format must be either markdown or json');
  }

  return options;
}

async function buildDeckContext(options) {
  const data = JSON.parse(await fs.promises.readFile(options.dataFile, 'utf8'));
  const cards = Array.isArray(data.cards) ? data.cards : [];
  const preparedCards = cards.map(prepareCard);
  const commander = options.commander ? findCardByName(preparedCards, options.commander) : null;
  const colorIdentity = options.colors ?? commander?.color_identity ?? [];
  const themes = normalizeThemes(options.theme, commander);
  const suggestions = scoreCards(preparedCards, { commander, colorIdentity, themes })
    .slice(0, options.limit)
    .map(({ card, score, reasons }) => toSuggestion(card, score, reasons));

  return {
    meta: {
      sourceProvider: data.meta?.provider,
      sourceUpdatedAt: data.meta?.updatedAt,
      sourceGeneratedAt: data.meta?.generatedAt,
      cardCount: data.meta?.cardCount ?? cards.length,
      query: {
        commander: options.commander ?? null,
        matchedCommander: commander ? commander.name : null,
        colorIdentity: colorIdentityKey(colorIdentity),
        themes,
        limit: options.limit
      }
    },
    commander: commander ? toSuggestion(commander, undefined, ['matched commander']) : null,
    suggestions,
    categorySummary: summarizeByCategory(suggestions)
  };
}

function prepareCard(card) {
  return {
    ...card,
    _search: String(card.search_text ?? '').toLowerCase(),
    _name: String(card.name_normalized ?? normalizeName(card.name)),
    _tags: new Set(card.tags ?? []),
    _colors: new Set(card.color_identity ?? [])
  };
}

function findCardByName(cards, name) {
  const wanted = normalizeName(name);
  return cards.find((card) => card._name === wanted)
    ?? cards.find((card) => card._name.includes(wanted) || wanted.includes(card._name));
}

function scoreCards(cards, query) {
  const queryColors = new Set(query.colorIdentity ?? []);
  const themeTerms = query.themes.map((theme) => theme.toLowerCase());
  const commanderTerms = query.commander ? importantTerms(query.commander) : [];
  const scored = [];

  for (const card of cards) {
    if (!card.is_commander_legal || card.id === query.commander?.id) {
      continue;
    }

    if (!isWithinColorIdentity(card, queryColors)) {
      continue;
    }

    let score = 0;
    const reasons = [];

    for (const theme of themeTerms) {
      if (card._tags.has(theme)) {
        score += 18;
        reasons.push(`tag:${theme}`);
      } else if (card._search.includes(theme)) {
        score += 10;
        reasons.push(`text:${theme}`);
      }
    }

    for (const term of commanderTerms) {
      if (card._tags.has(term)) {
        score += 8;
        reasons.push(`commander tag:${term}`);
      } else if (card._search.includes(term)) {
        score += 3;
      }
    }

    if (card.edhrec_rank) {
      score += Math.max(0, 10 - Math.log10(card.edhrec_rank));
    }

    if (card._tags.has('land')) {
      score += 1;
    }

    if (score > 0) {
      scored.push({ card, score, reasons: Array.from(new Set(reasons)).slice(0, 6) });
    }
  }

  return scored.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }

    const leftRank = left.card.edhrec_rank ?? Number.MAX_SAFE_INTEGER;
    const rightRank = right.card.edhrec_rank ?? Number.MAX_SAFE_INTEGER;

    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    return left.card.name.localeCompare(right.card.name);
  });
}

function isWithinColorIdentity(card, queryColors) {
  if (card.is_basic_land) {
    return true;
  }

  for (const color of card._colors) {
    if (!queryColors.has(color)) {
      return false;
    }
  }

  return true;
}

function normalizeThemes(themes, commander) {
  const normalized = themes.map((theme) => theme.toLowerCase().replace(/\s+/g, '_'));

  if (normalized.length > 0 || !commander) {
    return Array.from(new Set(normalized));
  }

  return importantTerms(commander).slice(0, 6);
}

function importantTerms(card) {
  const tags = (card.tags ?? []).filter((tag) => !['legendary', 'commander_candidate', 'creature', 'instant', 'sorcery', 'land'].includes(tag));
  const keywords = (card.keywords ?? []).map((keyword) => keyword.toLowerCase());
  return Array.from(new Set([...tags, ...keywords]));
}

function toSuggestion(card, score, reasons) {
  return {
    name: card.name,
    mana_cost: card.mana_cost,
    mana_value: card.cmc,
    type_line: card.type_line,
    color_identity: colorIdentityKey(card.color_identity),
    tags: card.tags ?? [],
    edhrec_rank: card.edhrec_rank,
    score,
    reasons,
    oracle_text: card.oracle_text
  };
}

function summarizeByCategory(suggestions) {
  const summary = {};

  for (const tag of CATEGORY_TAGS) {
    const names = suggestions
      .filter((suggestion) => suggestion.tags.includes(tag))
      .slice(0, 12)
      .map((suggestion) => suggestion.name);

    if (names.length > 0) {
      summary[tag] = names;
    }
  }

  return summary;
}

function formatMarkdown(context) {
  const query = context.meta.query;
  const lines = [
    '# MTG deck suggestion context',
    '',
    `Source: ${context.meta.sourceProvider ?? 'unknown'} Oracle Cards, updated ${context.meta.sourceUpdatedAt ?? 'unknown'} (${context.meta.cardCount} compact cards).`,
    `Query: commander=${query.matchedCommander ?? query.commander ?? 'none'}, colors=${query.colorIdentity}, themes=${query.themes.join(', ') || 'auto'}, suggestions=${context.suggestions.length}`,
    ''
  ];

  if (context.commander) {
    lines.push('## Commander', '', formatCardLine(context.commander), '');
  }

  lines.push('## Top suggestions', '');
  for (const suggestion of context.suggestions) {
    lines.push(formatCardLine(suggestion));
  }

  lines.push('', '## Category summary', '');
  for (const [category, names] of Object.entries(context.categorySummary)) {
    lines.push(`- **${category}**: ${names.join(', ')}`);
  }

  return `${lines.join('\n')}\n`;
}

function formatCardLine(card) {
  const parts = [
    `- **${card.name}**`,
    card.mana_cost ? `${card.mana_cost}` : null,
    card.type_line,
    card.color_identity ? `CI:${card.color_identity}` : null,
    card.edhrec_rank ? `EDHREC:${card.edhrec_rank}` : null,
    card.reasons?.length ? `why: ${card.reasons.join('; ')}` : null,
    card.oracle_text ? `— ${card.oracle_text}` : null
  ].filter(Boolean);

  return parts.join(' | ');
}

function normalizeColors(value) {
  const upper = String(value).toUpperCase().trim();
  if (upper === 'C' || upper === 'COLORLESS' || upper === '') {
    return [];
  }

  const colors = new Set();
  for (const color of upper.replace(/[^WUBRG]/g, '')) {
    colors.add(color);
  }

  return COLOR_ORDER.filter((color) => colors.has(color));
}

function colorIdentityKey(colors) {
  const normalized = normalizeColors(Array.isArray(colors) ? colors.join('') : colors ?? '');
  return normalized.length > 0 ? normalized.join('') : 'C';
}

function normalizeName(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = {
  DEFAULT_DATA_FILE,
  buildDeckContext,
  colorIdentityKey,
  formatMarkdown,
  normalizeColors,
  parseArgs
};
