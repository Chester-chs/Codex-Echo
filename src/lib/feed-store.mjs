import { normalizeFeed } from "./domain.mjs";
import {preferResetConfirmation,interpretResetDirective} from './reset-plan.mjs';
export function createFeedLoader({
  request,
  storage,
  url,
  now = () => new Date().toISOString(),
}) {
  const cacheKey = `pulse:feed:${url}`;
  let sequence = 0;
  let retained = null;
  return async function load() {
    const current = ++sequence;
    try {
      const response = await request(url);
      if (response.statusCode !== 200) throw new Error("Feed unavailable");
      // A cache hit or a temporarily missing D1 field must never undo completion evidence.
      let cached=null;try{cached=storage.get(cacheKey)?.payload;}catch{}
      const confirmation=preferResetConfirmation(preferResetConfirmation(cached?.resetConfirmation,retained?.resetConfirmation),response.data?.resetConfirmation);
      const terminals=[...(cached?.posts||[]),...(retained?.posts||[])].filter(r=>['completed','cancelled'].includes(interpretResetDirective(r)?.kind)&&Date.now()-Date.parse(r.postedAt)<7*86400000);
      const payload={...response.data,resetConfirmation:confirmation};
      if(terminals.length){
        const posts=new Map((response.data.posts||response.data.resets||[]).map(r=>[r.id||r.postId,r]));
        for(const record of terminals){const id=record.id||record.postId;if(!['completed','cancelled'].includes(interpretResetDirective(posts.get(id))?.kind))posts.set(id,record);}
        payload.posts=[...posts.values()];
      }
      const feed = normalizeFeed(payload),
        checkedAt = now();
      if(current===sequence)retained=payload;
      try {
        if (current === sequence)
          storage.set(cacheKey, { payload, checkedAt });
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
