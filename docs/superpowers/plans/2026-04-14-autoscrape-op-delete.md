# Auto-Scrape Recipes + OP Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically scrape new #show-and-tell forum posts for recipe URLs, and allow the original poster to delete their own recipes via command and button.

**Architecture:** Two independent features. Feature 1 adds a new trigger (`src/triggers/autoscrape.js`) that hooks into `threadCreate` in `index.js` and reuses recipe helpers exported from `recipes.js`. Feature 2 adds a `delete` subcommand to the existing `/recipes` command and modifies the button permission check in `index.js` to allow OPs.

**Tech Stack:** discord.js 14, Firebase/Firestore, Node.js CommonJS

---

### Task 1: Export recipe helpers from `recipes.js`

**Files:**
- Modify: `src/commands/recipes.js:1055` (module.exports)

The autoscrape trigger needs access to helper functions that are currently internal to `recipes.js`. Export them without changing any logic.

- [ ] **Step 1: Update module.exports to include helpers**

In `src/commands/recipes.js`, change the existing exports line:

```javascript
// OLD:
module.exports = { data: commandData, execute, handleRecipeButton, autocomplete };

// NEW:
module.exports = {
  data: commandData, execute, handleRecipeButton, autocomplete,
  // Exported for autoscrape trigger
  extractLinks, normalizeUrl, inferSource, extractTags, extractTitleFromMessage,
  extractTitleFromUrl, fetchPageTitle, cleanDescription, getPokeCode, isPokeLink,
  isDuplicateRecipe, findApprovalChannel, postApprovalEmbed,
};
```

- [ ] **Step 2: Verify the bot still starts**

Run: `node -e "require('./src/commands/recipes.js')"`
Expected: No errors, module loads successfully.

- [ ] **Step 3: Commit**

```bash
git add src/commands/recipes.js
git commit -m "refactor: export recipe helpers for autoscrape trigger"
```

---

### Task 2: Add autoscrape config defaults

**Files:**
- Modify: `config.json`

- [ ] **Step 1: Add default config values**

Add to `config.json`:

```json
{
  "model": "anthropic/claude-sonnet-4",
  "triage_channel": "eng-triage",
  "emoji_trigger": "🐛",
  "suggestion_emoji": "💡",
  "output_mode": "embed",
  "acknowledge": true,
  "summary_interval": "daily",
  "priorities": ["critical", "high", "medium", "low"],
  "categories": ["bug", "feature_request", "ux_issue", "performance", "security", "suggestion", "other"],
  "level_announce": true,
  "feedback_forum": "feedback",
  "autoscrape_recipes_enabled": false,
  "autoscrape_recipes_auto_approve": false
}
```

- [ ] **Step 2: Commit**

```bash
git add config.json
git commit -m "config: add autoscrape recipe defaults"
```

---

### Task 3: Create the autoscrape trigger

**Files:**
- Create: `src/triggers/autoscrape.js`

This trigger is called on `threadCreate`. It checks config, verifies the thread is in a #show-and-tell forum, extracts URLs from the starter message, and creates recipe entries.

- [ ] **Step 1: Create `src/triggers/autoscrape.js`**

```javascript
const { ChannelType } = require('discord.js');
const { getConfig } = require('../config/config');
const firestore = require('../services/firestore');
const {
  extractLinks, normalizeUrl, inferSource, extractTags,
  extractTitleFromMessage, fetchPageTitle, isPokeLink, extractTitleFromUrl,
  cleanDescription, getPokeCode, isDuplicateRecipe, findApprovalChannel,
  postApprovalEmbed,
} = require('../commands/recipes');

const STARTER_MSG_RETRIES = 3;
const STARTER_MSG_DELAY_MS = 2000;

async function handleAutoScrape(thread) {
  // Check if autoscrape is enabled
  const enabled = getConfig('autoscrape_recipes_enabled');
  if (!enabled) return;

  // Only handle forum channel threads
  if (!thread.parent || thread.parent.type !== ChannelType.GuildForum) return;

  // Check if this is a show-and-tell forum
  const parentName = thread.parent.name.toLowerCase();
  if (!parentName.includes('show-and-tell')) return;

  // Fetch starter message with retries (same pattern as forum.js)
  let starterMessage = null;
  for (let i = 0; i < STARTER_MSG_RETRIES; i++) {
    try {
      starterMessage = await thread.fetchStarterMessage();
      if (starterMessage) break;
    } catch {
      // May not be available yet
    }
    await new Promise(resolve => setTimeout(resolve, STARTER_MSG_DELAY_MS));
  }

  if (!starterMessage || !starterMessage.content?.trim()) {
    return;
  }

  const text = starterMessage.content.trim();
  const urls = extractLinks(text);
  if (urls.length === 0) return;

  const autoApprove = getConfig('autoscrape_recipes_auto_approve') || false;

  // Pre-fetch existing recipes for duplicate detection
  const allExisting = await firestore.getAllRecipes(1000);
  const existingUrls = new Set(allExisting.map(r => normalizeUrl(r.url)));
  const existingCodes = new Set(allExisting.map(r => r.referCode).filter(Boolean));

  // Find approval channel (only needed if not auto-approving)
  let approvalChannel = null;
  if (!autoApprove) {
    approvalChannel = findApprovalChannel(thread.guild);
    if (!approvalChannel) {
      console.warn('Auto-scrape: no approval channel found, skipping pending recipes');
      return;
    }
  }

  // Resolve the poster's name
  let posterName = 'unknown';
  try {
    const member = await thread.guild.members.fetch(thread.ownerId);
    posterName = member.user.username;
  } catch {
    posterName = starterMessage.author?.username || 'unknown';
  }

  // Resolve forum tags
  const availableTags = thread.parent.availableTags || [];
  const forumTags = (thread.appliedTags || []).map(tagId => {
    const tag = availableTags.find(t => t.id === tagId);
    return tag?.name?.toLowerCase() || null;
  }).filter(Boolean);

  let added = 0;

  for (const url of urls) {
    const referCode = getPokeCode(url);

    // Skip duplicates
    if (isDuplicateRecipe(url, referCode, existingUrls, existingCodes)) {
      continue;
    }

    // Build title
    let title = thread.name || extractTitleFromMessage(text, url);
    if (isPokeLink(url) && title === extractTitleFromUrl(url)) {
      const fetched = await fetchPageTitle(url);
      if (fetched) title = fetched;
    }

    const recipe = {
      url,
      title,
      description: cleanDescription(text, url),
      referCode,
      sharedBy: [{ id: thread.ownerId, name: posterName, sharedAt: new Date().toISOString() }],
      channelId: thread.parentId,
      channelName: thread.parent.name,
      guildId: thread.guild.id,
      threadId: thread.id,
      messageId: starterMessage.id,
      source: inferSource(url),
      tags: [...new Set([...forumTags, ...extractTags(text)])],
      status: autoApprove ? 'approved' : 'pending',
    };

    if (autoApprove) {
      recipe.reviewedBy = 'Auto-Scrape';
      recipe.reviewedById = null;
    }

    const saved = await firestore.saveRecipe(recipe);
    added++;

    // Track for subsequent URLs in this same message
    existingUrls.add(normalizeUrl(url));
    if (referCode) existingCodes.add(referCode);

    // Post approval embed if not auto-approving
    if (!autoApprove && approvalChannel) {
      await postApprovalEmbed(approvalChannel, recipe, saved.id);
    }
  }

  if (added > 0) {
    console.log(`Auto-scrape: added ${added} recipe(s) from #${thread.parent.name} post "${thread.name}"`);
  }
}

module.exports = { handleAutoScrape };
```

- [ ] **Step 2: Verify the module loads**

Run: `node -e "require('./src/triggers/autoscrape.js')"`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/triggers/autoscrape.js
git commit -m "feat: add autoscrape trigger for show-and-tell recipes"
```

---

### Task 4: Wire autoscrape trigger into `index.js`

**Files:**
- Modify: `src/index.js:9` (imports) and `src/index.js:154-160` (threadCreate handler)

- [ ] **Step 1: Add the import**

After line 9 (`const { handleForumPost } = require('./triggers/forum');`), add:

```javascript
const { handleAutoScrape } = require('./triggers/autoscrape');
```

- [ ] **Step 2: Add the trigger call in `threadCreate`**

Change the `threadCreate` handler from:

```javascript
client.on('threadCreate', async (thread) => {
  try {
    await handleForumPost(thread);
  } catch (err) {
    console.error('Error handling forum post:', err);
  }
});
```

To:

```javascript
client.on('threadCreate', async (thread) => {
  try {
    await handleForumPost(thread);
  } catch (err) {
    console.error('Error handling forum post:', err);
  }

  try {
    await handleAutoScrape(thread);
  } catch (err) {
    console.error('Error in recipe auto-scrape:', err);
  }
});
```

- [ ] **Step 3: Verify the bot module loads**

Run: `node -e "require('./src/index.js')" 2>&1 | head -5`
Expected: Should attempt startup (may fail on missing env vars, that's OK — no syntax errors).

- [ ] **Step 4: Commit**

```bash
git add src/index.js
git commit -m "feat: wire autoscrape trigger into threadCreate event"
```

---

### Task 5: Create the `/autoscrape` slash command

**Files:**
- Create: `src/commands/autoscrape.js`

- [ ] **Step 1: Create `src/commands/autoscrape.js`**

```javascript
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { getConfig, setConfigOverride } = require('../config/config');

const commandData = new SlashCommandBuilder()
  .setName('autoscrape')
  .setDescription('Configure automatic recipe scraping')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .addSubcommand(sub =>
    sub.setName('recipes')
      .setDescription('Toggle automatic recipe scraping from #show-and-tell')
      .addBooleanOption(opt =>
        opt.setName('enabled')
          .setDescription('Enable or disable auto-scraping')
          .setRequired(true))
      .addBooleanOption(opt =>
        opt.setName('auto_approve')
          .setDescription('Skip approval workflow — publish directly (default: false)')
          .setRequired(false)));

async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  if (sub === 'recipes') return executeRecipes(interaction);
  return interaction.reply({ content: 'Unknown subcommand.', ephemeral: true });
}

async function executeRecipes(interaction) {
  const enabled = interaction.options.getBoolean('enabled');
  const autoApprove = interaction.options.getBoolean('auto_approve');

  await setConfigOverride('autoscrape_recipes_enabled', enabled, interaction.user.id);

  if (autoApprove !== null) {
    await setConfigOverride('autoscrape_recipes_auto_approve', autoApprove, interaction.user.id);
  }

  const currentAutoApprove = autoApprove !== null
    ? autoApprove
    : (getConfig('autoscrape_recipes_auto_approve') || false);

  const embed = new EmbedBuilder()
    .setTitle('Auto-Scrape Recipes')
    .setColor(enabled ? 0x2ecc71 : 0xf43f5e)
    .setDescription(
      enabled
        ? 'Auto-scrape is now **enabled**. New #show-and-tell posts will be automatically checked for recipe links.'
        : 'Auto-scrape is now **disabled**.'
    )
    .addFields(
      { name: 'Enabled', value: enabled ? 'Yes' : 'No', inline: true },
      { name: 'Auto-Approve', value: currentAutoApprove ? 'Yes (skip approval)' : 'No (requires approval)', inline: true },
    )
    .setFooter({ text: `Updated by ${interaction.user.username}` })
    .setTimestamp();

  return interaction.reply({ embeds: [embed] });
}

module.exports = { data: commandData, execute };
```

- [ ] **Step 2: Verify the module loads**

Run: `node -e "require('./src/commands/autoscrape.js')"`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/commands/autoscrape.js
git commit -m "feat: add /autoscrape recipes slash command"
```

---

### Task 6: Register the `/autoscrape` command in `index.js`

**Files:**
- Modify: `src/index.js:44` (imports), `src/index.js:69` (registerCommands), `src/index.js:251` (command dispatch)

- [ ] **Step 1: Add the import**

After line 44 (`const recipesCommand = require('./commands/recipes');`), add:

```javascript
const autoscrapeCommand = require('./commands/autoscrape');
```

- [ ] **Step 2: Register the command**

In the `registerCommands()` function, add `autoscrapeCommand.data.toJSON()` to the array on line 69. Append it after `recipesCommand.data.toJSON()`:

```javascript
..., recipesCommand.data.toJSON(), autoscrapeCommand.data.toJSON()] },
```

- [ ] **Step 3: Add to command dispatch**

In the `interactionCreate` handler, add `autoscrape: autoscrapeCommand` to both command maps.

In the slash command dispatch map (~line 251):

```javascript
const commands = { config: configCommand, ..., recipes: recipesCommand, autoscrape: autoscrapeCommand };
```

- [ ] **Step 4: Commit**

```bash
git add src/index.js
git commit -m "feat: register /autoscrape command"
```

---

### Task 7: Add `/recipes delete` subcommand

**Files:**
- Modify: `src/commands/recipes.js` (command data, execute, autocomplete)
- Modify: `src/services/firestore.js` (add deleteRecipe function)

- [ ] **Step 1: Add `deleteRecipe` to Firestore service**

In `src/services/firestore.js`, add before the `module.exports`:

```javascript
async function deleteRecipe(recipeId) {
  const db = admin.firestore();
  await db.collection('recipes').doc(recipeId).delete();
}
```

Add `deleteRecipe` to the module.exports object.

- [ ] **Step 2: Add `delete` subcommand to command data**

In `src/commands/recipes.js`, add after the `.addSubcommand` for `approve` (around line 67):

```javascript
  .addSubcommand(sub =>
    sub.setName('delete')
      .setDescription('Delete a recipe you shared')
      .addStringOption(opt =>
        opt.setName('recipe')
          .setDescription('Recipe to delete')
          .setRequired(true)
          .setAutocomplete(true)))
```

- [ ] **Step 3: Add the execute handler**

In `src/commands/recipes.js`, add to the `execute()` function (around line 79):

```javascript
  if (sub === 'delete') return executeDelete(interaction);
```

Add the `executeDelete` function:

```javascript
// --- DELETE (OP or mod) ---

async function executeDelete(interaction) {
  const recipeId = interaction.options.getString('recipe').trim();

  await interaction.deferReply({ ephemeral: true });

  const recipe = await firestore.getRecipeById(recipeId);
  if (!recipe) {
    return interaction.editReply('Recipe not found.');
  }

  // Permission check: OP or mod
  const isOP = recipe.sharedBy?.some(s => s.id === interaction.user.id);
  const isMod = interaction.member.permissions.has(PermissionFlagsBits.ManageMessages);

  if (!isOP && !isMod) {
    return interaction.editReply('You can only delete recipes you shared, or you need **Manage Messages** permission.');
  }

  await firestore.deleteRecipe(recipeId);

  const embed = new EmbedBuilder()
    .setTitle('Recipe Deleted')
    .setColor(0xf43f5e)
    .setDescription(`**${(recipe.title || 'Untitled').slice(0, 80)}** has been deleted.`)
    .addFields(
      { name: 'URL', value: recipe.url.slice(0, 200) },
      { name: 'Deleted By', value: interaction.user.username, inline: true },
    )
    .setTimestamp();

  return interaction.editReply({ embeds: [embed] });
}
```

- [ ] **Step 4: Update autocomplete to support delete subcommand**

Replace the existing `autocomplete` function with:

```javascript
async function autocomplete(interaction) {
  const sub = interaction.options.getSubcommand();
  const focused = interaction.options.getFocused().toLowerCase();

  try {
    if (sub === 'approve') {
      const pending = await firestore.getPendingRecipes(50);
      const filtered = pending
        .filter(r =>
          r.id.toLowerCase().includes(focused) ||
          (r.title || '').toLowerCase().includes(focused) ||
          (r.url || '').toLowerCase().includes(focused) ||
          (r.referCode || '').toLowerCase().includes(focused)
        )
        .slice(0, 25)
        .map(r => ({
          name: `${(r.title || 'Untitled').slice(0, 60)} | ${r.source || '?'} | ${r.id.slice(0, 8)}…`,
          value: r.id,
        }));
      await interaction.respond(filtered);
    } else if (sub === 'delete') {
      const allRecipes = await firestore.getAllRecipes(200);
      const isMod = interaction.member.permissions.has(PermissionFlagsBits.ManageMessages);

      const visible = isMod
        ? allRecipes
        : allRecipes.filter(r => r.sharedBy?.some(s => s.id === interaction.user.id));

      const filtered = visible
        .filter(r =>
          r.id.toLowerCase().includes(focused) ||
          (r.title || '').toLowerCase().includes(focused) ||
          (r.url || '').toLowerCase().includes(focused)
        )
        .slice(0, 25)
        .map(r => ({
          name: `${(r.title || 'Untitled').slice(0, 60)} | ${r.source || '?'} | ${r.status}`,
          value: r.id,
        }));
      await interaction.respond(filtered);
    } else {
      await interaction.respond([]);
    }
  } catch {
    await interaction.respond([]);
  }
}
```

- [ ] **Step 5: Verify the module loads**

Run: `node -e "require('./src/commands/recipes.js')"`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/commands/recipes.js src/services/firestore.js
git commit -m "feat: add /recipes delete subcommand for OP and mods"
```

---

### Task 8: Allow OP to use recipe buttons in `index.js`

**Files:**
- Modify: `src/index.js:475-490` (recipe button handler)

- [ ] **Step 1: Update the recipe button permission check**

Change the recipe button handler from:

```javascript
  // --- Recipe approval buttons ---
  if (customId.startsWith('recipe_')) {
    if (!canModerate(interaction.member)) {
      await interaction.reply({ content: 'You need **Manage Messages** permission to approve or decline recipes.', ephemeral: true }).catch(() => {});
      return;
    }

    try {
      await recipesCommand.handleRecipeButton(interaction);
    } catch (err) {
```

To:

```javascript
  // --- Recipe approval buttons ---
  if (customId.startsWith('recipe_')) {
    // Extract recipe ID from button customId
    const recipeId = customId.replace('recipe_approve_', '').replace('recipe_decline_', '').replace('recipe_delete_', '');
    const isDeleteAction = customId.startsWith('recipe_delete_');

    // For delete: allow OP or mods. For approve/decline: mods only.
    if (isDeleteAction) {
      let allowed = canModerate(interaction.member);
      if (!allowed) {
        try {
          const recipe = await firestore.getRecipeById(recipeId);
          if (recipe?.sharedBy?.some(s => s.id === interaction.user.id)) {
            allowed = true;
          }
        } catch {}
      }
      if (!allowed) {
        await interaction.reply({ content: 'You can only delete recipes you shared, or you need **Manage Messages** permission.', ephemeral: true }).catch(() => {});
        return;
      }
    } else if (!canModerate(interaction.member)) {
      await interaction.reply({ content: 'You need **Manage Messages** permission to approve or decline recipes.', ephemeral: true }).catch(() => {});
      return;
    }

    try {
      await recipesCommand.handleRecipeButton(interaction);
    } catch (err) {
```

- [ ] **Step 2: Add delete button to approval embeds**

In `src/commands/recipes.js`, update the `postApprovalEmbed` function's button row to include a delete button. Change:

```javascript
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`recipe_approve_${recipeId}`)
      .setLabel('Approve')
      .setStyle(ButtonStyle.Success)
      .setEmoji('✅'),
    new ButtonBuilder()
      .setCustomId(`recipe_decline_${recipeId}`)
      .setLabel('Decline')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('❌'),
  );
```

To:

```javascript
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`recipe_approve_${recipeId}`)
      .setLabel('Approve')
      .setStyle(ButtonStyle.Success)
      .setEmoji('✅'),
    new ButtonBuilder()
      .setCustomId(`recipe_decline_${recipeId}`)
      .setLabel('Decline')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('❌'),
    new ButtonBuilder()
      .setCustomId(`recipe_delete_${recipeId}`)
      .setLabel('Delete')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🗑️'),
  );
```

- [ ] **Step 3: Handle the delete button in `handleRecipeButton`**

In `src/commands/recipes.js`, update `handleRecipeButton` to handle the delete action. Change:

```javascript
async function handleRecipeButton(interaction) {
  const { customId } = interaction;
  const isApprove = customId.startsWith('recipe_approve_');
  const recipeId = customId.replace('recipe_approve_', '').replace('recipe_decline_', '');
```

To:

```javascript
async function handleRecipeButton(interaction) {
  const { customId } = interaction;
  const isApprove = customId.startsWith('recipe_approve_');
  const isDelete = customId.startsWith('recipe_delete_');
  const recipeId = customId.replace('recipe_approve_', '').replace('recipe_decline_', '').replace('recipe_delete_', '');

  if (isDelete) {
    const recipe = await firestore.getRecipeById(recipeId);
    if (!recipe) {
      return interaction.reply({ content: 'Recipe not found.', ephemeral: true });
    }
    await firestore.deleteRecipe(recipeId);

    const embed = EmbedBuilder.from(interaction.message.embeds[0]);
    embed.setTitle('🗑️ Recipe Deleted');
    embed.setColor(0x95a5a6);
    embed.addFields({
      name: 'Deleted By',
      value: `${interaction.user.username} — <t:${Math.floor(Date.now() / 1000)}:R>`,
    });

    const disabledRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`recipe_approve_${recipeId}`)
        .setLabel('Approve')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅')
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(`recipe_decline_${recipeId}`)
        .setLabel('Decline')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('❌')
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(`recipe_delete_${recipeId}`)
        .setLabel('Delete')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🗑️')
        .setDisabled(true),
    );

    return interaction.update({ embeds: [embed], components: [disabledRow] });
  }
```

- [ ] **Step 4: Also add disabled delete button in the existing approve/decline handler's disabled row**

In the existing `handleRecipeButton`, the disabled row after approve/decline only has 2 buttons. Update to include the delete button. Change:

```javascript
  const disabledRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`recipe_approve_${recipeId}`)
      .setLabel('Approve')
      .setStyle(ButtonStyle.Success)
      .setEmoji('✅')
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`recipe_decline_${recipeId}`)
      .setLabel('Decline')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('❌')
      .setDisabled(true),
  );
```

To:

```javascript
  const disabledRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`recipe_approve_${recipeId}`)
      .setLabel('Approve')
      .setStyle(ButtonStyle.Success)
      .setEmoji('✅')
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`recipe_decline_${recipeId}`)
      .setLabel('Decline')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('❌')
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`recipe_delete_${recipeId}`)
      .setLabel('Delete')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🗑️')
      .setDisabled(true),
  );
```

- [ ] **Step 5: Commit**

```bash
git add src/index.js src/commands/recipes.js
git commit -m "feat: add OP delete button on recipe approval embeds"
```

---

### Task 9: Final verification

**Files:** All modified files

- [ ] **Step 1: Verify no syntax errors in all changed files**

Run:
```bash
node -e "require('./src/commands/recipes.js'); require('./src/commands/autoscrape.js'); require('./src/triggers/autoscrape.js'); console.log('All modules load OK')"
```

Expected: `All modules load OK`

- [ ] **Step 2: Verify index.js loads (will fail on missing env but no syntax errors)**

Run:
```bash
node -c src/index.js
```

Expected: No syntax errors.

- [ ] **Step 3: Review all changes**

Run: `git diff main --stat`

Expected files changed:
- `config.json` — 2 new lines
- `src/commands/autoscrape.js` — new file
- `src/commands/changelog.js` — version bump + new entry
- `src/commands/recipes.js` — exports, delete subcommand, delete button, autocomplete
- `src/index.js` — import + threadCreate hook + command registration + button permission
- `src/services/firestore.js` — deleteRecipe function
- `src/triggers/autoscrape.js` — new file
- `package.json` — version bump

- [ ] **Step 4: Final commit if any loose changes**

```bash
git status
```
