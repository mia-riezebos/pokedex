/**
 * Simple text similarity for duplicate issue detection.
 * No external API needed — uses word overlap (Jaccard similarity).
 */

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2); // skip tiny words
}

function jaccardSimilarity(a, b) {
  const setA = new Set(tokenize(a));
  const setB = new Set(tokenize(b));
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const word of setA) {
    if (setB.has(word)) intersection++;
  }

  const union = new Set([...setA, ...setB]).size;
  return intersection / union;
}

/**
 * Find potential duplicate issues from a list of existing open issues.
 * Compares both summary and full text.
 * @param {string} newSummary - The AI-generated summary of the new issue
 * @param {string} newText - The raw text of the new report
 * @param {Array} existingIssues - Array of existing open issues from Firestore
 * @param {number} threshold - Similarity threshold (0-1), default 0.4
 * @returns {Object|null} Best matching issue or null if no duplicates found
 */
function findDuplicate(newSummary, newText, existingIssues, threshold = 0.4) {
  let bestMatch = null;
  let bestScore = 0;

  for (const issue of existingIssues) {
    // Compare summaries (weighted higher)
    const summarySim = jaccardSimilarity(newSummary, issue.summary || '');
    // Compare full text
    const textSim = jaccardSimilarity(newText, issue.text || '');
    // Also check category match as a boost
    const categoryBoost = 0; // will be applied externally

    // Weighted score: summary matters more
    const score = (summarySim * 0.6) + (textSim * 0.4);

    if (score > bestScore) {
      bestScore = score;
      bestMatch = { issue, score, summarySimilarity: summarySim, textSimilarity: textSim };
    }
  }

  if (bestMatch && bestScore >= threshold) {
    return bestMatch;
  }

  return null;
}

module.exports = { findDuplicate, jaccardSimilarity };
