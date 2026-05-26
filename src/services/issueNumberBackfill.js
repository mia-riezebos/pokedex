/**
 * Assign sequential ticket numbers to any open issues that lack one. Pure
 * orchestration — the data-access API is injected so this can be unit-tested
 * without Firestore.
 *
 * Expected api shape:
 *   listOpenIssuesMissingNumbers(): Promise<{ id, number?, ... }[]>
 *   allocateIssueNumber():          Promise<number>          // shared counter
 *   setIssueNumberIfMissing(id, n): Promise<boolean>         // true if written;
 *                                                            // false if doc gone
 *                                                            // OR another writer
 *                                                            // assigned a number
 *                                                            // first (race lost)
 *
 * Returns { assigned: [{ issueId, number }], skipped: number }
 *   `skipped` counts candidates that were filtered out by the typeof check
 *   plus candidates whose setIssueNumberIfMissing returned false (race-lost).
 */
async function backfillMissingIssueNumbers(api) {
  const candidates = await api.listOpenIssuesMissingNumbers();
  const assigned = [];
  for (const doc of candidates) {
    if (typeof doc.number === 'number') continue;
    const number = await api.allocateIssueNumber();
    const ok = await api.setIssueNumberIfMissing(doc.id, number);
    if (ok) assigned.push({ issueId: doc.id, number });
  }
  return { assigned, skipped: candidates.length - assigned.length };
}

module.exports = { backfillMissingIssueNumbers };
