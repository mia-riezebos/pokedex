import { describe, it, expect, beforeEach, vi } from "vitest";

// Hoisted mock state so vi.mock factory can reference it.
// Each field is mutated per-test from beforeEach or directly inside a test.
const { mockState } = vi.hoisted(() => {
  type DocGetResult = { exists: boolean; id?: string; data?: () => Record<string, unknown> };
  type QueryDocSnap = { id: string; data: () => Record<string, unknown> };
  const mockState = {
    addResult: { id: "generated-id" } as { id: string },
    addShouldThrow: null as Error | null,
    // docRef.get() returns docGetResults[docGetCallIndex], then increments.
    // This lets a single test return different values on successive calls
    // (e.g. updateIssue calls get() twice — before and after update).
    docGetResults: [] as DocGetResult[],
    docGetCallIndex: 0,
    queryGetResult: { docs: [] as QueryDocSnap[] },
    lastAddData: null as Record<string, unknown> | null,
    docUpdateCalls: [] as Record<string, unknown>[],
    collectionCalls: [] as string[],
    docIdCalls: [] as string[],
    reset() {
      this.addResult = { id: "generated-id" };
      this.addShouldThrow = null;
      this.docGetResults = [];
      this.docGetCallIndex = 0;
      this.queryGetResult = { docs: [] };
      this.lastAddData = null;
      this.docUpdateCalls = [];
      this.collectionCalls = [];
      this.docIdCalls = [];
    },
  };
  return { mockState };
});

// Mock firebase-admin BEFORE importing any source file that uses it.
// - admin.apps is non-empty so initFirebase() short-circuits.
// - admin.firestore() returns a fake that proxies to mockState.
// - admin.firestore.FieldValue exposes the two sentinels handlers use.
vi.mock("firebase-admin", () => {
  type DocGetResult = { exists: boolean; id?: string; data?: () => Record<string, unknown> };

  const docRef = {
    get: async (): Promise<DocGetResult> => {
      const r = mockState.docGetResults[mockState.docGetCallIndex] ?? { exists: false };
      mockState.docGetCallIndex++;
      return r;
    },
    update: async (data: Record<string, unknown>) => {
      mockState.docUpdateCalls.push(data);
    },
  };

  type FakeCollection = {
    add: (data: Record<string, unknown>) => Promise<{ id: string }>;
    doc: (id: string) => typeof docRef;
    where: (...args: unknown[]) => FakeCollection;
    orderBy: (...args: unknown[]) => FakeCollection;
    limit: (...args: unknown[]) => FakeCollection;
    get: () => Promise<{ docs: Array<{ id: string; data: () => Record<string, unknown> }> }>;
  };

  const makeCollection = (): FakeCollection => {
    const col: FakeCollection = {
      add: async (data: Record<string, unknown>) => {
        if (mockState.addShouldThrow) throw mockState.addShouldThrow;
        mockState.lastAddData = data;
        return mockState.addResult;
      },
      doc: (id: string) => {
        mockState.docIdCalls.push(id);
        return docRef;
      },
      where: () => col,
      orderBy: () => col,
      limit: () => col,
      get: async () => mockState.queryGetResult,
    };
    return col;
  };

  const fakeFirestore = {
    collection: (name: string) => {
      mockState.collectionCalls.push(name);
      return makeCollection();
    },
  };

  // admin.firestore must be callable AND expose FieldValue as a static property.
  const firestoreCallable = Object.assign(() => fakeFirestore, {
    FieldValue: {
      serverTimestamp: () => "MOCK_SERVER_TIMESTAMP",
      arrayUnion: (...items: unknown[]) => ({ __arrayUnion: items }),
    },
  });

  return {
    default: {
      apps: [{ name: "[DEFAULT]" }],
      initializeApp: vi.fn(),
      credential: { cert: vi.fn() },
      firestore: firestoreCallable,
    },
  };
});

// Mock the Discord helpers so handlers don't try to fetch.
// (They'd no-op without env vars anyway, but mocking lets us assert calls.)
const { discordMocks } = vi.hoisted(() => ({
  discordMocks: {
    postToDiscordWebhook: vi.fn(async () => {}),
    postContextToDiscord: vi.fn(async () => {}),
  },
}));
vi.mock("../src/discord.js", () => discordMocks);

// Import after mocks are set up.
import { handleReportBug, handleCheckIssue, handleUpdateIssue } from "../src/handlers.js";
import { resetRateLimits } from "../src/rateLimit.js";

function parseResult(result: { content: Array<{ type: "text"; text: string }> }) {
  return JSON.parse(result.content[0].text);
}

beforeEach(() => {
  mockState.reset();
  resetRateLimits();
  discordMocks.postToDiscordWebhook.mockClear();
  discordMocks.postContextToDiscord.mockClear();
});

// ---------- handleReportBug ----------

describe("handleReportBug", () => {
  const validInput = {
    title: "Gmail sync broken for shared inboxes",
    description: "After OAuth refresh, shared inbox threads stop syncing. Expected sync to continue.",
    priority: "high" as const,
    category: "bug" as const,
    reporter_name: "alice",
    reporter_id: "user-123",
    screenshot_url: undefined,
  };

  it("writes to Firestore and returns the new issue id on the happy path", async () => {
    mockState.addResult = { id: "abc-123" };

    const result = await handleReportBug(validInput);
    const body = parseResult(result);

    expect(body.issueId).toBe("abc-123");
    expect(body.status).toBe("created");
    expect(body.priority).toBe("high");
    expect(body.category).toBe("bug");
    expect(mockState.collectionCalls).toEqual(["issues"]);
    expect(mockState.lastAddData).toMatchObject({
      reporterName: "alice",
      reporterId: "user-123",
      priority: "high",
      category: "bug",
      source: "mcp",
      status: "pending",
      channelId: "mcp",
      createdAt: "MOCK_SERVER_TIMESTAMP",
    });
    expect(discordMocks.postToDiscordWebhook).toHaveBeenCalledTimes(1);
  });

  it("returns a rejection when the spam filter fails (short title)", async () => {
    const result = await handleReportBug({ ...validInput, title: "hi" });
    const body = parseResult(result);

    expect(body.error).toBe("rejected");
    expect(body.reason).toMatch(/title too short/i);
    expect(mockState.lastAddData).toBeNull();
    expect(discordMocks.postToDiscordWebhook).not.toHaveBeenCalled();
  });

  it("rejects an invalid screenshot URL with the expected error", async () => {
    const result = await handleReportBug({
      ...validInput,
      screenshot_url: "https://evil.example.com/shot.png",
    });
    const body = parseResult(result);

    expect(body.error).toMatch(/invalid screenshot url/i);
    expect(mockState.lastAddData).toBeNull();
    expect(discordMocks.postToDiscordWebhook).not.toHaveBeenCalled();
  });

  it("stores a valid screenshot URL in the issue data", async () => {
    mockState.addResult = { id: "abc-124" };
    const result = await handleReportBug({
      ...validInput,
      screenshot_url: "https://i.imgur.com/abc123.png",
    });
    expect(parseResult(result).issueId).toBe("abc-124");
    expect(mockState.lastAddData).toMatchObject({
      screenshotUrl: "https://i.imgur.com/abc123.png",
    });
    expect(mockState.lastAddData!.attachments).toEqual([
      expect.objectContaining({
        url: "https://i.imgur.com/abc123.png",
        name: "screenshot.png",
        isImage: true,
      }),
    ]);
  });

  it("returns a rate-limit error after the per-user write budget is exhausted", async () => {
    // Default write budget is 10/min per rate-limit key.
    // Fire 10 successes, then assert the 11th is rate-limited.
    for (let i = 0; i < 10; i++) {
      const r = await handleReportBug(validInput);
      expect(parseResult(r).status).toBe("created");
    }
    const over = await handleReportBug(validInput);
    expect(parseResult(over)).toEqual({ error: "Rate limit exceeded. Try again later." });
  });
});

// ---------- handleCheckIssue ----------

describe("handleCheckIssue", () => {
  it("returns the issue details when the doc exists", async () => {
    mockState.docGetResults = [
      {
        exists: true,
        id: "issue-1",
        data: () => ({
          summary: "Gmail sync broken",
          status: "open",
          priority: "high",
          category: "bug",
          reporterName: "alice",
          text: "Full description of the bug that is long enough to exist",
          reasoning: "classified as bug",
          source: "mcp",
        }),
      },
    ];

    const result = await handleCheckIssue({ issue_id: "issue-1" });
    const body = parseResult(result);

    expect(body).toMatchObject({
      issueId: "issue-1",
      summary: "Gmail sync broken",
      status: "open",
      priority: "high",
      category: "bug",
      reporterName: "alice",
      source: "mcp",
      hasAttachments: false,
      threadContextCount: 0,
    });
    expect(mockState.docIdCalls).toEqual(["issue-1"]);
  });

  it("returns a not-found error when the doc does not exist", async () => {
    mockState.docGetResults = [{ exists: false }];
    const result = await handleCheckIssue({ issue_id: "missing" });
    expect(parseResult(result)).toEqual({ error: "Issue not found", issue_id: "missing" });
  });

  it("rejects ids that contain a slash (Firestore path separator)", async () => {
    const result = await handleCheckIssue({ issue_id: "foo/bar" });
    expect(parseResult(result)).toEqual({ error: "Invalid issue ID format", issue_id: "foo/bar" });
    // Should never touch Firestore when the id is invalid.
    expect(mockState.docIdCalls).toEqual([]);
  });

  it("returns a rate-limit error after the per-id read budget is exhausted", async () => {
    // Default read budget is 30/min per rate-limit key.
    mockState.docGetResults = Array.from({ length: 31 }, () => ({
      exists: true,
      id: "issue-1",
      data: () => ({ summary: "x", status: "open", priority: "low", category: "bug", reporterName: "alice" }),
    }));
    for (let i = 0; i < 30; i++) {
      const r = await handleCheckIssue({ issue_id: "issue-1" });
      expect(parseResult(r).issueId).toBe("issue-1");
    }
    const over = await handleCheckIssue({ issue_id: "issue-1" });
    expect(parseResult(over)).toEqual({ error: "Rate limit exceeded. Try again later." });
  });
});

// ---------- handleUpdateIssue ----------

describe("handleUpdateIssue", () => {
  const baseInput = {
    issue_id: "issue-1",
    reporter_name: "alice",
    status: "acknowledged" as const,
    priority: undefined,
    category: undefined,
    reason: undefined,
  };

  const mcpIssue = {
    exists: true,
    id: "issue-1",
    data: () => ({
      summary: "Gmail sync broken",
      source: "mcp",
      reporterName: "alice",
      status: "open",
      priority: "high",
      category: "bug",
    }),
  };

  it("updates an MCP-sourced issue owned by the caller on the happy path", async () => {
    // First get() checks existence + authorization.
    // Second get() (after update) returns the refreshed state used in the response.
    mockState.docGetResults = [
      mcpIssue,
      {
        exists: true,
        id: "issue-1",
        data: () => ({
          summary: "Gmail sync broken",
          status: "acknowledged",
          priority: "high",
          category: "bug",
        }),
      },
    ];

    const result = await handleUpdateIssue(baseInput);
    const body = parseResult(result);

    expect(body).toMatchObject({
      issueId: "issue-1",
      summary: "Gmail sync broken",
      status: "acknowledged",
    });
    expect(mockState.docUpdateCalls).toHaveLength(1);
    expect(mockState.docUpdateCalls[0]).toMatchObject({
      status: "acknowledged",
      updatedAt: "MOCK_SERVER_TIMESTAMP",
    });
  });

  it("rejects updates to non-MCP-sourced issues", async () => {
    mockState.docGetResults = [
      {
        exists: true,
        id: "issue-1",
        data: () => ({
          summary: "Gmail sync broken",
          source: "discord", // not mcp
          reporterName: "alice",
        }),
      },
    ];
    const result = await handleUpdateIssue(baseInput);
    expect(parseResult(result).error).toMatch(/only update issues created via mcp/i);
    expect(mockState.docUpdateCalls).toEqual([]);
  });

  it("rejects updates from a different reporter", async () => {
    mockState.docGetResults = [
      {
        exists: true,
        id: "issue-1",
        data: () => ({
          summary: "Gmail sync broken",
          source: "mcp",
          reporterName: "bob", // not the caller
        }),
      },
    ];
    const result = await handleUpdateIssue(baseInput);
    expect(parseResult(result).error).toMatch(/only update issues you originally reported/i);
    expect(mockState.docUpdateCalls).toEqual([]);
  });

  it("rejects attempts to close/fix/wontfix an issue (moderators only)", async () => {
    for (const status of ["closed", "fixed", "wontfix"] as const) {
      mockState.reset();
      resetRateLimits();
      mockState.docGetResults = [mcpIssue];
      const result = await handleUpdateIssue({ ...baseInput, status });
      expect(parseResult(result).error).toMatch(/cannot close issues/i);
      expect(mockState.docUpdateCalls).toEqual([]);
    }
  });

  it("rejects ids that contain a slash", async () => {
    const result = await handleUpdateIssue({ ...baseInput, issue_id: "foo/bar" });
    expect(parseResult(result).error).toMatch(/invalid issue id/i);
    expect(mockState.docIdCalls).toEqual([]);
  });

  it("returns a not-found error when the doc does not exist", async () => {
    mockState.docGetResults = [{ exists: false }];
    const result = await handleUpdateIssue(baseInput);
    expect(parseResult(result).error).toBe("Issue not found");
  });
});
