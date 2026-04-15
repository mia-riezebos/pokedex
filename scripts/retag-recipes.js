#!/usr/bin/env node
/**
 * Retroactively re-generate `source` and `tags` for every recipe in Firestore
 * using OpenRouter AI tagging with a canonical ~40-tag vocabulary.
 *
 * Falls back to keyword-based extractTags (from src/recipes/extractors.js) on
 * any OpenRouter failure so the script never fails silently on network errors.
 *
 * Design note: this script intentionally inlines the OpenRouter fetch rather
 * than importing src/services/recipeTagger.js, because recipeTagger.js imports
 * src/config/config.js which pulls in Firebase and the full bot runtime. The
 * script is a standalone migration tool that must not import discord.js or
 * config modules. The model is read from OPENROUTER_MODEL env var (fallback:
 * 'openai/gpt-4o-mini').
 *
 * Usage:
 *   node scripts/retag-recipes.js           # dry run — logs changes, writes nothing
 *   node scripts/retag-recipes.js --write   # apply changes
 *
 * Requires:
 *   FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
 *   OPENROUTER_API_KEY
 *   OPENROUTER_MODEL (optional, defaults to 'openai/gpt-4o-mini')
 */

require('dotenv').config();
const admin = require('firebase-admin');
const { extractTags, inferSource } = require('../src/recipes/extractors');

const WRITE = process.argv.includes('--write');
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';

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

function keywordFallback(title, description) {
  const text = [title, description].filter(Boolean).join(' ');
  return [...extractTags(text)].sort();
}

async function generateTagsForRecipe({ title, description, url, source }) {
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
        'X-Title': 'Pokedex Recipe Tagger (migration)',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: buildSystemPrompt() },
          { role: 'user', content: userContent },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      console.error(`  [OpenRouter] HTTP ${response.status}, using keyword fallback`);
      return keywordFallback(title, description);
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
      console.error('  [OpenRouter] invalid JSON, using keyword fallback');
      return keywordFallback(title, description);
    }

    if (!parsed || !Array.isArray(parsed.tags)) {
      console.error('  [OpenRouter] missing tags array, using keyword fallback');
      return keywordFallback(title, description);
    }

    const clean = [...new Set(
      parsed.tags
        .filter((t) => typeof t === 'string')
        .map((t) => t.trim().toLowerCase())
        .filter((t) => CANONICAL_TAG_SET.has(t))
    )].slice(0, 6).sort();

    if (clean.length === 0) {
      return keywordFallback(title, description);
    }

    return clean;
  } catch (err) {
    console.error(`  [OpenRouter] request failed: ${err.message}, using keyword fallback`);
    return keywordFallback(title, description);
  }
}

function initFirebase() {
  if (admin.apps.length > 0) return;
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

function arraysEqual(a = [], b = []) {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

async function main() {
  initFirebase();
  const db = admin.firestore();

  console.log(WRITE ? '=== WRITE mode ===' : '=== DRY RUN (no changes will be written) ===');
  console.log(`Model: ${MODEL}`);

  const snap = await db.collection('recipes').get();
  console.log(`Scanning ${snap.size} recipes...\n`);

  const changes = [];
  let unchangedCount = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const newSource = data.url ? inferSource(data.url) : null;

    // Rate limit: ~10 req/s
    await new Promise((resolve) => setTimeout(resolve, 100));

    const newTags = await generateTagsForRecipe({
      title: data.title,
      description: data.description,
      url: data.url,
      source: newSource,
    });

    // Normalize both sides: legacy docs may have source undefined
    const oldSource = data.source ?? null;
    const tagsChanged = !arraysEqual(data.tags, newTags);
    const sourceChanged = oldSource !== newSource;

    if (!tagsChanged && !sourceChanged) {
      unchangedCount++;
      continue;
    }

    console.log(`[${doc.id.slice(0, 8)}] ${data.title?.slice(0, 50) ?? '<no title>'}`);
    if (sourceChanged) {
      console.log(`  source: ${JSON.stringify(oldSource)} → ${JSON.stringify(newSource)}`);
    }
    if (tagsChanged) {
      console.log(`  tags:   ${JSON.stringify(data.tags)} → ${JSON.stringify(newTags)}`);
    }

    changes.push({ id: doc.id, newTags, newSource });
  }

  console.log('');
  console.log(`Total:     ${snap.size}`);
  console.log(`Changed:   ${changes.length}`);
  console.log(`Unchanged: ${unchangedCount}`);

  if (!WRITE) {
    console.log(`\n(dry run — re-run with --write to apply)`);
    return;
  }

  // Write phase: commit in batches of 500.
  const BATCH_SIZE = 500;
  let writtenCount = 0;
  let failedCount = 0;

  for (let i = 0; i < changes.length; i += BATCH_SIZE) {
    const slice = changes.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    for (const change of slice) {
      batch.update(db.collection('recipes').doc(change.id), {
        tags: change.newTags,
        source: change.newSource,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    try {
      await batch.commit();
      writtenCount += slice.length;
      console.log(`Batch ${i / BATCH_SIZE + 1}: committed ${slice.length}`);
    } catch (err) {
      console.error(`Batch ${i / BATCH_SIZE + 1} failed:`, err);
      failedCount += slice.length;
    }
  }

  console.log('');
  console.log(`Written: ${writtenCount}`);
  if (failedCount > 0) {
    console.log(`Failed:  ${failedCount}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
