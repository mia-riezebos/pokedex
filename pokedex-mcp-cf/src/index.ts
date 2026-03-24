import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

interface Env {
  FIREBASE_PROJECT_ID: string;
  FIREBASE_CLIENT_EMAIL: string;
  FIREBASE_PRIVATE_KEY: string;
  DISCORD_WEBHOOK_URL: string;
  DISCORD_GUILD_ID: string;
}

// === JWT / Firestore Auth ===

async function createJWT(env: Env): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: env.FIREBASE_CLIENT_EMAIL,
    sub: env.FIREBASE_CLIENT_EMAIL,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
    scope: "https://www.googleapis.com/auth/datastore",
  };

  const enc = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const signingInput = `${enc(header)}.${enc(payload)}`;

  let pem = env.FIREBASE_PRIVATE_KEY;
  if (pem.includes("\\n")) pem = pem.replace(/\\n/g, "\n");
  const pemBody = pem.replace(/-----BEGIN PRIVATE KEY-----/, "").replace(/-----END PRIVATE KEY-----/, "").replace(/\s/g, "");
  const binaryKey = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

  const key = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput)
  );

  const sig = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  return `${signingInput}.${sig}`;
}

async function getAccessToken(env: Env): Promise<string> {
  const jwt = await createJWT(env);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const data = await res.json() as { access_token: string };
  return data.access_token;
}

// === Firestore REST API ===

const FIRESTORE_BASE = (projectId: string) =>
  `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

function toFirestoreValue(val: unknown): Record<string, unknown> {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === "string") return { stringValue: val };
  if (typeof val === "number") return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  if (typeof val === "boolean") return { booleanValue: val };
  if (Array.isArray(val)) return { arrayValue: { values: val.map(toFirestoreValue) } };
  if (typeof val === "object") {
    const fields: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      fields[k] = toFirestoreValue(v);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

function fromFirestoreValue(val: Record<string, unknown>): unknown {
  if ("stringValue" in val) return val.stringValue;
  if ("integerValue" in val) return Number(val.integerValue);
  if ("doubleValue" in val) return val.doubleValue;
  if ("booleanValue" in val) return val.booleanValue;
  if ("nullValue" in val) return null;
  if ("timestampValue" in val) return val.timestampValue;
  if ("arrayValue" in val) {
    const arr = val.arrayValue as { values?: Record<string, unknown>[] };
    return (arr.values || []).map(fromFirestoreValue);
  }
  if ("mapValue" in val) {
    const map = val.mapValue as { fields?: Record<string, Record<string, unknown>> };
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(map.fields || {})) {
      result[k] = fromFirestoreValue(v);
    }
    return result;
  }
  return null;
}

function fromFirestoreDoc(doc: Record<string, unknown>): Record<string, unknown> {
  const fields = doc.fields as Record<string, Record<string, unknown>> || {};
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    result[k] = fromFirestoreValue(v);
  }
  // Extract doc ID from name
  const name = doc.name as string;
  if (name) {
    result.id = name.split("/").pop();
  }
  return result;
}

async function firestoreCreate(env: Env, token: string, data: Record<string, unknown>): Promise<string> {
  const fields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    fields[k] = toFirestoreValue(v);
  }

  const res = await fetch(`${FIRESTORE_BASE(env.FIREBASE_PROJECT_ID)}/issues`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields }),
  });

  const doc = await res.json() as { name: string };
  return doc.name.split("/").pop()!;
}

async function firestoreGet(env: Env, token: string, docId: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${FIRESTORE_BASE(env.FIREBASE_PROJECT_ID)}/issues/${docId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return fromFirestoreDoc(await res.json() as Record<string, unknown>);
}

async function firestoreQuery(env: Env, token: string, field: string, value: string, limit = 20): Promise<Record<string, unknown>[]> {
  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents:runQuery`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: "issues" }],
          where: {
            fieldFilter: {
              field: { fieldPath: field },
              op: "EQUAL",
              value: { stringValue: value },
            },
          },
          orderBy: [{ field: { fieldPath: "createdAt" }, direction: "DESCENDING" }],
          limit: limit,
        },
      }),
    }
  );

  const results = await res.json() as Array<{ document?: Record<string, unknown> }>;
  return results
    .filter((r) => r.document)
    .map((r) => fromFirestoreDoc(r.document!));
}

// === Discord Webhook ===

async function postToDiscord(env: Env, issue: Record<string, unknown>, issueId: string) {
  if (!env.DISCORD_WEBHOOK_URL) return;

  const colors: Record<string, number> = { critical: 0xff0000, high: 0xff8c00, medium: 0xffd700, low: 0x00cc00 };

  await fetch(env.DISCORD_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "Pokedex",
      avatar_url: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/137.png",
      embeds: [{
        title: issue.summary as string,
        color: colors[issue.priority as string] ?? 0x808080,
        fields: [
          { name: "Priority", value: issue.priority as string, inline: true },
          { name: "Category", value: issue.category as string, inline: true },
          { name: "Reporter", value: issue.reporterName as string, inline: true },
          { name: "Source", value: "MCP Agent", inline: true },
          { name: "Description", value: ((issue.text as string) || "").slice(0, 1024) || "(none)" },
        ],
        footer: { text: `Issue ID: ${issueId} | via Pokedex MCP` },
        timestamp: new Date().toISOString(),
      }],
    }),
  });
}

// === MCP Server Setup ===

function createServer(env: Env): McpServer {
  const server = new McpServer({ name: "pokedex-mcp-server", version: "1.0.0" });

  server.registerTool("pokedex_report_bug", {
    title: "Report Bug",
    description: "Report a bug to the Pokedex engineering triage system. Saved to database and posted to Discord eng-triage.",
    inputSchema: {
      title: z.string().describe("Short summary of the bug"),
      description: z.string().describe("Detailed description — what happened, expected behavior, steps to reproduce"),
      priority: z.enum(["critical", "high", "medium", "low"]).optional().default("medium").describe("Severity level"),
      category: z.enum(["bug", "performance", "security", "ux_issue", "infrastructure", "other"]).optional().default("bug"),
      reporter_name: z.string().describe("Your name or username"),
      reporter_id: z.string().optional().describe("Your user ID"),
      screenshot_url: z.string().url().optional().describe("Screenshot URL"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  }, async ({ title, description, priority, category, reporter_name, reporter_id, screenshot_url }) => {
    const token = await getAccessToken(env);
    const data: Record<string, unknown> = {
      messageId: `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      guildId: env.DISCORD_GUILD_ID || "mcp",
      channelId: "mcp",
      reporterId: reporter_id || `mcp-${reporter_name}`,
      reporterName: reporter_name,
      text: description,
      priority: priority || "medium",
      category: category || "bug",
      summary: title,
      reasoning: "Reported via Pokedex MCP",
      status: "open",
      source: "mcp",
      createdAt: new Date().toISOString(),
    };

    if (screenshot_url) {
      data.attachments = [{ url: screenshot_url, name: "screenshot.png", isImage: true }];
    }

    const issueId = await firestoreCreate(env, token, data);
    await postToDiscord(env, data, issueId);

    return { content: [{ type: "text" as const, text: JSON.stringify({ issueId, status: "created", priority: data.priority, category: data.category, message: `Bug reported. Issue ID: ${issueId}. Engineering team notified.` }, null, 2) }] };
  });

  server.registerTool("pokedex_suggest_feature", {
    title: "Suggest Feature",
    description: "Submit a feature request to the engineering team.",
    inputSchema: {
      title: z.string().describe("Feature title"),
      description: z.string().describe("What it should do and why"),
      reporter_name: z.string().describe("Your name"),
      reporter_id: z.string().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  }, async ({ title, description, reporter_name, reporter_id }) => {
    const token = await getAccessToken(env);
    const data: Record<string, unknown> = {
      messageId: `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      guildId: env.DISCORD_GUILD_ID || "mcp",
      channelId: "mcp",
      reporterId: reporter_id || `mcp-${reporter_name}`,
      reporterName: reporter_name,
      text: `[FEATURE REQUEST] ${description}`,
      priority: "low",
      category: "feature_request",
      summary: title,
      reasoning: "Feature request via Pokedex MCP",
      status: "open",
      source: "mcp",
      createdAt: new Date().toISOString(),
    };

    const issueId = await firestoreCreate(env, token, data);
    await postToDiscord(env, data, issueId);

    return { content: [{ type: "text" as const, text: JSON.stringify({ issueId, status: "created", category: "feature_request", message: `Feature request submitted. ID: ${issueId}` }, null, 2) }] };
  });

  server.registerTool("pokedex_check_issue", {
    title: "Check Issue Status",
    description: "Check the status of a reported issue by ID.",
    inputSchema: { issue_id: z.string().describe("Issue ID") },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ issue_id }) => {
    const token = await getAccessToken(env);
    const issue = await firestoreGet(env, token, issue_id);
    if (!issue) return { content: [{ type: "text" as const, text: JSON.stringify({ error: "Issue not found" }) }] };

    return { content: [{ type: "text" as const, text: JSON.stringify({
      issueId: issue.id, summary: issue.summary, status: issue.status || "open",
      priority: issue.priority, category: issue.category, reporterName: issue.reporterName,
      text: ((issue.text as string) || "").slice(0, 500), source: issue.source || "discord",
      createdAt: issue.createdAt,
    }, null, 2) }] };
  });

  server.registerTool("pokedex_my_issues", {
    title: "My Issues",
    description: "List all issues reported by a user.",
    inputSchema: {
      reporter_name: z.string().describe("Your name or username"),
      limit: z.number().optional().default(20),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ reporter_name, limit }) => {
    const token = await getAccessToken(env);
    const issues = await firestoreQuery(env, token, "reporterName", reporter_name, limit || 20);

    return { content: [{ type: "text" as const, text: JSON.stringify({
      reporter: reporter_name, total: issues.length,
      issues: issues.map(i => ({ issueId: i.id, summary: i.summary, status: i.status || "open", priority: i.priority, category: i.category, createdAt: i.createdAt })),
    }, null, 2) }] };
  });

  return server;
}

// === Worker Export ===

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === "/health") {
      return Response.json({ status: "ok", server: "pokedex-mcp-server", version: "1.0.0", runtime: "cloudflare-workers" });
    }

    // MCP endpoint — handle protocol directly (no Express shim needed)
    if (url.pathname === "/mcp" && request.method === "POST") {
      const body = await request.json() as { jsonrpc: string; id: unknown; method: string; params?: unknown };

      if (body.method === "initialize") {
        return Response.json({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            protocolVersion: "2025-03-26",
            capabilities: { tools: { listChanged: true } },
            serverInfo: { name: "pokedex-mcp-server", version: "1.0.0" },
          },
        });
      }

      if (body.method === "notifications/initialized") {
        return Response.json({ jsonrpc: "2.0", id: body.id });
      }

      if (body.method === "tools/list") {
        const server = createServer(env);
        // Get tool definitions by inspecting registered tools
        const tools = [
          { name: "pokedex_report_bug", title: "Report Bug", description: "Report a bug to the Pokedex engineering triage system. Saved to database and posted to Discord eng-triage.", inputSchema: { type: "object", properties: { title: { type: "string", description: "Short summary of the bug" }, description: { type: "string", description: "Detailed description" }, priority: { type: "string", enum: ["critical","high","medium","low"], default: "medium" }, category: { type: "string", enum: ["bug","performance","security","ux_issue","infrastructure","other"], default: "bug" }, reporter_name: { type: "string", description: "Your name" }, reporter_id: { type: "string", description: "Your user ID" }, screenshot_url: { type: "string", description: "Screenshot URL" } }, required: ["title","description","reporter_name"] }, annotations: { readOnlyHint: false, destructiveHint: false } },
          { name: "pokedex_suggest_feature", title: "Suggest Feature", description: "Submit a feature request.", inputSchema: { type: "object", properties: { title: { type: "string" }, description: { type: "string" }, reporter_name: { type: "string" }, reporter_id: { type: "string" } }, required: ["title","description","reporter_name"] }, annotations: { readOnlyHint: false } },
          { name: "pokedex_check_issue", title: "Check Issue", description: "Check status of an issue by ID.", inputSchema: { type: "object", properties: { issue_id: { type: "string" } }, required: ["issue_id"] }, annotations: { readOnlyHint: true } },
          { name: "pokedex_my_issues", title: "My Issues", description: "List issues reported by a user.", inputSchema: { type: "object", properties: { reporter_name: { type: "string" }, limit: { type: "number", default: 20 } }, required: ["reporter_name"] }, annotations: { readOnlyHint: true } },
        ];
        return Response.json({ jsonrpc: "2.0", id: body.id, result: { tools } });
      }

      if (body.method === "tools/call") {
        const params = body.params as { name: string; arguments: Record<string, unknown> };
        const args = params.arguments;
        const token = await getAccessToken(env);

        try {
          if (params.name === "pokedex_report_bug") {
            const data: Record<string, unknown> = {
              messageId: `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              guildId: env.DISCORD_GUILD_ID || "mcp", channelId: "mcp",
              reporterId: (args.reporter_id as string) || `mcp-${args.reporter_name}`,
              reporterName: args.reporter_name, text: args.description,
              priority: args.priority || "medium", category: args.category || "bug",
              summary: args.title, reasoning: "Reported via Pokedex MCP",
              status: "open", source: "mcp", createdAt: new Date().toISOString(),
            };
            if (args.screenshot_url) data.attachments = [{ url: args.screenshot_url, name: "screenshot.png", isImage: true }];
            const issueId = await firestoreCreate(env, token, data);
            await postToDiscord(env, data, issueId);
            return Response.json({ jsonrpc: "2.0", id: body.id, result: { content: [{ type: "text", text: JSON.stringify({ issueId, status: "created", priority: data.priority, message: `Bug reported. ID: ${issueId}` }, null, 2) }] } });
          }

          if (params.name === "pokedex_suggest_feature") {
            const data: Record<string, unknown> = {
              messageId: `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              guildId: env.DISCORD_GUILD_ID || "mcp", channelId: "mcp",
              reporterId: (args.reporter_id as string) || `mcp-${args.reporter_name}`,
              reporterName: args.reporter_name, text: `[FEATURE REQUEST] ${args.description}`,
              priority: "low", category: "feature_request", summary: args.title,
              reasoning: "Feature request via Pokedex MCP", status: "open", source: "mcp", createdAt: new Date().toISOString(),
            };
            const issueId = await firestoreCreate(env, token, data);
            await postToDiscord(env, data, issueId);
            return Response.json({ jsonrpc: "2.0", id: body.id, result: { content: [{ type: "text", text: JSON.stringify({ issueId, status: "created", message: `Feature submitted. ID: ${issueId}` }, null, 2) }] } });
          }

          if (params.name === "pokedex_check_issue") {
            const issue = await firestoreGet(env, token, args.issue_id as string);
            if (!issue) return Response.json({ jsonrpc: "2.0", id: body.id, result: { content: [{ type: "text", text: JSON.stringify({ error: "Issue not found" }) }] } });
            return Response.json({ jsonrpc: "2.0", id: body.id, result: { content: [{ type: "text", text: JSON.stringify({ issueId: issue.id, summary: issue.summary, status: issue.status || "open", priority: issue.priority, category: issue.category, createdAt: issue.createdAt }, null, 2) }] } });
          }

          if (params.name === "pokedex_my_issues") {
            const issues = await firestoreQuery(env, token, "reporterName", args.reporter_name as string, (args.limit as number) || 20);
            return Response.json({ jsonrpc: "2.0", id: body.id, result: { content: [{ type: "text", text: JSON.stringify({ reporter: args.reporter_name, total: issues.length, issues: issues.map(i => ({ issueId: i.id, summary: i.summary, status: i.status || "open", priority: i.priority, category: i.category })) }, null, 2) }] } });
          }

          return Response.json({ jsonrpc: "2.0", id: body.id, error: { code: -32601, message: `Unknown tool: ${params.name}` } });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          return Response.json({ jsonrpc: "2.0", id: body.id, error: { code: -32000, message } });
        }
      }

      return Response.json({ jsonrpc: "2.0", id: body.id, error: { code: -32601, message: `Method not found: ${body.method}` } });
    }

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, GET, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Accept" },
      });
    }

    return Response.json({ error: "Not found. MCP endpoint is POST /mcp" }, { status: 404 });
  },
};
