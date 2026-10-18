import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeFeed,
  filterRecords,
  getForecast,
  getRhythm,
  formatTime,
  sanitizeSettings,
  subscriptionOutcome,
} from "../src/lib/domain.mjs";

const now = Date.parse("2026-10-16T12:00:00Z");
const record = (id, date, type = "automatic") => ({
  postId: id,
  postedAt: date,
  detectedAt: date,
  resetType: type,
  url: `https://x.com/i/status/${id}`,
});
const payload = {
  generatedAt: "2026-10-16T12:00:00Z",
  lastPolledAt: "2026-10-16T11:59:00Z",
  resets: [
    record("101", "2026-10-15T23:30:00Z"),
    record("102", "2026-10-12T10:00:00Z", "banked"),
  ],
};

test('all feed sections omit future publication dates and retain reviewed mixed types',()=>{
 const old={...record('201','2026-10-16T10:00:00Z'),id:'201',category:'reset',resetTypes:['automatic','banked']};
 const future={...record('202','2026-10-17T10:00:00Z'),id:'202',category:'reset'};
 const data=normalizeFeed({resets:[old,future],posts:[old,future],signals:[future]},now);
 assert.deepEqual(data.records.map(r=>r.id),['201']);
 assert.deepEqual(data.posts.map(r=>r.id),['201']);
 assert.equal(data.signals.length,0);
 assert.deepEqual(data.records[0].resetTypes,['automatic','banked']);
});

test('impossible collection times and future completion times are not displayed as facts',()=>{
 const date='2026-10-16T10:00:00Z';
 const invalid={...record('301',date),detectedAt:'2026-10-16T02:00:00Z',resetAt:'2026-10-17T10:00:00Z'};
 const records=normalizeFeed({resets:[invalid,{...invalid,postId:'302',url:'https://x.com/i/status/302',detectedAt:'2026-10-17T02:00:00Z'},{...invalid,postId:'303',url:'https://x.com/i/status/303',detectedAt:'2026-10-16T09:59:59Z'}]},now).records;
 assert.equal(records.find(r=>r.id==='301').detectedAt,null);
 assert.equal(records.find(r=>r.id==='302').detectedAt,null);
 assert.equal(records.find(r=>r.id==='303').detectedAt,'2026-10-16T09:59:59.000Z');
 assert.ok(records.every(r=>r.resetAt===null));
});

test('source watches preserve wording without manufacturing an absolute reset window',()=>{
 const f={kind:'source-watch',probability:40,publishedAt:'2026-10-16T04:30:52Z',validUntil:'2026-10-17T05:00:00Z',checkedAt:'2026-10-16T11:59:00Z',sourceFreshUntil:'2026-10-16T12:29:00Z',windowText:'within 24h',windowStart:null,windowEnd:null,sourceUrl:'https://x.com/i/status/200',basis:'Public hint'};
 assert.equal(getForecast(f,now)?.probability,40);
 assert.equal(getForecast({...f,sourceFreshUntil:'2026-10-16T11:00:00Z'},now),null);
 for(const invalid of [{basis:42},{windowText:{}},{basis:null}])assert.equal(getForecast({...f,...invalid},now),null);
});

test("rejects a broken upstream response instead of presenting an empty success", () => {
  assert.throws(() => normalizeFeed({ error: "unavailable" }), /feed/i);
});
test("sorts and deduplicates source posts and rejects unsafe source links", () => {
  const feed = normalizeFeed({
    ...payload,
    resets: [
      payload.resets[1],
      payload.resets[0],
      payload.resets[0],
      {
        ...record("103", "2026-10-17T00:00:00Z"),
        url: "https://x.com.attacker.test/i/status/103",
      },
      record("104", "invalid"),
    ],
  });
  assert.deepEqual(
    feed.records.map((r) => r.id),
    ["101", "102"],
  );
});
test("does not present a post publication time as the actual reset time", () => {
  const feed = normalizeFeed(payload);
  assert.equal(feed.records[0].postedAt, "2026-10-15T23:30:00.000Z");
  assert.equal(feed.records[0].resetAt, null);
  assert.equal(feed.records[0].original, "");
});
test("type filters and source search combine without losing the selected filter", () => {
  const feed = normalizeFeed(payload);
  assert.equal(filterRecords(feed.records, "banked", "102").length, 1);
  assert.equal(filterRecords(feed.records, "automatic", "102").length, 0);
  assert.equal(filterRecords(feed.records, "all", "not present").length, 0);
});
test("date search matches the displayed timezone and both date separators", () => {
  const feed = normalizeFeed({
    resets: [record("101", "2026-10-10T22:16:00Z")],
  });
  assert.equal(
    filterRecords(feed.records, "all", "2026/10/11", "Asia/Shanghai").length,
    1,
  );
  assert.equal(
    filterRecords(feed.records, "all", "2026-10-11", "Asia/Shanghai").length,
    1,
  );
  assert.equal(
    filterRecords(feed.records, "all", "2026/10/11", "Europe/London").length,
    0,
  );
});
test("expired or ungrounded predictions are never shown as current", () => {
  const forecast = {
    probability: 62,
    validUntil: "2026-10-17T12:00:00Z",
    publishedAt: "2026-10-16T10:00:00Z",
    windowStart: "2026-10-16T12:00:00Z",
    windowEnd: "2026-10-17T12:00:00Z",
    sourceUrl: "https://x.com/i/status/200",
    basis: "Public signal",
  };
  assert.equal(getForecast(forecast, now).probability, 62);
  assert.equal(
    getForecast({ ...forecast, validUntil: "2026-10-16T11:00:00Z" }, now),
    null,
  );
  assert.equal(getForecast({ ...forecast, probability: 160 }, now), null);
  assert.equal(getForecast({ ...forecast, sourceUrl: "" }, now), null);
  assert.equal(
    getForecast({ ...forecast, windowEnd: "2026-10-15T10:00:00Z" }, now),
    null,
  );
  assert.equal(
    getForecast({ ...forecast, publishedAt: "2026-10-18T10:00:00Z" }, now),
    null,
  );
});
test("historical intervals exclude banked resets and do not claim a future probability", () => {
  const feed = normalizeFeed({
    ...payload,
    resets: [
      record("1", "2026-10-01T00:00:00Z"),
      record("2", "2026-10-03T00:00:00Z"),
      record("3", "2026-10-05T00:00:00Z"),
      record("4", "2026-10-04T00:00:00Z", "banked"),
    ],
  });
  assert.deepEqual(getRhythm(feed.records), {
    medianDays: 2,
    intervals: [2, 2],
    samples: 2,
  });
});
test("timezone conversion handles date rollover and London daylight saving", () => {
  assert.match(
    formatTime("2026-10-15T23:30:00Z", "en", "Asia/Shanghai"),
    /10\/16.*07:30/,
  );
  assert.match(
    formatTime("2026-10-15T23:30:00Z", "zh", "Europe/London"),
    /10\/16.*00:30/,
  );
  assert.match(
    formatTime("2026-12-15T23:30:00Z", "en", "Europe/London"),
    /12\/15.*23:30/,
  );
  assert.equal(formatTime(null, "zh", "UTC"), "—");
});
test("new website visitors use English without changing subscription defaults", () => {
  for (const input of [undefined, null, {}, { language: "fr" }, { zone: "UTC" }]) {
    assert.equal(sanitizeSettings(input, "en").language, "en");
  }
  assert.equal(sanitizeSettings().language, "zh");
});

test("saved language and timezone survive reopening with an English website default", () => {
  for (const language of ["zh", "en"]) {
    for (const zone of ["Europe/London", "Asia/Shanghai", "UTC"]) {
      const restored = sanitizeSettings(JSON.parse(JSON.stringify({ language, zone })), "en");
      assert.equal(restored.language, language);
      assert.equal(restored.zone, zone);
    }
  }
});

test("stored settings cannot select an unsupported locale or invalid threshold", () => {
  assert.deepEqual(
    sanitizeSettings({
      language: "fr",
      zone: "Mars",
      threshold: 200,
      resetAlerts: true,
      forecastAlerts: false,
    }),
    {
      language: "zh",
      zone: "Europe/London",
      threshold: 90,
      resetAlerts: true,
      forecastAlerts: false,
      demo: false,
    },
  );
});
test("rejected subscription authorization is never reported as enabled", () => {
  assert.equal(subscriptionOutcome({ abc: "reject" }, ["abc"]), "denied");
  assert.equal(subscriptionOutcome({ abc: "accept" }, ["abc"]), "authorized");
  assert.equal(subscriptionOutcome({}, []), "unconfigured");
  assert.equal(
    subscriptionOutcome({ abc: "accept", def: "reject" }, ["abc", "def"]),
    "partial",
  );
});
