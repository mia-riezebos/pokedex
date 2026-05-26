# Changelog

## [2.11.0] - 2026-05-25

### Added
- `/addcontext <text>` slash command and right-click **Add to Pokedex context** message action — add extra info to a filed report after Pokedex stops asking. Both append to the issue's `additionalContext` and refresh the triage embed in place.
- `/backfill-numbers` admin slash command — assigns ticket #s to open issues that don't have one yet (using the same sequential counter) and re-renders their triage embeds.

### Changed
- Triage embed title now leads with the ticket # (`#1234 — <summary>`). Issue ID stays in the footer untouched, so existing links and lookups still work.
- When Pokedex hits the 3-question cap, it now sends an explicit notice ("That's all the questions I'll ask — filing your report now. If you remember more later, run `/addcontext`…") before posting the closing receipt.

### Internal
- New `additionalContext: [{ text, authorId, authorName, addedAt, sourceMessageId }]` field on issue documents, rendered as a `📝 Additional Context` field in the triage embed (most-recent first, capped at 1024 chars).
- Extracted pure helpers: `buildTurnCapNotice` (receipt.js), `normalizeAdditionalContextText` / `buildTriageRefreshPayload` (addContext.js), and `backfillMissingIssueNumbers` (issueNumberBackfill.js).

## [2.10.1] - 2026-05-25

### Fixed
- MCP **Approve** button now works. Approving a pending MCP-reported issue threw "Failed to process MCP issue." because the triage message was sent with double-nested `components` (`[buildTriageButtons()]` instead of `buildTriageButtons()`); Discord couldn't serialize it. Decline was unaffected because it never posts to triage.

## [2.10.0] - 2026-05-22

### Added
- `/exclude` command (`last N`, `on`, `off`, `status`, `clear`) and a right-click **Exclude from Pokedex** message action — keep mod/bystander chatter out of a report's context.
- Sequential ticket numbers (`#1234`) on every issue, including MCP-reported ones; shown in triage embeds and the closing receipt.
- Structured closing receipt so the reporter knows a ticket was filed and what the team will see.
- Multi-bug splitting — distinct bugs in one thread become separate tickets.

### Changed
- Triage conversation is now author-aware: only the original reporter's messages count as bug info; anyone may still chime in, and the bot stays silent toward non-reporters (mods, bystanders) so their chatter doesn't pollute the ticket.
- Pokedex identifies itself as a bot on its first message, asks at most three one-at-a-time questions, never asks the user to self-diagnose, and exits to file the report on frustration signals.

### Internal
- Code-enforced question-turn counter, regex frustration classifier, structured sufficiency extraction, and a sequential-counter Firestore transaction.

## [2.9.0] - 2026-04-25

### Added
- Screenshot reading via vision — agent extracts visible error text, screen, and app state from image attachments into `evidence.screenshot_text`.
- Tool-using agent triage loop with three tools: `search_issues`, `get_poke_status`, `read_channel_context`.
- Capability-gap backlog in `#pokedex-testing` — agent-detected gaps are deduped, reposted with counts, and @-mention the owner at 1/3/10/50 occurrences.
- Auto-resolve when the reporter says "solved"/"fixed"/etc. in an issue thread (reporter-only; unambiguous phrasing only).
- Smart thread replies — replaces blanket ✅ reactions with `responseMode: ignore | react | reply`.
- Mention-reply parent context — when a mention is a reply to another user's message, the parent content is what gets classified.
- Early-exit on casual-chatter mentions and direct questions to the bot (no issue created, optional short help reply).
- `target`-based routing: poke.com product bugs → `eng-triage`; Pokedex-self bugs and feature requests → `#pokedex-testing`.
- `node --test` harness; unit tests for agent tools, capability-gap dedup, target routing, rate limiting, auto-resolve, mention parent context.

### Changed
- `/pokedexbug` now runs through the agent for richer classification (screenshot reading, capability gaps) while preserving user-selected priority and category.
- Issue schema gains `target`, `evidence`, `agentMeta`, `lastEvaluatedAt`, and resolution fields (`resolvedAt`, `resolvedBy`, `resolvedReason`).
- Forum and non-forum thread paths are unified through one evaluator.

### Config
- `pokedex_owner_id` (default `null`; set via `POKEDEX_OWNER_ID` env var or `/config set pokedex_owner_id <discord-user-id>`)
- `pokedex_self_channel` (default `"pokedex-testing"`)
- `agent_enabled` (default `true`; set `false` to roll back to single-shot classification)
- `agent_max_tool_calls` (default `5`)
- `agent_max_replies_per_thread_per_10m` (default `3`)

All new keys are settable via `/config set` autocomplete.

## [2.5.1] - 2026-04-14

### Added
- **`/pokedexbug`** — new slash command for reporting bugs against Pokedex directly from Discord. Accepts a title, description, optional priority (critical/high/medium/low), category (bug/performance/security/ux_issue/infrastructure/other), and screenshot attachment. Reports flow through the existing Firestore issues pipeline and are posted to the eng-triage channel.

## [2.4.0] - 2026-03-25

### Added
- **AI-powered duplicate detection** — OpenRouter-based semantic matching replaces simple word overlap (Jaccard) as the primary duplicate detector. Jaccard remains as a fast pre-filter.
- **`/feedback-triage reorganize`** — new subcommand that scans all open issues for duplicate clusters using AI and auto-merges them (reporters, context, attachments, thread links).
- **Forum trigger duplicate check** — new feedback posts in #feedback are now checked against existing open issues before creating a new one. If a duplicate is found, the post is merged into the existing issue and the user is notified.
- `findDuplicateAI()` — single-issue AI duplicate detection against existing open issues (70% confidence threshold).
- `findDuplicateClustersAI()` — batch AI duplicate detection that identifies all duplicate groups across open issues.

### Changed
- `/feedback-triage run` now falls back to AI duplicate detection when Jaccard finds no match.
- `/feedback-triage scrape` now falls back to AI duplicate detection when Jaccard finds no match.
- `pipeline.js` issue processing now uses AI duplicate detection as fallback.

## [2.3.0] and earlier

See git history for previous changes.
