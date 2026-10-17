# Minute post discovery and Bark

[简体中文](MINUTE_DISCOVERY.md) | [English](MINUTE_DISCOVERY.en.md)

The minute job checks codex-reset.com confirmations, then `/api/feed` and `/tibo/x`. Each address has an independent persistent 60-second request permit shared with full collection, and 429 responses honor `Retry-After`. Plans, commitments and completions enter D1 directly and are sent in the same invocation, or submitted to Cloudflare Queues when configured. Push does not wait for KV propagation.

The website merges available posts, everyday updates and replies. Only added posts or changed content cause KV writes; engagement counters, upstream fetch timestamps and polling health alone do not. The page refreshes every minute and API caching remains 30 seconds. Other full collection follows deployment configuration, currently 10 minutes in production. For example, 144 daily full collections plus 100 minutes with changed posts would use about 244 KV writes. This is an illustrative estimate, not a daily cap or guarantee.

These sources are not a complete live X stream. Everyday posts absent upstream cannot be retrieved, and the public text archive can lag. Delivery within 1–4 minutes of publication is a goal, not a guarantee: upstream polling and caching, Cron scheduling, rate limits, queue backlog and networking affect latency. Ordinary posts only update the website and never trigger Bark. Existing probability forecasts retain their independent settings and threshold.

## Classification and deduplication

- Self-replies may inherit reset context and scope from their parent, from the current or retained feed. Only the current post supplies a time. A missing parent leaves the candidate eligible for a later check. Replies to other users never push, even when labeled signal upstream.
- PST/PT/PDT and unqualified EOD use `America/Los_Angeles`, including daylight saving; UTC/GMT use UTC. Relative and deadline language uses “By about”, not a confirmed completion time.
- Plans share event keys with the slow path. A concrete plan in the same thread within 10 minutes supersedes an unsent commitment; a delivered commitment can still be followed by the more specific plan. Cancelled or superseded pending plans do not send.
- A device receives at most one completion alert in six hours across tweet confirmations, provider observations and the matching legacy reset path. Uncertain transport outcomes retain the existing handling policy; provider acceptance does not prove Lock Screen delivery.
- First monitor activation establishes a persistent start without replaying earlier posts. Later deployments, including a new tweet channel, reuse the active monitor start for both direct and legacy insertion. Still-valid, unsent announcements from the past six hours are recovered only if posted after both monitor activation and device binding. A later feature fence left by the old version no longer hides them. Existing event keys and receipts prevent already-sent plans from repeating; subscriptions, device keys, preferences and thresholds stay intact.
- Alerts retain original text, self-reply parent text and London/Beijing timestamps. Chinese uses retained translations first; when enabled, at most two short passages receive a bounded free translation attempt. Failures leave an explicit translation-pending message and retain the original.

Tests retain real feed text and parent relationships. The current feed/timeline does not expose reply metadata for “Done and dusted” or the older “Hi. It is done.”, so the project's existing free FxEmbed mirror was also checked: neither is a reply. User-provided excerpts in `tibo-post-cases.json` are kept separate from source snapshots; timeline summaries are never presented as original tweets.

## Deployment

1. Pull the latest source and verify existing dependencies:

   ```powershell
   npm ci
   npm test
   npm run build
   ```

2. Deploy the Worker with your existing private configuration:

   ```powershell
   npx wrangler deploy --config web/wrangler.jsonc
   ```

   This change does not alter `web/wrangler.jsonc`, subscription schemas or Secrets. It does not require a paid service or a new Queue. Keep the existing minute Cron; the 5/10-minute full-source interval is independent.

3. Publish the frontend build through the existing workflow. The canonical site stays [echo-radar.pages.dev](https://echo-radar.pages.dev/). First installation stays silent for earlier posts. Upgrades retain the monitor start and recover still-eligible unsent announcements without repeating sent messages.

## Verify with live logs

Run in PowerShell from the repository:

```powershell
npx wrangler tail --config web/wrangler.jsonc --format pretty |
  Select-String 'tweet_alert|tweet_alert_skipped|posts_updated'
```

Wait for real new posts. The cloud service runs with the website and your computer closed; this terminal is only for viewing logs.

| Event | Meaning |
| --- | --- |
| `tweet_alert` | A new plan/commitment/completion matched. `class` identifies it, `selfReply` identifies self-replies, and `lagSeconds` is discovery time minus publication time. This is not delivery confirmation. |
| `tweet_alert_skipped` | A candidate was excluded. Inspect `reply_to_other`, `parent_missing` or `no_rule_match`; missing-parent candidates can be checked again. |
| `posts_updated` | New website posts, with `added` and the newest added post's `lagSeconds`. No log is emitted for unchanged IDs, even if retained text or translations were updated. |

Remove `Select-String` to inspect sending and failure logs. Existing `bark_check`/`bark_queue_batch` logs describe dispatch attempts; only seeing the notification on the iPhone confirms device delivery. Never share device addresses, keys or management tokens.
