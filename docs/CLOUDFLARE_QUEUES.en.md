# Cloudflare Queues deployment and verification

[中文](CLOUDFLARE_QUEUES.md) | [English](CLOUDFLARE_QUEUES.en.md)

This release adds codex-reset.com and optional Queues. **A GitHub push does not create queues or edit your private production configuration.** Without `BARK_QUEUE`, the existing minute dispatcher continues. Keep all subscriptions, encryption secrets, D1 records and KV resources.

## 1. Create the queues

From the repository root in PowerShell, sign into your existing Cloudflare Free account:

```powershell
npx wrangler login
npx wrangler queues create bark-send
npx wrangler queues create bark-send-dlq
```

Use Workers Free; no paid upgrade is required for this feature. Currently 10,000 queue operations/day and 24-hour retention are included. Normal delivery typically costs three operations: write, read and delete. Recovery and retries also count. A handful of devices should normally remain well below the allowance. See [official pricing](https://developers.cloudflare.com/queues/platform/pricing/).

## 2. Merge into your own configuration

Existing deployment: edit **your existing `web/wrangler.jsonc`**. Preserve resource IDs, Worker name, domain and all existing variables. Do not replace it with the example. This project does not edit that private file for you.

Merge these top-level fields rather than duplicating existing keys:

```json
"queues": {
  "producers": [{ "binding": "BARK_QUEUE", "queue": "bark-send" }],
  "consumers": [{
    "queue": "bark-send",
    "max_batch_size": 5,
    "max_batch_timeout": 0,
    "max_retries": 3,
    "dead_letter_queue": "bark-send-dlq"
  }]
},
"triggers": { "crons": ["*/5 * * * *", "* * * * *"] },
"observability": { "enabled": true, "head_sampling_rate": 1 }
```

Add `"PUBLIC_POLL_SECONDS": "300"` (reports the five-minute collection interval), and `"BARK_RESEND_UNCERTAIN": "true"` within existing `vars`. Keep `BARK_ENABLED` and `BARK_VISITORS_ENABLED` at `"true"`. `false` leaves uncertain sends as unknown without resending; `true` retries with the same collapse ID, up to three provider attempts. Never commit secrets.

Use `web/wrangler.example.jsonc` only for a fresh deployment, filling in your own KV/D1 IDs and following the existing initialization/secrets instructions. Existing installations need no new database or migration and must not clear records.

## 3. Check and deploy

```powershell
npm ci
npm test
npm run build
npx wrangler deploy --config web/wrangler.jsonc --dry-run
npx wrangler deploy --config web/wrangler.jsonc
npx wrangler tail --config web/wrangler.jsonc --format pretty
```

Recommended collection is every five minutes for posts/timeline and every minute for `/api/forecast`. Each endpoint is requested at most once per minute; persistent request timestamps fence overlapping cron invocations. Local requests also share a minute cache. The page reads the backend every two minutes; it is not a live X stream. Aim for a few minutes, but **1–3 minutes is not a guarantee**: posts may wait for a five-minute collection tick.

`latest_alert` has no stable public schema. The saved snapshot confirms only `kind=reset, state=confirmed`. Unknown warning types are logged, never guessed or pushed. Explicit plans still use the existing post rules; vague “Landing…” text alone does not become a reset commitment. Measurement refers to the provider’s own monitored accounts, not proof of your personal allowance.

The first enablement establishes a baseline without history. Events must be less than six hours old and newer than each device’s binding. Repeated appearances of the same source event do not requeue; separate plans and completion notices still notify separately. When the source is healthy, a sent confirmation suppresses the legacy notice for the same post or exact explicit reset instant. After 15 minutes without source health, the legacy path remains available. Nearby events are not merged merely by time.

## 4. Verify

In `wrangler tail`, look for:

- `codex_reset_alert`: newly enqueued confirmation, with post ID and discovery lag.
- `codex_reset_alert_ignored`: unknown raw kind/state; do not weaken validation to silence it.
- `codex_reset_failed`: safe source failure reason without response bodies.
- `bark_queue_batch`: size, sent, retried, skipped and D1 queries (at most 48).
- `bark_sent`: Bark accepted a reset notice, with post ID/lag and no device details.

Use the website’s cloud-alert panel to send one test to **your own device**. Check the queue log and actual iPhone Lock Screen. The cloud runs with the page closed and computer off. Queues deliver at least once; database claims and terminal receipts handle duplicates. Absolute exactly-once delivery across external services cannot be guaranteed after a network interruption.

Do not alter the real timeline to manufacture confirmations. New upstream schemas require real evidence before support is added.

### Test a Bark collapse ID on one device

This script sends **two explicitly labelled test messages with the same `id`**, five seconds apart, without writing the database or real data. It prompts for your address with hidden input; do not put it in arguments, files, logs or screenshots. Bark’s official server passes `id` to APNs `CollapseID`. Actual merging depends on iOS/Bark and whether messages have already arrived; it does not guarantee one Notification Center entry forever.

```powershell
node scripts/test-bark-collapse.mjs
```

Paste your own address at the hidden prompt and press Enter. Compare the Lock Screen and Bark history. The test title includes a timestamp. Do not record a public terminal while entering the address.

## 5. Troubleshooting and rollback

- Creation/binding errors: check Queues availability and matching names in Cloudflare Dashboard. Create resources before deploying a queues binding.
- Disable Queues: remove `queues` from your private configuration and redeploy. D1 subscriptions/events remain; minute dispatch resumes. Personal mode and the GitHub Actions notifier never use Queues.
- Daily caps: 20 attempts/device and 600 site-wide per UTC day. Events are deferred, but expiry cancels stale events instead of delivering old reset notices.
- Inspect `bark-send-dlq` in Cloudflare Dashboard before replaying anything. D1 retains pending/retry records, and scheduled recovery rescues unfinished work.

Attribution: [Data: codex-reset.com](https://codex-reset.com).
