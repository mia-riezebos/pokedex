// Zod input shapes for each Pokedex MCP tool, extracted from index.ts
// so they can be unit-tested directly without loading the MCP server.
//
// Each shape is exported as a raw Zod shape (plain object of ZodType fields),
// which is what @modelcontextprotocol/sdk's registerTool() consumes.
// Tests wrap these with z.object(shape).parse(...) for validation testing.

import { z } from "zod";

export const reportBugShape = {
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
};

export const suggestFeatureShape = {
  title: z.string().describe("Short title for the feature request"),
  description: z.string().describe("Detailed description — what it should do, why it's useful"),
  reporter_name: z.string().describe("Your name or username"),
  reporter_id: z.string().optional().describe("Your unique user ID (optional)"),
};

export const checkIssueShape = {
  issue_id: z.string().describe("The issue ID returned when the bug was reported"),
};

export const myIssuesShape = {
  reporter_name: z.string().describe("Your name or username to look up"),
  status: z
    .enum(["open", "closed", "fixed", "acknowledged", "escalated", "all"])
    .optional()
    .default("all")
    .describe("Filter by status"),
  limit: z.number().optional().default(20).describe("Max issues to return"),
};

export const updateIssueShape = {
  issue_id: z.string().describe("The issue ID to update"),
  reporter_name: z.string().describe("Your name or username (must match the original reporter)"),
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
};

export const searchIssuesShape = {
  query: z.string().describe("Search keyword or phrase to find in issue titles and descriptions"),
  status: z
    .enum(["open", "closed", "fixed", "acknowledged", "escalated", "all"])
    .optional()
    .default("all")
    .describe("Filter by status"),
  limit: z.number().optional().default(10).describe("Max results to return"),
};

export const addCommentShape = {
  issue_id: z.string().describe("The issue ID to comment on"),
  comment: z.string().describe("The comment text to add"),
  author: z.string().describe("Your name or username"),
};

export const addContextShape = {
  issue_id: z.string().describe("The issue ID to add context to"),
  context: z.string().describe("The additional context, details, reproduction steps, or follow-up information"),
  author: z.string().describe("Your name or username"),
};
