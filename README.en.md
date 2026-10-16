# Codex Echo · Codex 回响

[简体中文](README.md) | **English**

A simple **Codex reset announcement and forecast radar**: the latest announcement, a history calendar, collected Tibo posts and **Bark notifications on your iPhone Lock Screen**.

**[Open the website](https://echo-radar.pages.dev/) · [Connect Bark on iPhone](docs/BARK_SETUP.en.md)**

## Website preview

These are screenshots of the public website. Dates, counts and forecasts are snapshots; visit the website for current values.

![Codex Echo desktop: latest announcement, forecast and history statistics](docs/images/desktop-en.png)

<details>
<summary>View the mobile layout</summary>

<img src="docs/images/mobile-en.png" alt="Actual Codex Echo mobile screenshot" width="390" />

</details>

<details>
<summary>View an announced-plan example (synthetic data)</summary>

**This is a local simulation, not a real announcement or a claim that a reset is currently five hours away.** A precise source announcement activates the countdown alongside the latest historical post. This example shows the Chinese interface.

![Synthetic announced reset plan example, not a real announcement](docs/images/reset-plan-example.png)

</details>

## Recommended: connect Bark on the website

1. Install **Bark** on your iPhone and allow Lock Screen notifications.
2. Copy your push address from Bark.
3. Open the website, scroll to **Phone alerts from the cloud**, paste the address, choose alert types, threshold and language, then **Connect and save**.
4. Send a test notification, close the website and lock your phone to verify receipt.

No GitHub account, code download or purchased server is needed. The full guide covers each step, saving, unsubscribing and troubleshooting messages visible inside Bark but absent from the Lock Screen.

| Mode | Requirement |
|---|---|
| **Bark cloud alerts (recommended)** | Connect your own Bark; the cloud can send with the website closed. Allow phone notifications |
| Page notifications | **Keep the page open and running.** Closing stops them; backgrounding or locking may suspend them |

The preferences are independent. Use Bark for closed-page alerts. The shared trial currently supports 30 devices, with 20 attempts per device per day, enough for a small group.

<details>
<summary>Optional: run your own GitHub Bark notifier</summary>

## GitHub setup: one required setting

1. Sign in. Select **Use this template → Create a new repository**, choose your own account and a public repository, and copy only the default branch.
2. In your repository, open **Settings → Secrets and variables → Actions → Secrets → New repository secret**.
3. Set Name to `BARK_DEVICE_KEY`. Paste your Bark push address into Secret, then select **Add secret**.
4. Open **Actions → Personal Bark alerts → Run workflow**, select the test checkbox and run it. Verify the message on your iPhone Lock Screen.

The **[GitHub setup guide](docs/GITHUB_BARK.en.md)** covers every field and expected result. This runs your personal pushes separately without using a website subscription slot. Choose one notifier per phone to avoid duplicates.

Defaults: reset and forecast alerts on, 60% threshold, **Chinese notifications**. To receive English messages, add `BARK_LANGUAGE=en` under repository **Variables**.

| Name | Purpose | Default |
|---|---|---|
| `BARK_RESET_ALERTS` | Reset announcements: `true` / `false` | `true` |
| `BARK_FORECAST_ALERTS` | Source forecasts: `true` / `false` | `true` |
| `BARK_THRESHOLD` | 40–90 in steps of 5; no `%` | `60` |
| `BARK_LANGUAGE` | `zh` Chinese / `en` English | `zh` |
| `BARK_DAILY_LIMIT` | Attempts per UTC date, 1–20 | `20` |
| `BARK_ENABLED` | Set `false` to pause | `true` |

</details>

## Features and operation

- A single page for announcements, publication-date calendar, statistics, full collected posts and sources. Chinese/English website and messages.
- Personal Actions checks run on a 10-minute schedule using the shared public feed. The first run establishes a baseline without historical alerts.
- Keys belong in GitHub **Secrets** and are never stored raw in the state branch. Delivery claims are persisted before sending; uncertain outcomes are not automatically retried.
- **Bark is the only phone push service.** No qualifying new message means no automatic notification.

Standard GitHub-hosted runner time in public repositories is currently free. Scheduled tasks can be delayed; public repositories with no activity for 60 days have scheduled workflows disabled. [Billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions) · [Scheduling limits](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)

## Announced reset plans

When verified Tibo original text directly states a precise time, a prominent plan card shows a countdown and a separate calendar marker. The latest historical announcement stays visible. Relative times start at publication, never collection time.

At zero, the card says **Awaiting confirmation**; it never automatically declares completion or increments history. Later explicit completion, cancellation or a new plan updates the state. Conservative rules support direct hour/minute durations and full UTC/GMT dates. Vague, conditional or unsupported expressions do not create a countdown. Unconfirmed plans disappear 24 hours after their target.

The Bark **Reset announcements** switch also controls new plan alerts, labelled **Planned reset announced**. Forecast thresholds only affect forecast alerts. Superseded, cancelled and past-target plan retries stop. Existing subscriptions need no reconnection. With Reset announcements enabled, a new plan and a later explicit source confirmation each generate their own deduplicated alert. Reaching the target alone never triggers a completion alert or confirms your personal account allowance.

## Data boundaries

Announcement counts are not personal account credits or completed resets. Publication time is not necessarily completion time. Probabilities are public AIPlanWatch assessments, not official OpenAI promises. The public post archive may be incomplete.

Sources include [AIPlanWatch](https://codex-reset.aiplanwatch.com/), [tokenusage](https://tokenusage.dev/developers), public X embeds and [FxEmbed](https://github.com/FxEmbed/FxEmbed). Personal GitHub notifiers still depend on this project's shared public feed. Free-tier policies and availability can change.

<details>
<summary>Developers: source and local build</summary>

Subscribers can skip this section. The website uses Vue 3 / uni-app, with Cloudflare Workers and Bark for notifications. Development requires Node.js 24+.

```sh
npm ci
npm test
npm run build
```

Web output: `dist/build/h5/`. Run `npm run server`, then `npm run dev` in another terminal for local development. To deploy a Worker, copy `web/wrangler.example.jsonc` to `web/wrangler.jsonc`, configure your own KV/D1 resources, apply `web/migrations/` and set production secrets separately.

| Directory | Purpose |
|---|---|
| `src/` | Website, localization and mobile layouts |
| `web/` | Public API, Bark subscriptions and queue |
| `scripts/github-notifier.mjs` | Personal GitHub Bark notifier; no extra npm dependencies |
| `backend/` | Source collection and local development service |
| `tests/` | Data, timing, thresholds, deduplication and notification checks |

Uses Vue, uni-app, Cheerio, Lucide and Radix Colors. See `licenses/`. Original code is MIT licensed; upstream content retains its own terms. Unaffiliated with OpenAI, Bark or the original radar author.

</details>
