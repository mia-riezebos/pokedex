#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { z } from "zod";
import admin from "firebase-admin";

// --- Firebase Init ---
function initFirebase() {
  if (admin.apps.length) return;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY || "";

  if (privateKey.includes("\\n")) {
    privateKey = privateKey.replace(/\\n/g, "\n");
  }

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Missing Firebase credentials. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY."
    );
  }

  admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
  });
}

function getDb() {
  initFirebase();
  return admin.firestore();
}

// --- Discord Bot REST API (edit existing embed with context) ---
async function postContextToDiscord(issue: Record<string, unknown>, issueId: string, context: string, author: string) {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken) return;

  // Determine channel and message to edit (works for both pending and approved issues)
  const channelId = (issue.triageChannelId as string) || (issue.pendingChannelId as string);
  const messageId = (issue.triageMessageId as string) || (issue.pendingReplyMessageId as string);
  if (!channelId || !messageId) return;

  const headers = {
    Authorization: `Bot ${botToken}`,
    "Content-Type": "application/json",
  };

  try {
    // Fetch the existing message to get its current embeds
    const getRes = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`, { headers });
    if (!getRes.ok) return;

    const msg = await getRes.json() as { embeds?: Array<Record<string, unknown>> };
    const embeds = msg.embeds || [];
    if (embeds.length === 0) return;

    // Update the first embed — add/replace the context field
    const embed = embeds[0];
    const fields = (embed.fields as Array<{ name: string; value: string; inline?: boolean }>) || [];

    // Remove any existing "💬 Context Added" field so we replace it with the latest
    const filtered = fields.filter((f: { name: string }) => !f.name.startsWith("💬"));
    filtered.push({ name: "💬 Context Added", value: `**${author}**: ${context.slice(0, 240)}` });
    embed.fields = filtered;
    embed.timestamp = new Date().toISOString();

    // PATCH the message with updated embed
    await fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ embeds: [embed] }),
    });
  } catch (err) {
    console.error("Discord context embed edit failed:", err);
  }
}

// --- Discord Webhook ---
async function postToDiscordWebhook(issue: Record<string, unknown>, issueId: string) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  const PRIORITY_COLORS: Record<string, number> = {
    critical: 0xff0000,
    high: 0xff8c00,
    medium: 0xffd700,
    low: 0x00cc00,
  };

  const color = PRIORITY_COLORS[issue.priority as string] ?? 0x808080;

  const embed = {
    title: issue.summary as string,
    color,
    fields: [
      { name: "Priority", value: issue.priority as string, inline: true },
      { name: "Category", value: issue.category as string, inline: true },
      { name: "Reporter", value: issue.reporterName as string, inline: true },
      { name: "Source", value: "MCP Agent", inline: true },
      { name: "Description", value: (issue.text as string)?.slice(0, 1024) || "(no description)" },
    ],
    footer: { text: `Issue ID: ${issueId} | via Pokedex MCP` },
    timestamp: new Date().toISOString(),
    ...(issue.screenshotUrl ? { image: { url: issue.screenshotUrl as string } } : {}),
  };

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "Pokedex",
        avatar_url: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/137.png",
        embeds: [embed],
      }),
    });
  } catch (err) {
    console.error("Discord webhook failed:", err);
  }
}

// --- MCP Server ---
const server = new McpServer({
  name: "pokedex-mcp-server",
  version: "1.0.0",
});

// Tool 1: Report a bug
server.registerTool(
  "pokedex_report_bug",
  {
    title: "Report Bug",
    description:
      "Report a bug or issue to the Pokedex engineering triage system. The issue will be saved to the database and posted to the Discord eng-triage channel for engineers to review.",
    inputSchema: {
      title: z.string().describe("Short summary of the bug (1-2 sentences)"),
      description: z.string().describe("Detailed description of the bug — what happened, what you expected, steps to reproduce"),
      priority: z
        .enum(["critical", "high", "medium", "low"])
        .optional()
        .default("medium")
        .describe("Bug severity: critical (data loss/security), high (core feature broken), medium (workaround exists), low (minor/cosmetic)"),
      category: z
        .enum(["bug", "performance", "security", "ux_issue", "infrastructure", "other"])
        .optional()
        .default("bug")
        .describe("Category of the issue"),
      reporter_name: z.string().describe("Your name or username"),
      reporter_id: z.string().optional().describe("Your unique user ID (optional)"),
      screenshot_url: z.string().url().optional().describe("URL to a screenshot showing the issue (optional)"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  async ({ title, description, priority, category, reporter_name, reporter_id, screenshot_url }) => {
    const db = getDb();

    const issueData: Record<string, unknown> = {
      messageId: `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      guildId: process.env.DISCORD_GUILD_ID || "mcp",
      channelId: "mcp",
      reporterId: reporter_id || `mcp-${reporter_name}`,
      reporterName: reporter_name,
      text: description,
      priority: priority || "medium",
      category: category || "bug",
      summary: title,
      reasoning: "Reported via Pokedex MCP agent integration",
      status: "open",
      source: "mcp",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (screenshot_url) {
      issueData.attachments = [{
        url: screenshot_url, name: "screenshot.png", isImage: true,
        contentType: "image/png", size: 0,
      }];
      issueData.screenshotUrl = screenshot_url;
    }

    const docRef = await db.collection("issues").add(issueData);
    const issueId = docRef.id;

    await postToDiscordWebhook(issueData, issueId);

    return {
      content: [{ type: "text" as const, text: JSON.stringify({
        issueId, status: "created", priority: issueData.priority, category: issueData.category,
        message: `Bug reported successfully. Issue ID: ${issueId}. The engineering team has been notified.`,
      }, null, 2) }],
    };
  }
);

// Tool 2: Suggest a feature
server.registerTool(
  "pokedex_suggest_feature",
  {
    title: "Suggest Feature",
    description: "Submit a feature request or suggestion to the Pokedex engineering team.",
    inputSchema: {
      title: z.string().describe("Short title for the feature request"),
      description: z.string().describe("Detailed description — what it should do, why it's useful"),
      reporter_name: z.string().describe("Your name or username"),
      reporter_id: z.string().optional().describe("Your unique user ID (optional)"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
  async ({ title, description, reporter_name, reporter_id }) => {
    const db = getDb();

    const issueData: Record<string, unknown> = {
      messageId: `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      guildId: process.env.DISCORD_GUILD_ID || "mcp",
      channelId: "mcp",
      reporterId: reporter_id || `mcp-${reporter_name}`,
      reporterName: reporter_name,
      text: `[FEATURE REQUEST] ${description}`,
      priority: "low",
      category: "feature_request",
      summary: title,
      reasoning: "Feature request submitted via Pokedex MCP agent integration",
      status: "open",
      source: "mcp",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const docRef = await db.collection("issues").add(issueData);
    const issueId = docRef.id;
    await postToDiscordWebhook(issueData, issueId);

    return {
      content: [{ type: "text" as const, text: JSON.stringify({
        issueId, status: "created", category: "feature_request",
        message: `Feature request submitted. Issue ID: ${issueId}. The team will review it.`,
      }, null, 2) }],
    };
  }
);

// Tool 3: Check issue status
server.registerTool(
  "pokedex_check_issue",
  {
    title: "Check Issue Status",
    description: "Check the current status of a previously reported issue by its ID.",
    inputSchema: {
      issue_id: z.string().describe("The issue ID returned when the bug was reported"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ issue_id }) => {
    const db = getDb();
    const doc = await db.collection("issues").doc(issue_id).get();
    if (!doc.exists) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ error: "Issue not found", issue_id }) }] };
    }

    const data = doc.data()!;
    return {
      content: [{ type: "text" as const, text: JSON.stringify({
        issueId: doc.id, summary: data.summary, status: data.status || "open",
        priority: data.priority, category: data.category, reporterName: data.reporterName,
        text: data.text?.slice(0, 500), reasoning: data.reasoning,
        source: data.source || "discord",
        createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
        closedAt: data.closedAt?.toDate?.()?.toISOString() || null,
        hasAttachments: (data.attachments?.length || 0) > 0,
        threadContextCount: data.threadContext?.length || 0,
      }, null, 2) }],
    };
  }
);

// Tool 4: List my issues
server.registerTool(
  "pokedex_my_issues",
  {
    title: "My Issues",
    description: "List all issues previously reported by a specific user.",
    inputSchema: {
      reporter_name: z.string().describe("Your name or username to look up"),
      status: z.enum(["open", "closed", "fixed", "acknowledged", "escalated", "all"]).optional().default("all").describe("Filter by status"),
      limit: z.number().optional().default(20).describe("Max issues to return"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ reporter_name, status, limit }) => {
    const db = getDb();
    let query = db.collection("issues").where("reporterName", "==", reporter_name).orderBy("createdAt", "desc").limit(limit || 20);

    if (status && status !== "all") {
      query = db.collection("issues").where("reporterName", "==", reporter_name).where("status", "==", status).orderBy("createdAt", "desc").limit(limit || 20);
    }

    const snapshot = await query.get();
    const issues = snapshot.docs.map((doc) => {
      const d = doc.data();
      return {
        issueId: doc.id, summary: d.summary, status: d.status || "open",
        priority: d.priority, category: d.category, source: d.source || "discord",
        createdAt: d.createdAt?.toDate?.()?.toISOString() || null,
      };
    });

    return {
      content: [{ type: "text" as const, text: JSON.stringify({ reporter: reporter_name, total: issues.length, issues }, null, 2) }],
    };
  }
);

// Tool 5: Update an issue
server.registerTool(
  "pokedex_update_issue",
  {
    title: "Update Issue",
    description:
      "Update an existing issue's priority, status, or category. Use this to escalate, close, or reclassify issues.",
    inputSchema: {
      issue_id: z.string().describe("The issue ID to update"),
      status: z
        .enum(["open", "acknowledged", "fixed", "closed", "escalated", "wontfix"])
        .optional()
        .describe("New status for the issue"),
      priority: z
        .enum(["critical", "high", "medium", "low"])
        .optional()
        .describe("New priority level"),
      category: z
        .enum(["bug", "performance", "security", "ux_issue", "infrastructure", "feature_request", "other"])
        .optional()
        .describe("New category"),
      reason: z.string().optional().describe("Reason for the update (shown in audit trail)"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ issue_id, status, priority, category, reason }) => {
    const db = getDb();
    const docRef = db.collection("issues").doc(issue_id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ error: "Issue not found", issue_id }) }] };
    }

    const updates: Record<string, unknown> = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (status) updates.status = status;
    if (priority) updates.priority = priority;
    if (category) updates.category = category;

    if (status === "closed" || status === "fixed" || status === "wontfix") {
      updates.closedAt = admin.firestore.FieldValue.serverTimestamp();
      updates.closedBy = "mcp-agent";
    }

    if (reason) {
      updates.notes = admin.firestore.FieldValue.arrayUnion({
        text: reason,
        author: "MCP Agent",
        timestamp: new Date().toISOString(),
      });
    }

    await docRef.update(updates);

    const updated = (await docRef.get()).data()!;
    return {
      content: [{ type: "text" as const, text: JSON.stringify({
        issueId: issue_id,
        summary: updated.summary,
        status: updated.status,
        priority: updated.priority,
        category: updated.category,
        message: `Issue ${issue_id} updated successfully.`,
      }, null, 2) }],
    };
  }
);

// Tool 6: Search issues
server.registerTool(
  "pokedex_search_issues",
  {
    title: "Search Issues",
    description:
      "Search issues by keyword across summaries and descriptions. Returns matching issues sorted by most recent.",
    inputSchema: {
      query: z.string().describe("Search keyword or phrase to find in issue titles and descriptions"),
      status: z
        .enum(["open", "closed", "fixed", "acknowledged", "escalated", "all"])
        .optional()
        .default("all")
        .describe("Filter by status"),
      limit: z.number().optional().default(10).describe("Max results to return"),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ query, status, limit }) => {
    const db = getDb();
    const searchLimit = Math.min(limit || 10, 50);
    const queryLower = query.toLowerCase();

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
      .filter((doc) => {
        const d = doc.data();
        const summary = (d.summary || "").toLowerCase();
        const text = (d.text || "").toLowerCase();
        const category = (d.category || "").toLowerCase();
        return summary.includes(queryLower) || text.includes(queryLower) || category.includes(queryLower);
      })
      .slice(0, searchLimit)
      .map((doc) => {
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

    return {
      content: [{ type: "text" as const, text: JSON.stringify({
        query,
        total: matches.length,
        issues: matches,
      }, null, 2) }],
    };
  }
);

// Tool 7: Add comment to an issue
server.registerTool(
  "pokedex_add_comment",
  {
    title: "Add Comment",
    description:
      "Add a comment or follow-up note to an existing issue. Useful for providing additional context, reproduction steps, or status updates.",
    inputSchema: {
      issue_id: z.string().describe("The issue ID to comment on"),
      comment: z.string().describe("The comment text to add"),
      author: z.string().describe("Your name or username"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  async ({ issue_id, comment, author }) => {
    const db = getDb();
    const docRef = db.collection("issues").doc(issue_id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ error: "Issue not found", issue_id }) }] };
    }

    const noteEntry = {
      text: comment,
      author,
      timestamp: new Date().toISOString(),
    };

    await docRef.update({
      notes: admin.firestore.FieldValue.arrayUnion(noteEntry),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const data = doc.data()!;
    const existingNotes = data.notes || [];

    return {
      content: [{ type: "text" as const, text: JSON.stringify({
        issueId: issue_id,
        summary: data.summary,
        commentAdded: noteEntry,
        totalComments: existingNotes.length + 1,
        message: `Comment added to issue ${issue_id}.`,
      }, null, 2) }],
    };
  }
);

// Tool 8: Add context to an existing issue (reporter-facing, uses threadContext)
server.registerTool(
  "pokedex_add_context",
  {
    title: "Add Context to Issue",
    description:
      "Add follow-up context, reproduction steps, or additional details to an existing open issue without creating a new one. This is visible to reporters and engineers. Use this when you have more information about a previously reported issue.",
    inputSchema: {
      issue_id: z.string().describe("The issue ID to add context to"),
      context: z.string().describe("The additional context, details, reproduction steps, or follow-up information"),
      author: z.string().describe("Your name or username"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  async ({ issue_id, context, author }) => {
    const db = getDb();
    const docRef = db.collection("issues").doc(issue_id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ error: "Issue not found", issue_id }) }] };
    }

    const data = doc.data()!;
    const status = data.status || "open";
    if (["closed", "fixed", "wontfix"].includes(status)) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ error: "Issue is closed. Reopen it first.", issue_id, status }) }] };
    }

    const existingContext: Array<Record<string, string>> = data.threadContext || [];
    existingContext.push({
      text: `${author}: ${context}`,
      addedAt: new Date().toISOString(),
    });

    await docRef.update({
      threadContext: existingContext,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Post context notification to Discord (works for both pending and approved issues)
    const updatedDoc = await docRef.get();
    const updatedData = updatedDoc.data()!;
    await postContextToDiscord(updatedData, issue_id, context, author);

    return {
      content: [{ type: "text" as const, text: JSON.stringify({
        issueId: issue_id,
        summary: data.summary,
        contextAdded: { text: context, author },
        totalContextEntries: existingContext.length,
        message: `Context added to issue ${issue_id}. Total context entries: ${existingContext.length}. Discord notification sent.`,
      }, null, 2) }],
    };
  }
);

// --- Start (stdio or HTTP) ---
async function main() {
  const mode = process.env.MCP_TRANSPORT || "stdio";

  if (mode === "http") {
    const app = express();
    app.use(express.json());

    // Health check
    app.get("/health", (_req, res) => {
      res.json({ status: "ok", server: "pokedex-mcp-server", version: "1.0.0" });
    });

    // MCP endpoint
    app.post("/mcp", async (req, res) => {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      res.on("close", () => transport.close());
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    });

    const port = parseInt(process.env.PORT || "3001");
    app.listen(port, () => {
      console.log(`Pokedex MCP server running on http://0.0.0.0:${port}/mcp`);
    });
  } else {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Pokedex MCP server running on stdio");
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
