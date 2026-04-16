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

  // Single-word keywords matched with \b word boundaries.
  const singleWordKeywords = {
    // Topics
    travel: 'travel', flight: 'travel', flights: 'travel', trip: 'travel',
    finance: 'finance', tax: 'finance', taxes: 'finance', money: 'finance', budget: 'finance', expense: 'finance',
    food: 'food', recipe: 'food', restaurant: 'food',
    music: 'music', playlist: 'music', song: 'music',
    research: 'research', study: 'research',
    game: 'games', games: 'games', puzzle: 'games',
    code: 'coding', coding: 'coding', dev: 'coding', developer: 'coding', frontend: 'coding', backend: 'coding',
    health: 'health', fitness: 'health', wellness: 'health',
    news: 'news',
    shop: 'shopping', shopping: 'shopping',
    learn: 'education', education: 'education', learning: 'education',
    productivity: 'productivity',
    social: 'social', instagram: 'social',
    entertainment: 'entertainment', movie: 'entertainment', tv: 'entertainment',
    // Functions
    search: 'search', find: 'search',
    monitor: 'monitoring', monitoring: 'monitoring', watch: 'monitoring',
    summary: 'summarizer', summarize: 'summarizer', summarizer: 'summarizer',
    track: 'tracker', tracker: 'tracker', tracking: 'tracker',
    lookup: 'lookup', check: 'lookup',
    automate: 'automation', automation: 'automation',
    notify: 'notification', notification: 'notification', alert: 'notification',
    assistant: 'assistant', helper: 'assistant',
    integration: 'integration', integrate: 'integration',
    // Services
    gmail: 'gmail', email: 'gmail',
    icloud: 'icloud',
    notion: 'notion',
    linear: 'linear',
    github: 'github', git: 'github',
    tripit: 'tripit',
    spotify: 'spotify',
    youtube: 'youtube',
    reddit: 'reddit',
    mcp: 'mcp',
    // Behavior
    proactive: 'proactive',
    scheduled: 'scheduled', daily: 'scheduled', weekly: 'scheduled',
  };

  // Phrase keywords — match as substrings, emit canonical forms.
  const phraseKeywords = {
    'google calendar': 'google-calendar',
    'google cal': 'google-calendar',
    'apple music': 'apple-music',
    'on demand': 'on-demand',
    'on-demand': 'on-demand',
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
    const domainMatch = (domain) => hostname === domain || hostname.endsWith('.' + domain);
    if (domainMatch('poke.com')) return 'Poke';
    if (domainMatch('github.com')) return 'GitHub';
    if (domainMatch('docs.google.com')) return 'Google Docs';
    if (domainMatch('youtube.com') || domainMatch('youtu.be')) return 'YouTube';
    if (domainMatch('reddit.com')) return 'Reddit';
    if (domainMatch('notion.so') || domainMatch('notion.site')) return 'Notion';
    if (domainMatch('pastebin.com')) return 'Pastebin';
    // Unknown hostname: return null instead of promoting a domain prefix to a
    // first-class source. The front-end filter chips iterate unique r.source
    // values; returning null keeps unknown-host recipes from polluting them.
    return null;
  } catch {
    return null;
  }
}

module.exports = { extractTags, inferSource };
