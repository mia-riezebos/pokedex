// Pure validation & sanitization helpers for the Pokedex MCP server.
// Extracted from index.ts so they can be imported by tests.
// No behavior changes from the inlined originals.

export const MAX_TITLE_LENGTH = 200;
export const MAX_DESCRIPTION_LENGTH = 4000;
export const MAX_COMMENT_LENGTH = 2000;
export const MAX_CONTEXT_LENGTH = 2000;
export const MAX_NAME_LENGTH = 100;
export const MAX_SEARCH_QUERY_LENGTH = 200;

export interface FilterResult {
  pass: boolean;
  reason?: string;
}

export function filterIssue(title: string, description: string): FilterResult {
  const original = `${title} ${description}`;
  const combined = original.toLowerCase();

  if (title.length < 5) return { pass: false, reason: "Title too short. Please provide a clear summary (at least 5 characters)." };
  if (description.length < 15) return { pass: false, reason: "Description too short. Please include enough detail (at least 15 characters)." };

  const gibberishPattern = /^[a-z]{1,3}(\s[a-z]{1,3}){0,2}$|(.)\2{4,}|^[^a-zA-Z]*$/;
  if (gibberishPattern.test(title.trim())) return { pass: false, reason: "Title appears to be gibberish. Please describe the actual issue." };

  if (/(.)\1{5,}/.test(combined)) return { pass: false, reason: "Report contains excessive repeated characters." };

  const greetings = ["hello", "hi", "hey", "sup", "yo", "test", "testing", "asdf", "qwerty", "foo", "bar", "baz", "lol", "lmao", "bruh"];
  const titleWords = title.toLowerCase().trim().split(/\s+/);
  if (titleWords.length <= 2 && greetings.includes(titleWords[0])) return { pass: false, reason: "This doesn't appear to be a bug report. Please describe what went wrong." };

  // Check uppercase ratio on original (pre-lowercased) text
  const uppercaseRatio = (original.match(/[A-Z]/g) || []).length / Math.max(original.length, 1);
  if (original.length > 20 && uppercaseRatio > 0.7) return { pass: false, reason: "Please avoid excessive caps. Describe the issue clearly." };

  const urlCount = (combined.match(/https?:\/\//g) || []).length;
  if (urlCount > 3 && combined.length < 200) return { pass: false, reason: "Report contains too many links relative to its content." };

  const words = combined.split(/\s+/);
  if (words.length > 3) {
    const unique = new Set(words);
    if (unique.size / words.length < 0.3) return { pass: false, reason: "Report contains too many repeated words." };
  }

  const abusePatterns = /\b(fuck\s*you|kill\s*yourself|kys|stfu|die|hack|ddos|dox)\b/i;
  if (abusePatterns.test(combined)) return { pass: false, reason: "Report contains inappropriate content. Please be respectful." };

  return { pass: true };
}

export function sanitizeString(input: string, maxLength: number): string {
  return input.slice(0, maxLength).trim();
}

// Firestore doc IDs cannot contain '/' or be empty
export function isValidDocId(id: string): boolean {
  return id.length > 0 && id.length <= 128 && !/[/]/.test(id);
}

export function isValidScreenshotUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!["https:"].includes(parsed.protocol)) return false;
    // Block internal/private network URLs
    const hostname = parsed.hostname.toLowerCase();
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0") return false;
    if (hostname.startsWith("10.") || hostname.startsWith("192.168.")) return false;
    // 172.16.0.0 – 172.31.255.255 are private; other 172.x.x.x are public
    const m172 = hostname.match(/^172\.(\d+)\./);
    if (m172 && Number(m172[1]) >= 16 && Number(m172[1]) <= 31) return false;
    if (hostname.endsWith(".local") || hostname.endsWith(".internal")) return false;
    // IPv6 localhost and ULA (Unique Local Address) blocking
    if (hostname === "[::1]" || hostname === "::1") return false;
    if (/^\[?f[cd][0-9a-f]{2}:/i.test(hostname)) return false;
    // Only allow common image hosting domains
    const allowedDomains = ["cdn.discordapp.com", "media.discordapp.net", "i.imgur.com", "imgur.com", "raw.githubusercontent.com", "user-images.githubusercontent.com"];
    return allowedDomains.some(d => hostname === d || hostname.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

// Sanitize rate limit keys to prevent bypass via special characters
export function sanitizeRateLimitKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9:_\-@.]/g, "_").slice(0, 200);
}
