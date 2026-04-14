#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { fileURLToPath } from "node:url";

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
import {
  handleReportBug,
  handleSuggestFeature,
  handleCheckIssue,
  handleMyIssues,
  handleUpdateIssue,
  handleSearchIssues,
  handleAddComment,
  handleAddContext,
} from "./handlers.js";

// --- MCP Server ---
const server = new McpServer({
  name: "pokedex-mcp-server",
  version: "1.0.0",
});

server.registerTool(
  "pokedex_report_bug",
  {
    title: "Report Bug",
    description:
      "Report a bug or issue to the Pokedex engineering triage system. The issue will be saved to the database and posted to the Discord eng-triage channel for engineers to review.",
    inputSchema: reportBugShape,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  handleReportBug,
);

server.registerTool(
  "pokedex_suggest_feature",
  {
    title: "Suggest Feature",
    description: "Submit a feature request or suggestion to the Pokedex engineering team.",
    inputSchema: suggestFeatureShape,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
  handleSuggestFeature,
);

server.registerTool(
  "pokedex_check_issue",
  {
    title: "Check Issue Status",
    description: "Check the current status of a previously reported issue by its ID.",
    inputSchema: checkIssueShape,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  handleCheckIssue,
);

server.registerTool(
  "pokedex_my_issues",
  {
    title: "My Issues",
    description: "List all issues previously reported by a specific user.",
    inputSchema: myIssuesShape,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  handleMyIssues,
);

server.registerTool(
  "pokedex_update_issue",
  {
    title: "Update Issue",
    description:
      "Update an existing issue's priority, status, or category. Use this to escalate, close, or reclassify issues.",
    inputSchema: updateIssueShape,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  handleUpdateIssue,
);

server.registerTool(
  "pokedex_search_issues",
  {
    title: "Search Issues",
    description:
      "Search issues by keyword across summaries and descriptions. Returns matching issues sorted by most recent.",
    inputSchema: searchIssuesShape,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  handleSearchIssues,
);

server.registerTool(
  "pokedex_add_comment",
  {
    title: "Add Comment",
    description:
      "Add a comment or follow-up note to an existing issue. Useful for providing additional context, reproduction steps, or status updates.",
    inputSchema: addCommentShape,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  handleAddComment,
);

server.registerTool(
  "pokedex_add_context",
  {
    title: "Add Context to Issue",
    description:
      "Add follow-up context, reproduction steps, or additional details to an existing open issue without creating a new one. This is visible to reporters and engineers. Use this when you have more information about a previously reported issue.",
    inputSchema: addContextShape,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  handleAddContext,
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

// Only start the server when this file is invoked as the entry point
// (e.g. `node dist/index.js` or `tsx src/index.ts`). Importing from tests
// must not connect to stdio or start Express.
const isEntryPoint = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isEntryPoint) {
  main().catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  });
}
