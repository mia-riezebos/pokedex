import { describe, it, expect } from 'vitest';
import { createFetcher } from '../../src/services/statusFetcher.js';

function okFetch(body) {
  return async () => ({ ok: true, status: 200, json: async () => body });
}

function failFetch(status = 500) {
  return async () => ({ ok: false, status, json: async () => ({}) });
}

function throwFetch(err) {
  return async () => { throw err; };
}

describe('createFetcher', () => {
  it('returns parsed JSON on success and resets consecutiveFailures', async () => {
    const fetcher = createFetcher({ fetchFn: okFetch({ ok: 1 }) });
    const body = await fetcher.fetchSummary('https://example.test/summary.json');
    expect(body).toEqual({ ok: 1 });
    expect(fetcher.getConsecutiveFailures()).toBe(0);
  });

  it('throws on non-2xx and increments consecutiveFailures', async () => {
    const fetcher = createFetcher({ fetchFn: failFetch(503) });
    await expect(fetcher.fetchSummary('https://example.test/x')).rejects.toThrow(/503/);
    expect(fetcher.getConsecutiveFailures()).toBe(1);
  });

  it('throws on fetch rejection and increments counter', async () => {
    const fetcher = createFetcher({ fetchFn: throwFetch(new Error('net-down')) });
    await expect(fetcher.fetchSummary('https://example.test/x')).rejects.toThrow(/net-down/);
    expect(fetcher.getConsecutiveFailures()).toBe(1);
  });

  it('accumulates failures until a success resets the counter', async () => {
    let shouldFail = true;
    const fetchFn = async () => {
      if (shouldFail) throw new Error('down');
      return { ok: true, status: 200, json: async () => ({}) };
    };
    const fetcher = createFetcher({ fetchFn });
    await expect(fetcher.fetchSummary('u')).rejects.toThrow();
    await expect(fetcher.fetchSummary('u')).rejects.toThrow();
    expect(fetcher.getConsecutiveFailures()).toBe(2);
    shouldFail = false;
    await fetcher.fetchSummary('u');
    expect(fetcher.getConsecutiveFailures()).toBe(0);
  });

  it('aborts the request when the timeout elapses', async () => {
    const fetchFn = (_url, { signal }) =>
      new Promise((_, reject) => {
        signal.addEventListener('abort', () => reject(new Error('aborted')));
      });
    const fetcher = createFetcher({ fetchFn, timeoutMs: 10 });
    await expect(fetcher.fetchSummary('u')).rejects.toThrow(/abort/i);
    expect(fetcher.getConsecutiveFailures()).toBe(1);
  });
});
