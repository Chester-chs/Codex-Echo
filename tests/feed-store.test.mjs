import test from "node:test";
import assert from "node:assert/strict";
import { createFeedLoader } from "../src/lib/feed-store.mjs";

function store() {
  const values = new Map();
  return {
    get: (key) => values.get(key),
    set: (key, value) => values.set(key, value),
  };
}
const payload = (id) => ({
  resets: [
    {
      postId: id,
      url: `https://x.com/i/status/${id}`,
      postedAt: "2026-10-16T10:00:00Z",
      resetType: "automatic",
    },
  ],
});
test('an online response with stale upstream data is distinct from an offline cache',async()=>{
 const load=createFeedLoader({url:'https://source.example',storage:store(),request:async()=>({statusCode:200,data:{resets:[],status:'stale'}})});
 assert.equal((await load()).mode,'stale');
});
test("a late older request cannot overwrite a newer cache", async () => {
  const storage = store(),
    pending = [];
  const load = createFeedLoader({
    url: "https://source.example",
    storage,
    request: () => new Promise((resolve) => pending.push(resolve)),
  });
  const older = load(),
    newer = load();
  pending[1]({ statusCode: 200, data: payload("2") });
  await newer;
  pending[0]({ statusCode: 200, data: payload("1") });
  await older;
  assert.equal(
    storage.get("pulse:feed:https://source.example").payload.resets[0].postId,
    "2",
  );
});
test("a network failure shows cached data as cached rather than live", async () => {
  const storage = store();
  let fail = false;
  const load = createFeedLoader({
    url: "https://source.example",
    storage,
    request: async () => {
      if (fail) throw new Error("offline");
      return { statusCode: 200, data: payload("1") };
    },
  });
  await load();
  fail = true;
  const result = await load();
  assert.equal(result.mode, "cached");
  assert.equal(result.feed.records[0].id, "1");
});
test("a malformed response without valid cache is unavailable", async () => {
  const load = createFeedLoader({
    url: "https://source.example",
    storage: store(),
    request: async () => ({ statusCode: 200, data: { error: "bad schema" } }),
  });
  assert.equal((await load()).mode, "unavailable");
});
