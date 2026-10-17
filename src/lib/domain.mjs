import {annotateResetPlan} from './reset-plan.mjs';
const DAY = 86400000;
const validDate = (value) =>
  typeof value === "string" && Number.isFinite(Date.parse(value));
const sourceLink = (value) =>
  typeof value === "string" &&
  /^https:\/\/(?:x\.com|twitter\.com)\/(?:i|[a-zA-Z0-9_]+)\/status\/\d+(?:\?[^\s]*)?$/.test(
    value,
  );

export function normalizeFeed(payload, now = Date.now()) {
  if (!payload || !Array.isArray(payload.resets))
    throw new Error("Invalid feed response");
  const seen = new Set();
  const records = payload.resets.map(annotateResetPlan)
    .flatMap((item) => {
      if (!item || !validDate(item.postedAt) || Date.parse(item.postedAt)>now || !sourceLink(item.url))
        return [];
      const id = item.url.match(/\/status\/(\d+)/)[1];
      if (seen.has(id)) return [];
      seen.add(id);
      return [
        {
          id,
          url: item.url,
          postedAt: new Date(item.postedAt).toISOString(),
          detectedAt: validDate(item.detectedAt)&&Date.parse(item.detectedAt)>=Date.parse(item.postedAt)-60000&&Date.parse(item.detectedAt)<=now+60000
            ? new Date(item.detectedAt).toISOString()
            : null,
          resetAt: validDate(item.resetAt)&&Date.parse(item.resetAt)<=now
            ? new Date(item.resetAt).toISOString()
            : null,
          scheduledAt:validDate(item.scheduledAt)?item.scheduledAt:null,
          category:item.category,
          visibilityOnly:item.visibilityOnly===true,
          approximate:item.approximate===true,
          isReply:item.isReply===true,replyingTo:item.replyingTo||null,inReplyToId:item.inReplyToId||null,parent:item.parent||null,providerKind:item.providerKind,explicitResetClaim:item.explicitResetClaim===true,
          type: item.category==='schedule'?'scheduled':["automatic", "banked"].includes(item.resetType)
            ? item.resetType
            : "unknown",
          resetTypes: [...new Set((Array.isArray(item.resetTypes)?item.resetTypes:[item.resetType]).filter(type=>['automatic','banked'].includes(type)))],
          classificationNote: typeof item.classificationNote==='string'?item.classificationNote:'',
          classificationNoteZh: typeof item.classificationNoteZh==='string'?item.classificationNoteZh:'',
          original: typeof item.original === "string" ? item.original : "",
          textStatus: item.textStatus || "source-copy",
          textSource: item.textSource || "",
          timeBasis: item.timeBasis || "api",
          context: item.context || "",
          translation:
            typeof item.translation === "string" ? item.translation : "",
          author:
            typeof item.author === "string"
              ? item.author
              : "Tibo · @thsottiaux",
        },
      ];
    })
    .sort((a, b) => Date.parse(b.postedAt) - Date.parse(a.postedAt));
  return {
    records,
    posts: Array.isArray(payload.posts) ? normalizeFeed({resets:payload.posts},now).records.map(r=>({...r,type:r.category==='schedule'?'scheduled':r.category==='forecast'?'forecastSignal':r.category==='reset'?r.type:'post'})) : [...records,...(Array.isArray(payload.signals)&&payload.signals.length?normalizeFeed({resets:payload.signals},now).records.map(r=>({...r,type:'forecastSignal'})):[])].sort((a,b)=>Date.parse(b.postedAt)-Date.parse(a.postedAt)),
    generatedAt: validDate(payload.generatedAt) ? payload.generatedAt : null,
    lastPolledAt: validDate(payload.lastPolledAt) ? payload.lastPolledAt : null,
    forecast: payload.forecast || null,
    signals: Array.isArray(payload.signals) && payload.signals.length
      ? normalizeFeed({resets:payload.signals},now).records.map(r=>({...r,type:'forecastSignal'})) : [],
    sources: Array.isArray(payload.sources)?payload.sources:[],
    status: payload.status || 'live',
    model: payload.model || null,
  };
}

export function filterRecords(
  records,
  type = "all",
  query = "",
  zone = "Europe/London",
) {
  const term = query.trim().toLowerCase().replaceAll("/", "-");
  return records.filter(
    (record) =>
      (type === "all" || record.type === type) &&
      `${record.original} ${record.translation} ${record.author} ${record.id} ${formatTime(record.postedAt, "en", zone)}`
        .toLowerCase()
        .replaceAll("/", "-")
        .includes(term),
  );
}

export function getForecast(forecast, now = Date.now()) {
  if (
    !forecast ||
    typeof forecast.probability !== "number" ||
    !Number.isFinite(forecast.probability) ||
    forecast.probability < 0 ||
    forecast.probability > 100
  )
    return null;
  if (forecast.kind === 'source-watch') {
    if (!['publishedAt','validUntil','checkedAt','sourceFreshUntil'].every(k=>validDate(forecast[k])) ||
        Date.parse(forecast.publishedAt)>now || Date.parse(forecast.checkedAt)>now+60000 ||
        Date.parse(forecast.validUntil)<=now || Date.parse(forecast.sourceFreshUntil)<=now ||
        !sourceLink(forecast.sourceUrl) || typeof forecast.basis!=='string' || !forecast.basis.trim() || typeof forecast.windowText!=='string' || !forecast.windowText.trim()) return null;
    return forecast;
  }
  if (
    !["publishedAt", "validUntil", "windowStart", "windowEnd"].every((k) =>
      validDate(forecast[k]),
    )
  )
    return null;
  if (
    Date.parse(forecast.publishedAt) > now ||
    now - Date.parse(forecast.publishedAt) > DAY ||
    Date.parse(forecast.validUntil) <= now ||
    Date.parse(forecast.windowEnd) <= now ||
    Date.parse(forecast.windowEnd) < Date.parse(forecast.windowStart)
  )
    return null;
  if (
    !sourceLink(forecast.sourceUrl) ||
    typeof forecast.basis !== "string" ||
    !forecast.basis.trim()
  )
    return null;
  return forecast;
}

export function getRhythm(records) {
  const dates = records
    .filter((record) => record.type === "automatic")
    .map((record) => Date.parse(record.postedAt))
    .sort((a, b) => a - b);
  const intervals = dates
    .slice(1)
    .map((date, i) => (date - dates[i]) / DAY)
    .filter((value) => value > 0);
  if (!intervals.length) return { medianDays: null, intervals: [], samples: 0 };
  const sorted = [...intervals].sort((a, b) => a - b),
    middle = Math.floor(sorted.length / 2);
  const medianDays =
    sorted.length % 2
      ? sorted[middle]
      : (sorted[middle - 1] + sorted[middle]) / 2;
  return {
    medianDays: Math.round(medianDays * 10) / 10,
    intervals,
    samples: intervals.length,
  };
}

export function formatTime(value, language = "zh", zone = "Europe/London") {
  if (!validDate(value)) return "—";
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(value));
    const get = (key) => parts.find((part) => part.type === key)?.value || "";
    return `${get("year")}/${get("month")}/${get("day")} ${get("hour")}:${get("minute")}`;
  } catch {
    return `${new Date(value).toISOString().slice(0, 16).replace("T", " ")} UTC`;
  }
}

export function sanitizeSettings(input = {}) {
  const value = input && typeof input === "object" ? input : {};
  return {
    language: value.language === "en" ? "en" : "zh",
    zone: ["Europe/London", "Asia/Shanghai", "UTC"].includes(value.zone)
      ? value.zone
      : "Europe/London",
    threshold: Number.isFinite(value.threshold)
      ? Math.max(40, Math.min(90, Math.round(value.threshold)))
      : 60,
    resetAlerts: value.resetAlerts === true,
    forecastAlerts: value.forecastAlerts === true,
    demo: value.demo === true,
  };
}

export function subscriptionOutcome(result, ids) {
  if (!ids.length) return "unconfigured";
  const accepted = ids.filter((id) => result?.[id] === "accept").length;
  return accepted === ids.length
    ? "authorized"
    : accepted
      ? "partial"
      : "denied";
}
