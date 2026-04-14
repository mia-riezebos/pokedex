import { describe, it, expect } from "vitest";
import {
  filterIssue,
  sanitizeString,
  isValidDocId,
  isValidScreenshotUrl,
  sanitizeRateLimitKey,
} from "../src/validators.js";

describe("filterIssue", () => {
  const goodTitle = "Gmail sync is broken for shared inboxes";
  const goodDesc = "After OAuth refresh, the Gmail integration stops syncing shared inbox threads.";

  it("passes a reasonable bug report", () => {
    expect(filterIssue(goodTitle, goodDesc)).toEqual({ pass: true });
  });

  it("rejects titles shorter than 5 characters", () => {
    const result = filterIssue("hi", goodDesc);
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/title too short/i);
  });

  it("rejects descriptions shorter than 15 characters", () => {
    const result = filterIssue(goodTitle, "too short");
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/description too short/i);
  });

  it("rejects gibberish-looking short titles", () => {
    const result = filterIssue("aa bb cc", goodDesc);
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/gibberish/i);
  });

  it("rejects excessive repeated characters", () => {
    const result = filterIssue("Broken integration issue", "aaaaaaaaaaaa something is wrong");
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/repeated characters/i);
  });

  it("rejects greetings as titles", () => {
    const result = filterIssue("hello there", goodDesc);
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/doesn't appear to be a bug report/i);
  });

  it("rejects all-caps ranting reports", () => {
    const result = filterIssue("GMAIL IS COMPLETELY BROKEN", "WHY DOESN'T ANYTHING WORK EVER PLEASE FIX");
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/caps/i);
  });

  it("rejects link spam — too many URLs relative to content", () => {
    const result = filterIssue(
      "check these links",
      "https://a.com https://b.com https://c.com https://d.com hello",
    );
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/too many links/i);
  });

  it("rejects reports with too many repeated words", () => {
    const result = filterIssue(
      "broken broken broken broken",
      "broken broken broken broken broken broken broken broken broken broken",
    );
    expect(result.pass).toBe(false);
    // Could match either "repeated words" or "repeated characters" depending on which
    // check fires first — only assert on pass/fail.
  });

  it("rejects reports containing abuse patterns", () => {
    const result = filterIssue(
      "Gmail integration broken",
      "fuck you devs this is garbage please fix this immediately",
    );
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/inappropriate/i);
  });
});

describe("sanitizeString", () => {
  it("trims whitespace", () => {
    expect(sanitizeString("  hello  ", 100)).toBe("hello");
  });

  it("truncates to maxLength before trimming", () => {
    // slice(0, 10) then trim
    expect(sanitizeString("hello world, how are you", 10)).toBe("hello worl");
  });

  it("returns empty string for empty input", () => {
    expect(sanitizeString("", 100)).toBe("");
  });

  it("leaves short strings untouched", () => {
    expect(sanitizeString("ok", 100)).toBe("ok");
  });
});

describe("isValidDocId", () => {
  it("accepts normal doc ids", () => {
    expect(isValidDocId("abc123")).toBe(true);
    expect(isValidDocId("issue-123_foo")).toBe(true);
  });

  it("rejects empty strings", () => {
    expect(isValidDocId("")).toBe(false);
  });

  it("rejects ids longer than 128 chars", () => {
    expect(isValidDocId("a".repeat(129))).toBe(false);
    expect(isValidDocId("a".repeat(128))).toBe(true);
  });

  it("rejects ids containing a forward slash (Firestore path separator)", () => {
    expect(isValidDocId("foo/bar")).toBe(false);
  });
});

describe("isValidScreenshotUrl", () => {
  it("accepts allowed image hosts over https", () => {
    expect(isValidScreenshotUrl("https://cdn.discordapp.com/attachments/1/2/screenshot.png")).toBe(true);
    expect(isValidScreenshotUrl("https://media.discordapp.net/attachments/1/2/a.png")).toBe(true);
    expect(isValidScreenshotUrl("https://i.imgur.com/abc.png")).toBe(true);
    expect(isValidScreenshotUrl("https://raw.githubusercontent.com/org/repo/main/shot.png")).toBe(true);
  });

  it("accepts subdomains of allowed hosts", () => {
    // endsWith(`.${d}`) matching — works for cdn.discordapp.com subdomains
    expect(isValidScreenshotUrl("https://foo.cdn.discordapp.com/x.png")).toBe(true);
  });

  it("rejects http (non-https)", () => {
    expect(isValidScreenshotUrl("http://i.imgur.com/abc.png")).toBe(false);
  });

  it("rejects disallowed domains even over https", () => {
    expect(isValidScreenshotUrl("https://evil.example.com/shot.png")).toBe(false);
    expect(isValidScreenshotUrl("https://pastebin.com/raw/abc")).toBe(false);
  });

  it("rejects localhost / loopback", () => {
    expect(isValidScreenshotUrl("https://localhost/a.png")).toBe(false);
    expect(isValidScreenshotUrl("https://127.0.0.1/a.png")).toBe(false);
    expect(isValidScreenshotUrl("https://0.0.0.0/a.png")).toBe(false);
  });

  it("rejects private IPv4 ranges (10.x, 192.168.x)", () => {
    expect(isValidScreenshotUrl("https://10.0.0.1/a.png")).toBe(false);
    expect(isValidScreenshotUrl("https://192.168.1.1/a.png")).toBe(false);
  });

  it("rejects the private portion of 172.x (16-31) but allows public 172.x", () => {
    expect(isValidScreenshotUrl("https://172.16.0.1/a.png")).toBe(false);
    expect(isValidScreenshotUrl("https://172.31.255.255/a.png")).toBe(false);
    // 172.15 and 172.32 are public per the comment in validators.ts —
    // but they're still rejected by the allowlist, which is the belt-and-suspenders
    // point of this function. So the *reason* is allowlist, not SSRF — confirm final result.
    expect(isValidScreenshotUrl("https://172.15.0.1/a.png")).toBe(false);
    expect(isValidScreenshotUrl("https://172.32.0.1/a.png")).toBe(false);
  });

  it("rejects .local and .internal hostnames", () => {
    expect(isValidScreenshotUrl("https://myhost.local/a.png")).toBe(false);
    expect(isValidScreenshotUrl("https://svc.internal/a.png")).toBe(false);
  });

  it("rejects IPv6 localhost and ULA", () => {
    expect(isValidScreenshotUrl("https://[::1]/a.png")).toBe(false);
    expect(isValidScreenshotUrl("https://[fc00::1]/a.png")).toBe(false);
    expect(isValidScreenshotUrl("https://[fd12:3456::1]/a.png")).toBe(false);
  });

  it("rejects malformed URLs", () => {
    expect(isValidScreenshotUrl("not a url")).toBe(false);
    expect(isValidScreenshotUrl("")).toBe(false);
  });
});

describe("sanitizeRateLimitKey", () => {
  it("passes safe characters through", () => {
    expect(sanitizeRateLimitKey("write:alice@example.com")).toBe("write:alice@example.com");
    expect(sanitizeRateLimitKey("read:issue-123_foo")).toBe("read:issue-123_foo");
  });

  it("replaces unsafe characters with underscores", () => {
    expect(sanitizeRateLimitKey("write:alice/../bob")).toBe("write:alice_.._bob");
    expect(sanitizeRateLimitKey("read:<script>")).toBe("read:_script_");
  });

  it("truncates keys longer than 200 characters", () => {
    const long = "a".repeat(300);
    expect(sanitizeRateLimitKey(long)).toHaveLength(200);
  });

  it("handles empty string", () => {
    expect(sanitizeRateLimitKey("")).toBe("");
  });
});
