#!/usr/bin/env node
/**
 * Retroactively re-extract `source` and `tags` for every recipe in Firestore.
 *
 * Why: prior to this script, `inferSource` returned bogus domain-prefix fallback
 * strings (e.g. "ogeneo", "petrol") and `extractTags` used substring matching
 * that produced false hits like "ou" for any text containing "about". This
 * script rewrites both fields using the fixed extractors from
 * src/commands/recipes.js.
 *
 * Usage:
 *   node scripts/retag-recipes.js           # dry run — logs changes, writes nothing
 *   node scripts/retag-recipes.js --write   # apply changes
 *
 * Requires the same Firebase env vars as the main bot (FIREBASE_PROJECT_ID,
 * FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY).
 */

require('dotenv').config();
const admin = require('firebase-admin');
const { extractTags, inferSource } = require('../src/recipes/extractors');

const WRITE = process.argv.includes('--write');

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

  const snap = await db.collection('recipes').get();
  console.log(`Scanning ${snap.size} recipes...`);

  const changes = []; // { id, newTags, newSource }
  let unchangedCount = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const textForTags = [data.title, data.description].filter(Boolean).join(' ');
    const newTags = extractTags(textForTags);
    const newSource = data.url ? inferSource(data.url) : null;

    // Normalize both sides: legacy docs may have source undefined, and the
    // extractor now returns null for unknown hosts — treat those as equal.
    const oldSource = data.source ?? null;
    const tagsChanged = !arraysEqual(data.tags, newTags);
    const sourceChanged = oldSource !== newSource;

    if (!tagsChanged && !sourceChanged) {
      unchangedCount++;
      continue;
    }

    console.log(
      `[${doc.id.slice(0, 8)}] ${data.title?.slice(0, 50) ?? '<no title>'}`,
    );
    if (sourceChanged) {
      console.log(`  source: ${JSON.stringify(oldSource)} → ${JSON.stringify(newSource)}`);
    }
    if (tagsChanged) {
      console.log(`  tags: ${JSON.stringify(data.tags)} → ${JSON.stringify(newTags)}`);
    }

    changes.push({ id: doc.id, newTags, newSource });
  }

  console.log('');
  console.log(`Total: ${snap.size}`);
  console.log(`Changed: ${changes.length}`);
  console.log(`Unchanged: ${unchangedCount}`);

  if (!WRITE) {
    console.log(`(dry run — re-run with --write to apply)`);
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
    console.log(`Failed: ${failedCount}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Failed:', err);
    process.exit(1);
  });
