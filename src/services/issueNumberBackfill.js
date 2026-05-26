/**
 * Assign sequential ticket numbers to any open issues that lack one. Pure
 * orchestration — the data-access API is injected so this can be unit-tested
 * without Firestore.
 *
 * Expected api shape:
 *   listOpenIssuesMissingNumbers(): Promise<{ id, number?, ... }[]>
 *   allocateIssueNumber(): Promise<number>      // shared counter, monotonic
 *   setIssueNumber(id, number): Promise<void>
 *
 * Returns { assigned: [{ issueId, number }], skipped: number }
 */
async function backfillMissingIssueNumbers(api) {
  const candidates = await api.listOpenIssuesMissingNumbers();
  const assigned = [];
  for (const doc of candidates) {
    if (typeof doc.number === 'number') continue;
    const number = await api.allocateIssueNumber();
    await api.setIssueNumber(doc.id, number);
    assigned.push({ issueId: doc.id, number });
  }
  return { assigned, skipped: candidates.length - assigned.length };
}

module.exports = { backfillMissingIssueNumbers };
