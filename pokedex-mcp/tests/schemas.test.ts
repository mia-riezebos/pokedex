import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  reportBugShape,
  suggestFeatureShape,
  checkIssueShape,
  myIssuesShape,
  updateIssueShape,
  searchIssuesShape,
  addCommentShape,
  addContextShape,
} from "../src/schemas.js";

// Each tool's input shape is exported as a raw Zod shape (a plain object of
// ZodType fields) because that's what @modelcontextprotocol/sdk's
// registerTool() consumes. For testing we wrap each shape with z.object().
const reportBug = z.object(reportBugShape);
const suggestFeature = z.object(suggestFeatureShape);
const checkIssue = z.object(checkIssueShape);
const myIssues = z.object(myIssuesShape);
const updateIssue = z.object(updateIssueShape);
const searchIssues = z.object(searchIssuesShape);
const addComment = z.object(addCommentShape);
const addContext = z.object(addContextShape);

describe("reportBugShape", () => {
  it("accepts a minimal valid payload and fills in defaults", () => {
    const parsed = reportBug.parse({
      title: "Gmail sync broken",
      description: "Shared inbox threads stop syncing after OAuth refresh.",
      reporter_name: "alice",
    });
    expect(parsed.priority).toBe("medium");
    expect(parsed.category).toBe("bug");
    expect(parsed.reporter_id).toBeUndefined();
    expect(parsed.screenshot_url).toBeUndefined();
  });

  it("accepts all valid priority enum values", () => {
    for (const priority of ["critical", "high", "medium", "low"] as const) {
      expect(() =>
        reportBug.parse({
          title: "x",
          description: "y",
          reporter_name: "alice",
          priority,
        }),
      ).not.toThrow();
    }
  });

  it("rejects an invalid priority value", () => {
    const result = reportBug.safeParse({
      title: "x",
      description: "y",
      reporter_name: "alice",
      priority: "urgent",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid category value", () => {
    const result = reportBug.safeParse({
      title: "x",
      description: "y",
      reporter_name: "alice",
      category: "feature_request", // not in reportBug's category enum
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing required fields", () => {
    expect(reportBug.safeParse({}).success).toBe(false);
    expect(reportBug.safeParse({ title: "x", description: "y" }).success).toBe(false);
    expect(reportBug.safeParse({ title: "x", reporter_name: "a" }).success).toBe(false);
  });

  it("rejects non-URL screenshot_url", () => {
    const result = reportBug.safeParse({
      title: "x",
      description: "y",
      reporter_name: "alice",
      screenshot_url: "not-a-url",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a well-formed screenshot_url (Zod only checks URL shape)", () => {
    // Note: Zod only validates it looks like a URL — isValidScreenshotUrl does
    // the SSRF / allowlist check separately inside the handler.
    const result = reportBug.safeParse({
      title: "x",
      description: "y",
      reporter_name: "alice",
      screenshot_url: "https://example.com/shot.png",
    });
    expect(result.success).toBe(true);
  });
});

describe("suggestFeatureShape", () => {
  it("accepts a valid payload", () => {
    const parsed = suggestFeature.parse({
      title: "Add dark mode",
      description: "The dashboard is hard to read at night.",
      reporter_name: "alice",
    });
    expect(parsed.title).toBe("Add dark mode");
  });

  it("rejects missing required fields", () => {
    expect(suggestFeature.safeParse({}).success).toBe(false);
    expect(suggestFeature.safeParse({ title: "x" }).success).toBe(false);
  });
});

describe("checkIssueShape", () => {
  it("requires issue_id", () => {
    expect(checkIssue.parse({ issue_id: "abc" }).issue_id).toBe("abc");
    expect(checkIssue.safeParse({}).success).toBe(false);
  });
});

describe("myIssuesShape", () => {
  it("fills in defaults for status and limit", () => {
    const parsed = myIssues.parse({ reporter_name: "alice" });
    expect(parsed.status).toBe("all");
    expect(parsed.limit).toBe(20);
  });

  it("rejects an invalid status value", () => {
    expect(
      myIssues.safeParse({ reporter_name: "alice", status: "bogus" }).success,
    ).toBe(false);
  });

  it("rejects non-numeric limit", () => {
    expect(
      myIssues.safeParse({ reporter_name: "alice", limit: "20" }).success,
    ).toBe(false);
  });
});

describe("updateIssueShape", () => {
  it("accepts the minimum required fields", () => {
    const parsed = updateIssue.parse({ issue_id: "abc", reporter_name: "alice" });
    expect(parsed.issue_id).toBe("abc");
    expect(parsed.status).toBeUndefined();
  });

  it("accepts feature_request in the category enum (unlike reportBug)", () => {
    const result = updateIssue.safeParse({
      issue_id: "abc",
      reporter_name: "alice",
      category: "feature_request",
    });
    expect(result.success).toBe(true);
  });

  it("accepts wontfix as a status (unlike myIssues)", () => {
    const result = updateIssue.safeParse({
      issue_id: "abc",
      reporter_name: "alice",
      status: "wontfix",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid priority value", () => {
    expect(
      updateIssue.safeParse({
        issue_id: "abc",
        reporter_name: "alice",
        priority: "urgent",
      }).success,
    ).toBe(false);
  });
});

describe("searchIssuesShape", () => {
  it("fills in defaults", () => {
    const parsed = searchIssues.parse({ query: "gmail" });
    expect(parsed.status).toBe("all");
    expect(parsed.limit).toBe(10);
  });

  it("requires query", () => {
    expect(searchIssues.safeParse({}).success).toBe(false);
  });
});

describe("addCommentShape", () => {
  it("requires issue_id, comment, and author", () => {
    const parsed = addComment.parse({
      issue_id: "abc",
      comment: "looks like a regression",
      author: "alice",
    });
    expect(parsed.author).toBe("alice");
  });

  it("rejects missing required fields", () => {
    expect(addComment.safeParse({ issue_id: "abc", comment: "x" }).success).toBe(false);
    expect(addComment.safeParse({ issue_id: "abc", author: "alice" }).success).toBe(false);
  });
});

describe("addContextShape", () => {
  it("requires issue_id, context, and author", () => {
    const parsed = addContext.parse({
      issue_id: "abc",
      context: "steps to reproduce: ...",
      author: "alice",
    });
    expect(parsed.issue_id).toBe("abc");
  });

  it("rejects missing required fields", () => {
    expect(addContext.safeParse({}).success).toBe(false);
  });
});
