# Auto-Scrape Recipes + OP Delete Recipe

**Date**: 2026-04-14
**Status**: Approved

## Overview

Two new features for the recipe system:
1. **Auto-scrape**: Automatically detect and process recipe URLs from new #show-and-tell forum posts, eliminating the need for manual `/recipes scrape`.
2. **OP delete**: Allow the original poster to delete their own recipe via slash command and button.

## Feature 1: Auto-Scrape Recipes

### Slash Command

`/autoscrape recipes` with options:
- `enabled` (boolean, required) — toggle auto-scraping on/off
- `auto_approve` (boolean, optional, default: false) — if true, new recipes skip approval and go straight to `approved` status

Requires `ManageMessages` permission.

### Config Storage

Two Firestore config keys (via existing config system):
- `autoscrape_recipes_enabled` (boolean)
- `autoscrape_recipes_auto_approve` (boolean)

### Trigger: `src/triggers/autoscrape.js`

**Entry point**: Called from `index.js` on `threadCreate` event, after the existing `handleForumPost()` call.

**Flow**:
1. Check `autoscrape_recipes_enabled` config — return early if false
2. Check if the thread's parent channel name contains "show-and-tell" — return early if not
3. Fetch the thread's starter message (with retries, same pattern as `forum.js`)
4. Extract URLs using existing `extractLinks()` from `recipes.js`
5. For each URL:
   a. Normalize via `normalizeUrl()`
   b. Check Firestore for existing recipe (SHA256 of normalized URL)
   c. If duplicate: skip silently
   d. If new: create recipe document with status based on `autoscrape_recipes_auto_approve`
   e. If pending: post approval embed to #recipe-approval channel
   f. If auto-approved: save directly, no approval embed needed
6. Log activity (console.log, matching existing patterns)

**Reused from `recipes.js`**: `extractLinks()`, `normalizeUrl()`, `inferSource()`, `extractTags()`, `fetchPageTitle()`, `extractTitleFromMessage()`, approval embed building logic.

These helpers need to be exported from `recipes.js` (currently internal functions).

### index.js Changes

In the `threadCreate` handler (around line 154), add a call to the auto-scrape trigger after the existing forum post handler:
```javascript
// Existing
handleForumPost(thread);
// New
handleAutoScrape(thread);
```

## Feature 2: OP Delete Recipe

### Slash Command: `/recipes delete`

New subcommand on the existing `/recipes` command.

- Takes a `recipe` option (string, required, autocomplete)
- Autocomplete filters to recipes where `sharedBy` array contains the calling user's ID
- Users with `ManageMessages` see all recipes in autocomplete
- Deletes recipe document from Firestore
- Confirms deletion with an ephemeral reply

### Button: OP Delete on Approval Embed

The existing recipe approval embed already has a `recipe_delete_<id>` button (mod-only). Modify the permission check in `index.js` button handler to also allow the original poster:

**Permission logic**:
- User has `ManageMessages` permission → allowed
- User ID matches `sharedBy[0].id` on the recipe → allowed
- Otherwise → denied with ephemeral "you don't have permission" message

### Firestore Changes

None. The `sharedBy` array already tracks who shared each recipe. `sharedBy[0].id` is the original poster.

## Files to Create

- `src/triggers/autoscrape.js` — auto-scrape trigger handler
- `src/commands/autoscrape.js` — `/autoscrape recipes` slash command

## Files to Modify

- `src/index.js` — add autoscrape trigger call in `threadCreate`, update recipe button permission check
- `src/commands/recipes.js` — export helper functions, add `delete` subcommand + autocomplete support
- `config.json` — add default values for `autoscrape_recipes_enabled: false` and `autoscrape_recipes_auto_approve: false`

## Out of Scope

- Auto-scrape for non-forum channels (text channels) — only forum threads
- Batch retroactive scraping on enable — use existing `/recipes scrape` for that
- Notifications to OP when their recipe is approved/declined
