#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
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
      "Missing Firebase credentials. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY environment variables."
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
      issueData.attachments = [
        {
          url: screenshot_url,
          name: "screenshot.png",
          isImage: true,
          contentType: "image/png",
          size: 0,
        },
      ];
      issueData.screenshotUrl = screenshot_url;
    }

    const docRef = await db.collection("issues").add(issueData);
    const issueId = docRef.id;

    // Post to Discord
    await postToDiscordWebhook(issueData, issueId);

    const result = {
      issueId,
      status: "created",
      priority: issueData.priority,
      category: issueData.category,
      message: `Bug reported successfully. Issue ID: ${issueId}. The engineering team has been notified.`,
    };

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// Tool 2: Suggest a feature
server.registerTool(
  "pokedex_suggest_feature",
  {
    title: "Suggest Feature",
    description:
      "Submit a feature request or suggestion to the Pokedex engineering team. Saved to the triage system for prioritization.",
    inputSchema: {
      title: z.string().describe("Short title for the feature request"),
      description: z.string().describe("Detailed description of the feature — what it should do, why it's useful, how it would work"),
      reporter_name: z.string().describe("Your name or username"),
      reporter_id: z.string().optional().describe("Your unique user ID (optional)"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
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

    const result = {
      issueId,
      status: "created",
      category: "feature_request",
      message: `Feature request submitted. Issue ID: ${issueId}. The team will review it.`,
    };

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
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
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ issue_id }) => {
    const db = getDb();

    const doc = await db.collection("issues").doc(issue_id).get();
    if (!doc.exists) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: "Issue not found", issue_id }) }],
      };
    }

    const data = doc.data()!;
    const result = {
      issueId: doc.id,
      summary: data.summary,
      status: data.status || "open",
      priority: data.priority,
      category: data.category,
      reporterName: data.reporterName,
      text: data.text?.slice(0, 500),
      reasoning: data.reasoning,
      source: data.source || "discord",
      createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
      closedAt: data.closedAt?.toDate?.()?.toISOString() || null,
      hasAttachments: (data.attachments?.length || 0) > 0,
      threadContextCount: data.threadContext?.length || 0,
    };

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// Tool 4: List my issues
server.registerTool(
  "pokedex_my_issues",
  {
    title: "My Issues",
    description: "List all issues previously reported by a specific user. Returns recent issues sorted by creation date.",
    inputSchema: {
      reporter_name: z.string().describe("Your name or username to look up"),
      status: z
        .enum(["open", "closed", "fixed", "acknowledged", "escalated", "all"])
        .optional()
        .default("all")
        .describe("Filter by issue status"),
      limit: z.number().optional().default(20).describe("Max number of issues to return (default: 20)"),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ reporter_name, status, limit }) => {
    const db = getDb();

    let query = db
      .collection("issues")
      .where("reporterName", "==", reporter_name)
      .orderBy("createdAt", "desc")
      .limit(limit || 20);

    if (status && status !== "all") {
      query = db
        .collection("issues")
        .where("reporterName", "==", reporter_name)
        .where("status", "==", status)
        .orderBy("createdAt", "desc")
        .limit(limit || 20);
    }

    const snapshot = await query.get();

    const issues = snapshot.docs.map((doc) => {
      const d = doc.data();
      return {
        issueId: doc.id,
        summary: d.summary,
        status: d.status || "open",
        priority: d.priority,
        category: d.category,
        source: d.source || "discord",
        createdAt: d.createdAt?.toDate?.()?.toISOString() || null,
      };
    });

    const result = {
      reporter: reporter_name,
      total: issues.length,
      issues,
    };

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// --- Start ---
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Pokedex MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
