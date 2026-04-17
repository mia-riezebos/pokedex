function createFetcher({ fetchFn = fetch, timeoutMs = 10_000 } = {}) {
  let consecutiveFailures = 0;

  async function fetchSummary(url) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetchFn(url, { signal: ctrl.signal });
      if (!res.ok) {
        consecutiveFailures += 1;
        throw new Error(`HTTP ${res.status}`);
      }
      const body = await res.json();
      consecutiveFailures = 0;
      return body;
    } catch (err) {
      if (!/^HTTP \d+$/.test(err?.message ?? '')) consecutiveFailures += 1;
      throw err;
    } finally {
      clearTimeout(t);
    }
  }

  return {
    fetchSummary,
    getConsecutiveFailures: () => consecutiveFailures,
  };
}

module.exports = { createFetcher };
