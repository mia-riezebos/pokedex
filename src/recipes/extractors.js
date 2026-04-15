// Pure extraction helpers for recipes. Imported by:
//   - src/commands/recipes.js (Discord bot command surface)
//   - scripts/retag-recipes.js (one-off migration, intentionally lightweight)
//   - tests/commands/recipes.test.js (vitest suite)
//
// Keep this file free of Discord, Firebase, or config imports so that tools
// consuming only the extractors don't pull in the entire bot runtime.

function extractTags(text) {
  if (!text) return [];
  const tags = [];
  const lower = text.toLowerCase();

  // Single-word keywords that map directly to a canonical tag. Matched with \b
  // word boundaries so substring noise like "about" (→ "ou") doesn't trigger.
  const singleWordKeywords = {
    // Formats
    ou: 'ou', uu: 'uu', ru: 'ru', nu: 'nu', pu: 'pu', ubers: 'ubers', uber: 'ubers',
    lc: 'lc', vgc: 'vgc', doubles: 'doubles', singles: 'singles', monotype: 'monotype',
    // Weather (note: no "team" suffix — matches canonical)
    rain: 'rain', sun: 'sun', sand: 'sand', snow: 'snow',
    // Archetypes
    stall: 'stall', balance: 'balance', tailwind: 'tailwind', screens: 'screens',
    // Tempo / role
    setup: 'setup', lead: 'lead', pivot: 'pivot', wallbreaker: 'wallbreaker',
    sweeper: 'sweeper', tank: 'tank',
    // Misc
    showdown: 'showdown', tournament: 'tournament', ladder: 'ladder', rmt: 'rmt',
    // Generation aliases
    scarlet: 'gen-9', violet: 'gen-9',
  };

  // Phrase keywords — safe to substring-match, emit canonical forms.
  const phraseKeywords = {
    'trick room': 'trick-room',
    'hyper offense': 'hyper-offense',
    'bulky offense': 'bulky-offense',
    'gen 9': 'gen-9',
    'gen 8': 'gen-8',
    'gen 7': 'gen-7',
    'gen 6': 'gen-6',
    'reg f': 'reg-f',
    'reg g': 'reg-g',
    'reg h': 'reg-h',
  };

  for (const [keyword, tag] of Object.entries(singleWordKeywords)) {
    const pattern = new RegExp(`\\b${keyword}\\b`);
    if (pattern.test(lower)) tags.push(tag);
  }

  for (const [keyword, tag] of Object.entries(phraseKeywords)) {
    if (lower.includes(keyword)) tags.push(tag);
  }

  return [...new Set(tags)];
}

function inferSource(url) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    if (hostname.includes('poke.com')) return 'Poke';
    if (hostname.includes('pokepast')) return 'Pokepaste';
    if (hostname.includes('pokemonshowdown')) return 'Showdown';
    if (hostname.includes('pastebin')) return 'Pastebin';
    if (hostname.includes('paste.pokemon-online')) return 'PO Paste';
    if (hostname.includes('github')) return 'GitHub';
    if (hostname.includes('docs.google')) return 'Google Docs';
    if (hostname.includes('youtube') || hostname.includes('youtu.be')) return 'YouTube';
    if (hostname.includes('reddit')) return 'Reddit';
    if (hostname.includes('smogon')) return 'Smogon';
    if (hostname.includes('marriland')) return 'Marriland';
    if (hostname.includes('serebii')) return 'Serebii';
    if (hostname.includes('bulbapedia')) return 'Bulbapedia';
    if (hostname.includes('pikalytics')) return 'Pikalytics';
    if (hostname.includes('limitlessv')) return 'Limitless';
    if (hostname.includes('victoryroad')) return 'Victory Road';
    // Unknown hostname: return null instead of promoting a domain prefix to a
    // first-class source. The front-end filter chips iterate unique r.source
    // values; returning null keeps unknown-host recipes from polluting them.
    return null;
  } catch {
    return null;
  }
}

module.exports = { extractTags, inferSource };
