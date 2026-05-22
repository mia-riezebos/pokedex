// MCP tool handler functions.
// Extracted from index.ts so they can be imported directly by tests with
// `firebase-admin` and `fetch` stubbed via vi.mock / vi.stubGlobal.
//
// Each handler is a verbatim move of the body that used to sit inside a
// `server.registerTool(..., async (...) => {...})` call. No behavior changes.
// index.ts now just wires each named handler into the MCP SDK.

import admin from "firebase-admin";
import { z, type ZodObject, type ZodRawShape } from "zod";
import {
  MAX_TITLE_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_COMMENT_LENGTH,
  MAX_CONTEXT_LENGTH,
  MAX_NAME_LENGTH,
  MAX_SEARCH_QUERY_LENGTH,
  filterIssue,
  sanitizeString,
  isValidDocId,
  isValidScreenshotUrl,
} from "./validators.js";
import {
  reportBugShape,
  suggestFeatureShape,
  checkIssueShape,
  myIssuesShape,
  updateIssueShape,
  searchIssuesShape,
  addCommentShape,
  addContextShape,
} from "./schemas.js";
import { checkRateLimit } from "./rateLimit.js";
import { getDb } from "./firebase.js";
import { postToDiscordWebhook, postContextToDiscord } from "./discord.js";

// Parsed-input type helper — gives us the Zod *output* type for a raw shape,
// which correctly accounts for `.default()` values.
type InferInput<Shape extends ZodRawShape> = z.output<ZodObject<Shape>>;

// Allocate the next sequential issue number using a Firestore transaction on
// the shared `counters/issues` doc. The same doc is used by the bot side so
// numbers are globally unique across both creation paths.
async function allocateIssueNumber(db: admin.firestore.Firestore): Promise<number> {
  const ref = db.collection("counters").doc("issues");
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists ? ((snap.data() as { next?: number }).next ?? 0) : 0;
    const next = current + 1;
    tx.set(ref, { next });
    return next;
  });
}

// The shape the MCP SDK expects a tool handler to return.
export type MCPToolResult = {
  content: Array<{ type: "text"; text: string }>;
};

function textResult(payload: unknown): MCPToolResult {
  return { content: [{ type: "text" as const, text: JSON.stringify(payload) }] };
}

function prettyTextResult(payload: unknown): MCPToolResult {
  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}

// --- Tool 1: Report a bug ---
export async function handleReportBug(
  { title, description, priority, category, reporter_name, reporter_id, screenshot_url }: InferInput<typeof reportBugShape>,
): Promise<MCPToolResult> {
  // Rate limit
  const rlKey = `write:${reporter_id || reporter_name}`;
  if (!checkRateLimit(rlKey, true)) {
    return textResult({ error: "Rate limit exceeded. Try again later." });
  }

  // Sanitize inputs
  const safeTitle = sanitizeString(title, MAX_TITLE_LENGTH);
  const safeDesc = sanitizeString(description, MAX_DESCRIPTION_LENGTH);
  const safeName = sanitizeString(reporter_name, MAX_NAME_LENGTH);

  // Spam/quality filter
  const filter = filterIssue(safeTitle, safeDesc);
  if (!filter.pass) {
    return textResult({ error: "rejected", reason: filter.reason });
  }

  const db = getDb();
  const number = await allocateIssueNumber(db);

  const issueData: Record<string, unknown> = {
    messageId: `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    guildId: process.env.DISCORD_GUILD_ID || "mcp",
    channelId: "mcp",
    reporterId: reporter_id || `mcp-${safeName}`,
    reporterName: safeName,
    text: safeDesc,
    priority: priority || "medium",
    category: category || "bug",
    summary: safeTitle,
    reasoning: "Reported via Pokedex MCP agent integration",
    status: "pending",
    source: "mcp",
    number,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (screenshot_url) {
    if (!isValidScreenshotUrl(screenshot_url)) {
      return textResult({ error: "Invalid screenshot URL. Only HTTPS URLs from trusted image hosts are accepted." });
    }
    const safeScreenshotUrl = screenshot_url.trim().slice(0, 2048);
    issueData.attachments = [{
      url: safeScreenshotUrl, name: "screenshot.png", isImage: true,
      contentType: "image/png", size: 0,
    }];
    issueData.screenshotUrl = safeScreenshotUrl;
  }

  const docRef = await db.collection("issues").add(issueData);
  const issueId = docRef.id;

  await postToDiscordWebhook(issueData, issueId);

  return prettyTextResult({
    issueId, status: "created", priority: issueData.priority, category: issueData.category,
    message: `Bug reported successfully. Issue ID: ${issueId}. The engineering team has been notified.`,
  });
}

// --- Tool 2: Suggest a feature ---
export async function handleSuggestFeature(
  { title, description, reporter_name, reporter_id }: InferInput<typeof suggestFeatureShape>,
): Promise<MCPToolResult> {
  // Rate limit
  const rlKey = `write:${reporter_id || reporter_name}`;
  if (!checkRateLimit(rlKey, true)) {
    return textResult({ error: "Rate limit exceeded. Try again later." });
  }

  // Sanitize inputs
  const safeTitle = sanitizeString(title, MAX_TITLE_LENGTH);
  const safeDesc = sanitizeString(description, MAX_DESCRIPTION_LENGTH);
  const safeName = sanitizeString(reporter_name, MAX_NAME_LENGTH);

  // Spam/quality filter
  const filter = filterIssue(safeTitle, safeDesc);
  if (!filter.pass) {
    return textResult({ error: "rejected", reason: filter.reason });
  }

  const db = getDb();
  const number = await allocateIssueNumber(db);

  const issueData: Record<string, unknown> = {
    messageId: `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    guildId: process.env.DISCORD_GUILD_ID || "mcp",
    channelId: "mcp",
    reporterId: reporter_id || `mcp-${safeName}`,
    reporterName: safeName,
    text: `[FEATURE REQUEST] ${safeDesc}`,
    priority: "low",
    category: "feature_request",
    summary: safeTitle,
    reasoning: "Feature request submitted via Pokedex MCP agent integration",
    status: "pending",
    source: "mcp",
    number,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  const docRef = await db.collection("issues").add(issueData);
  const issueId = docRef.id;
  await postToDiscordWebhook(issueData, issueId);

  return prettyTextResult({
    issueId, status: "created", category: "feature_request",
    message: `Feature request submitted. Issue ID: ${issueId}. The team will review it.`,
  });
}

// --- Tool 3: Check issue status ---
export async function handleCheckIssue(
  { issue_id }: InferInput<typeof checkIssueShape>,
): Promise<MCPToolResult> {
  if (!checkRateLimit(`read:${issue_id}`, false)) {
    return textResult({ error: "Rate limit exceeded. Try again later." });
  }

  const db = getDb();
  const safeId = sanitizeString(issue_id, 128);
  if (!isValidDocId(safeId)) {
    return textResult({ error: "Invalid issue ID format", issue_id: safeId });
  }
  const doc = await db.collection("issues").doc(safeId).get();
  if (!doc.exists) {
    return textResult({ error: "Issue not found", issue_id: safeId });
  }

  const data = doc.data()!;
  return prettyTextResult({
    issueId: doc.id, summary: data.summary, status: data.status || "open",
    priority: data.priority, category: data.category, reporterName: data.reporterName,
    text: data.text?.slice(0, 500), reasoning: data.reasoning,
    source: data.source || "discord",
    createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
    closedAt: data.closedAt?.toDate?.()?.toISOString() || null,
    hasAttachments: (data.attachments?.length || 0) > 0,
    threadContextCount: data.threadContext?.length || 0,
  });
}

// --- Tool 4: List my issues ---
export async function handleMyIssues(
  { reporter_name, status, limit }: InferInput<typeof myIssuesShape>,
): Promise<MCPToolResult> {
  if (!checkRateLimit(`read:${reporter_name}`, false)) {
    return textResult({ error: "Rate limit exceeded. Try again later." });
  }

  const safeName = sanitizeString(reporter_name, MAX_NAME_LENGTH);
  const safeLimit = Math.min(Math.max(limit || 20, 1), 50);
  const db = getDb();
  let query = db.collection("issues").where("reporterName", "==", safeName).orderBy("createdAt", "desc").limit(safeLimit);

  if (status && status !== "all") {
    query = db.collection("issues").where("reporterName", "==", safeName).where("status", "==", status).orderBy("createdAt", "desc").limit(safeLimit);
  }

  const snapshot = await query.get();
  const issues = snapshot.docs.map((doc: admin.firestore.QueryDocumentSnapshot) => {
    const d = doc.data();
    return {
      issueId: doc.id, summary: d.summary, status: d.status || "open",
      priority: d.priority, category: d.category, source: d.source || "discord",
      createdAt: d.createdAt?.toDate?.()?.toISOString() || null,
    };
  });

  return prettyTextResult({ reporter: reporter_name, total: issues.length, issues });
}

// --- Tool 5: Update an issue ---
export async function handleUpdateIssue(
  { issue_id, reporter_name, status, priority, category, reason }: InferInput<typeof updateIssueShape>,
): Promise<MCPToolResult> {
  if (!checkRateLimit(`write:${issue_id}`, true)) {
    return textResult({ error: "Rate limit exceeded. Try again later." });
  }

  const db = getDb();
  const safeId = sanitizeString(issue_id, 128);
  if (!isValidDocId(safeId)) {
    return textResult({ error: "Invalid issue ID format", issue_id: safeId });
  }
  const safeName = sanitizeString(reporter_name, MAX_NAME_LENGTH);
  const docRef = db.collection("issues").doc(safeId);
  const doc = await docRef.get();

  if (!doc.exists) {
    return textResult({ error: "Issue not found", issue_id: safeId });
  }

  const data = doc.data()!;

  // Authorization: MCP agents can only update issues they created via MCP
  if (data.source !== "mcp") {
    return textResult({ error: "MCP agents can only update issues created via MCP.", issue_id: safeId });
  }
  // Verify the caller is the original reporter, not just any MCP agent
  if (data.reporterName !== safeName) {
    return textResult({ error: "You can only update issues you originally reported.", issue_id: safeId });
  }

  // MCP agents cannot directly close/fix issues — that requires moderator action
  if (status && ["closed", "fixed", "wontfix"].includes(status)) {
    return textResult({ error: "MCP agents cannot close issues. Only moderators can close issues via Discord.", issue_id: safeId });
  }

  const updates: Record<string, unknown> = {
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (status) updates.status = status;
  if (priority) updates.priority = priority;
  if (category) updates.category = category;

  if (reason) {
    const safeReason = sanitizeString(reason, MAX_COMMENT_LENGTH);
    updates.notes = admin.firestore.FieldValue.arrayUnion({
      text: safeReason,
      author: "MCP Agent",
      timestamp: new Date().toISOString(),
    });
  }

  await docRef.update(updates);

  const updated = (await docRef.get()).data()!;
  return prettyTextResult({
    issueId: safeId,
    summary: updated.summary,
    status: updated.status,
    priority: updated.priority,
    category: updated.category,
    message: `Issue ${safeId} updated successfully.`,
  });
}

// --- Tool 6: Search issues ---
export async function handleSearchIssues(
  { query, status, limit }: InferInput<typeof searchIssuesShape>,
): Promise<MCPToolResult> {
  if (!checkRateLimit(`read:search`, false)) {
    return textResult({ error: "Rate limit exceeded. Try again later." });
  }

  const db = getDb();
  const searchLimit = Math.min(limit || 10, 50);
  const safeQuery = sanitizeString(query, MAX_SEARCH_QUERY_LENGTH);
  const queryLower = safeQuery.toLowerCase();

  // Firestore doesn't support full-text search, so we fetch recent issues and filter client-side
  let baseQuery = db.collection("issues").orderBy("createdAt", "desc").limit(200);

  if (status && status !== "all") {
    baseQuery = db.collection("issues")
      .where("status", "==", status)
      .orderBy("createdAt", "desc")
      .limit(200);
  }

  const snapshot = await baseQuery.get();
  const matches = snapshot.docs
    .filter((doc: admin.firestore.QueryDocumentSnapshot) => {
      const d = doc.data();
      const summary = (d.summary || "").toLowerCase();
      const text = (d.text || "").toLowerCase();
      const category = (d.category || "").toLowerCase();
      return summary.includes(queryLower) || text.includes(queryLower) || category.includes(queryLower);
    })
    .slice(0, searchLimit)
    .map((doc: admin.firestore.QueryDocumentSnapshot) => {
      const d = doc.data();
      return {
        issueId: doc.id,
        summary: d.summary,
        status: d.status || "open",
        priority: d.priority,
        category: d.category,
        reporter: d.reporterName,
        source: d.source || "discord",
        createdAt: d.createdAt?.toDate?.()?.toISOString() || null,
      };
    });

  return prettyTextResult({ query, total: matches.length, issues: matches });
}

// --- Tool 7: Add comment to an issue ---
export async function handleAddComment(
  { issue_id, comment, author }: InferInput<typeof addCommentShape>,
): Promise<MCPToolResult> {
  if (!checkRateLimit(`write:${author}`, true)) {
    return textResult({ error: "Rate limit exceeded. Try again later." });
  }

  const db = getDb();
  const safeId = sanitizeString(issue_id, 128);
  if (!isValidDocId(safeId)) {
    return textResult({ error: "Invalid issue ID format", issue_id: safeId });
  }
  const safeComment = sanitizeString(comment, MAX_COMMENT_LENGTH);
  const safeAuthor = sanitizeString(author, MAX_NAME_LENGTH);
  const docRef = db.collection("issues").doc(safeId);
  const doc = await docRef.get();

  if (!doc.exists) {
    return textResult({ error: "Issue not found", issue_id: safeId });
  }

  const noteEntry = {
    text: safeComment,
    author: safeAuthor,
    timestamp: new Date().toISOString(),
  };

  await docRef.update({
    notes: admin.firestore.FieldValue.arrayUnion(noteEntry),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const data = doc.data()!;
  const existingNotes = data.notes || [];

  return prettyTextResult({
    issueId: safeId,
    summary: data.summary,
    commentAdded: noteEntry,
    totalComments: existingNotes.length + 1,
    message: `Comment added to issue ${safeId}.`,
  });
}

// --- Tool 8: Add context to an existing issue ---
export async function handleAddContext(
  { issue_id, context, author }: InferInput<typeof addContextShape>,
): Promise<MCPToolResult> {
  if (!checkRateLimit(`write:${author}`, true)) {
    return textResult({ error: "Rate limit exceeded. Try again later." });
  }

  const db = getDb();
  const safeId = sanitizeString(issue_id, 128);
  if (!isValidDocId(safeId)) {
    return textResult({ error: "Invalid issue ID format", issue_id: safeId });
  }
  const safeContext = sanitizeString(context, MAX_CONTEXT_LENGTH);
  const safeAuthor = sanitizeString(author, MAX_NAME_LENGTH);
  const docRef = db.collection("issues").doc(safeId);
  const doc = await docRef.get();

  if (!doc.exists) {
    return textResult({ error: "Issue not found", issue_id: safeId });
  }

  const data = doc.data()!;
  const status = data.status || "open";
  if (["closed", "fixed", "wontfix"].includes(status)) {
    return textResult({ error: "Issue is closed. Reopen it first.", issue_id: safeId, status });
  }

  const contextEntry = {
    text: `${safeAuthor}: ${safeContext}`,
    addedAt: new Date().toISOString(),
  };

  // Use arrayUnion to prevent race conditions with concurrent context additions
  await docRef.update({
    threadContext: admin.firestore.FieldValue.arrayUnion(contextEntry),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Post context notification to Discord (works for both pending and approved issues)
  const updatedDoc = await docRef.get();
  const updatedData = updatedDoc.data()!;
  await postContextToDiscord(updatedData, safeId, safeContext, safeAuthor);

  const totalEntries = updatedData.threadContext?.length || 1;

  return prettyTextResult({
    issueId: safeId,
    summary: data.summary,
    contextAdded: { text: safeContext, author: safeAuthor },
    totalContextEntries: totalEntries,
    message: `Context added to issue ${safeId}. Total context entries: ${totalEntries}. Discord notification sent.`,
  });
}
