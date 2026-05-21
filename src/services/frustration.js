// Cheap regex/keyword frustration pre-check. Runs on OP messages only,
// before the LLM call, so the bot can exit and file instead of asking more.

const PHRASES = [
  /\bridiculous\b/i,
  /\bembarrass(ing|ed|ment)?\b/i,
  /\bis this an? (ai|bot|robot)\b/i,
  /\b(useless|pointless|terrible|awful)\b/i,
  /\bi (already )?(told|said) (you|this|that)\b/i,
  /\bwaste of (my )?(time|money)\b/i,
  /\b(give me|talk to|get me|i want|need) a (human|person|real person|agent)\b/i,
  /\b(hire me|do better|come on)\b/i,
  /\bwtf\b/i,
  /\b(f+u+c+k|shit|crap|damn|bullshit)\b/i,
];

function isShouting(text) {
  // A "sentence" of >=3 letters that is entirely uppercase, with >=2 words.
  const letters = text.replace(/[^a-zA-Z]/g, '');
  if (letters.length < 6) return false;
  const upper = text.replace(/[^A-Z]/g, '').length;
  const lower = text.replace(/[^a-z]/g, '').length;
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.length >= 2 && upper >= 6 && lower === 0;
}

function detectFrustration(text) {
  if (!text || typeof text !== 'string') return { frustrated: false, signal: null };
  for (const re of PHRASES) {
    if (re.test(text)) return { frustrated: true, signal: re.source };
  }
  if (isShouting(text)) return { frustrated: true, signal: 'all-caps' };
  return { frustrated: false, signal: null };
}

module.exports = { detectFrustration };
