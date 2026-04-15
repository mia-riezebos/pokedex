const { getConfig } = require('../config/config');
const { extractTags: fallbackExtractTags } = require('../recipes/extractors');

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

const CANONICAL_TAGS = [
  // Format
  'vgc', 'ou', 'uu', 'ru', 'nu', 'pu', 'ubers', 'lc', 'monotype', 'doubles', 'singles',
  // Generation
  'gen-9', 'gen-8', 'gen-7', 'gen-6',
  // Regulation
  'reg-f', 'reg-g', 'reg-h',
  // Weather
  'rain', 'sun', 'sand', 'snow',
  // Archetype
  'hyper-offense', 'balance', 'bulky-offense', 'stall', 'trick-room', 'tailwind', 'screens', 'weather',
  // Tempo / role
  'setup', 'lead', 'pivot', 'wallbreaker', 'sweeper', 'tank',
  // Misc
  'tournament', 'ladder', 'showdown', 'rmt',
];

const CANONICAL_TAG_SET = new Set(CANONICAL_TAGS);

function buildSystemPrompt() {
  return `You are Pokedex, a recipe classifier for a Pokemon competitive battling community.

Your job: read a recipe (a shared team or strategy) and assign 3–6 tags from this fixed vocabulary:

${CANONICAL_TAGS.join(', ')}

Rules:
- Pick ONLY tags from the list above. Do not invent new tags.
- Pick tags that accurately describe the recipe. If you cannot confidently assign a tag, don't include it.
- Prefer specificity: if a recipe is clearly VGC Reg G, include both "vgc" and "reg-g".
- Return 3–6 tags. Never return more than 6. Return 0 if the recipe is truly untaggable.

Return ONLY valid JSON:
{
  "tags": ["tag1", "tag2", "tag3"]
}`;
}

function fallbackTags(title, description) {
  const text = [title, description].filter(Boolean).join(' ');
  return [...fallbackExtractTags(text)].sort();
}

/**
 * Generate 0-6 canonical tags for a recipe using OpenRouter.
 * Falls back to keyword-based extractTags on any API/parsing failure.
 * Returned array is sorted alphabetically for stable rendering.
 *
 * @param {{ title?: string, description?: string, url?: string, source?: string }} param0
 * @returns {Promise<string[]>}
 */
async function generateRecipeTags({ title, description, url, source }) {
  const model = getConfig('model');

  const userContent = [
    `Title: ${title || 'unknown'}`,
    `Description: ${description || 'none'}`,
    `URL: ${url || 'none'}`,
    `Source: ${source || 'unknown'}`,
  ].join('\n');

  try {
    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://poke.com',
        'X-Title': 'Pokedex Recipe Tagger',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: buildSystemPrompt() },
          { role: 'user', content: userContent },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      console.error(`[recipeTagger] OpenRouter error ${response.status}, falling back to keyword extraction`);
      return fallbackTags(title, description);
    }

    const data = await response.json();
    let content = data.choices?.[0]?.message?.content?.trim() ?? '';
    if (content.startsWith('```')) {
      content = content.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      console.error('[recipeTagger] failed to parse LLM response as JSON, falling back');
      return fallbackTags(title, description);
    }

    if (!parsed || !Array.isArray(parsed.tags)) {
      console.error('[recipeTagger] LLM response missing tags array, falling back');
      return fallbackTags(title, description);
    }

    // Filter to canonical vocabulary only, cap at 6, dedupe, sort alphabetically
    const clean = [...new Set(
      parsed.tags
        .filter((t) => typeof t === 'string')
        .map((t) => t.trim().toLowerCase())
        .filter((t) => CANONICAL_TAG_SET.has(t))
    )].slice(0, 6).sort();

    // If nothing survived filtering, try fallback — AI produced only junk
    if (clean.length === 0) {
      return fallbackTags(title, description);
    }

    return clean;
  } catch (err) {
    console.error('[recipeTagger] request failed:', err.message);
    return fallbackTags(title, description);
  }
}

module.exports = { generateRecipeTags, CANONICAL_TAGS };
