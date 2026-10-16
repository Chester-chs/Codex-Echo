import { normalizeFeed } from "./domain.mjs";
export function createFeedLoader({
  request,
  storage,
  url,
  now = () => new Date().toISOString(),
}) {
  const cacheKey = `pulse:feed:${url}`;
  let sequence = 0;
  return async function load() {
    const current = ++sequence;
    try {
      const response = await request(url);
      if (response.statusCode !== 200) throw new Error("Feed unavailable");
      const feed = normalizeFeed(response.data),
        checkedAt = now();
      try {
        if (current === sequence)
          storage.set(cacheKey, { payload: response.data, checkedAt });
      } catch {}
      return { feed, checkedAt, mode: feed.status === 'stale' ? 'stale' : feed.status === 'degraded' ? 'degraded' : 'live' };
    } catch {
      try {
        const cache = storage.get(cacheKey);
        if (cache?.payload)
          return {
            feed: normalizeFeed(cache.payload),
            checkedAt: cache.checkedAt,
            mode: "cached",
          };
      } catch {}
      return {
        feed: { records: [], forecast: null },
        checkedAt: null,
        mode: "unavailable",
      };
    }
  };
}
