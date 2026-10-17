# Codex Echo · Codex 回响

[简体中文](README.md) | **English**

See **the latest Codex reset announcement, upcoming plans, a history calendar and collected Tibo posts** on one page. Connect **Bark** for iPhone Lock Screen alerts. The website supports Chinese and English, with no account required to browse.

**[Open the website](https://echo-radar.pages.dev/) · [Set up iPhone alerts](docs/BARK_SETUP.en.md)**

## What you can do

- **Follow reset news:** see the latest available reset timestamp, with its source basis shown. Times under 12 hours old are relative; older times use a date. Plans with a recognizable time show a countdown.
- **Check completion status:** distinguish awaiting confirmation, a reset observed by a source and Tibo's explicit confirmation, with links to the evidence.
- **Explore history:** browse announcements by publication date, view statistics and read collected Tibo posts.
- **Get phone alerts:** connect your own Bark, choose reset or forecast alerts, adjust the forecast threshold and notification language, and unsubscribe at any time.

This is an independent project based on public sources, unaffiliated with OpenAI. It does not sign in to or monitor your ChatGPT account. Check your account for your personal allowance.

## Preview

Dates, counts and forecasts in these screenshots are illustrative snapshots. Visit the website for current information.

![Codex Echo desktop: latest reset time, forecast and history statistics](docs/images/desktop-en.png)

<details>
<summary>View the mobile layout and alert settings</summary>

<img src="docs/images/mobile-en.png" alt="Codex Echo mobile layout" width="390" />

![Phone alert settings](docs/images/cloud-alerts-en.png)

</details>

## Get started

To browse announcements and posts, simply [open the website](https://echo-radar.pages.dev/). To receive iPhone alerts:

1. Install and open **Bark**, then allow notifications. In iPhone **Settings → Notifications → Bark**, enable **Lock Screen**. You can find its App Store link in the [official Bark project](https://github.com/Finb/Bark).
2. Copy your **push address** from Bark. Use your own real address and keep it private.
3. Open the website and expand **Phone alerts from the cloud** below the Tibo post list. Paste the address, choose alert types, threshold and language, then select **Connect and save**.
4. Select **Send a test notification** once, close the website and lock your phone. Confirm that the message actually appears on your phone.

**Once connected, you do not need to keep the website open or your computer switched on.** The cloud continues checking for new messages and sending alerts. Your iPhone needs internet access and permission to display Bark notifications. Browsing the website alone does not subscribe you.

No GitHub account, code download or purchased server is needed. For exact screen locations, address examples, saving, unsubscribing and troubleshooting, follow the **[Bark setup guide for iPhone](docs/BARK_SETUP.en.md)**.

### Choose your alerts

| Setting | What it does |
|---|---|
| **Reset announcements** | Alerts for definite reset commitments, plans and completion. A new plan triggers one alert; matching completion evidence triggers a separate alert later |
| **Source forecasts** | Alerts for new, valid forecasts that meet your threshold. A forecast is not a confirmed reset plan |
| **Forecast alert threshold** | Choose 40%–90% in steps of 5. At 75%, for example, a forecast must reach or exceed 75% to qualify. This does not affect reset announcement alerts |
| **Notification language** | Chinese or English, set independently of the website language |

Initial connection does not replay historical messages. Everyday posts and replies to other people are for browsing only and do not trigger reset alerts. A source observation and Tibo's later confirmation of the same plan share one completion alert.

### Change settings or unsubscribe

Return to **Phone alerts from the cloud**, make changes and select **Save alert preferences**. Turn off both alert types and save to pause delivery. Select **Unsubscribe and delete address** to leave; notifications already being sent may still arrive. Each person manages their own device and preferences without changing anyone else's alerts.

If you switch browsers or clear browser data, paste the same Bark address again to restore management. Anyone with that address can use it to send messages to your phone, so keep it private and out of public repositories or comments.

### Bark versus page notifications

| Method | Requirement |
|---|---|
| **Bark cloud alerts (recommended)** | Once connected and saved, alerts work with the website closed and computer shut down. Your phone needs internet access and notification permission |
| Page notifications | **Keep the page open and running.** Closing stops them; backgrounding or locking may suspend them |

These settings are independent: enabling page notifications does not connect Bark. Website subscriptions are currently a free trial for up to 30 devices, with at most 20 send attempts per device per UTC day, including tests and retries. You can send one test notification every 10 minutes.

## Understand reset status

| Website status | Meaning |
|---|---|
| **Planned reset announced** | The source provides a recognizable reset time, so the page shows a countdown. This does not mean allowance has already recovered |
| **Awaiting confirmation** | The planned time has passed without matching completion evidence. Reaching the target alone does not send a completion alert |
| **Reset observed by source** | A third-party source reports a reset on its monitored accounts. The countdown stops, with the observation time and source shown separately from Tibo's confirmation |
| **Completion confirmed** | Tibo's explicit completion message has been collected. Open the original post to verify it |

A definite reset commitment without a calculable time can trigger an advance notice, but no countdown is invented. A more specific plan posted later may trigger an additional plan alert.

When completion evidence matches an existing reset plan, the homepage shows “Time to enjoy GPT!” until one hour after the earliest observation or confirmation, then returns to the regular overview. Historical records remain available.

“Latest reset time” prefers a source-provided actual or observation time. If only a completion or reset announcement is available, it shows the publication time and labels the actual time as unknown. A planned time is never treated as a completed reset.

A source observation or public announcement does not guarantee that every account has recovered. Calendar markers use announcement publication dates; announcement counts are not completed-reset totals or your personal available uses.

<details>
<summary>See examples of planned, awaiting and completed states</summary>

These examples use synthetic data to illustrate the states, not current events.

**Plan announced:** a countdown appears. Plans are excluded from historical announcement counts.

![Synthetic example: plan announced](docs/images/reset-plan-example.png)

**Awaiting confirmation:** the target time has passed, and completion evidence is still needed.

![Synthetic example: awaiting completion confirmation](docs/images/reset-awaiting-example.png)

**Completion confirmed:** an explicit source confirmation updates the status and triggers a separate completion alert.

![Synthetic example: source confirmed completion](docs/images/reset-completed-example.png)

</details>

## Data updates and limitations

The cloud checks public posts and reset completion evidence every minute, and an open page refreshes every minute. **Once upstream data is available, display or notification normally takes about 1–4 minutes. This excludes the upstream source's own collection delay and is not a delivery guarantee.** Network conditions, service availability and phone notification settings also affect delivery.

- **Posts may be delayed or missing.** The website displays content collected by public sources, not a complete, live X timeline. Everyday posts are not guaranteed to appear immediately either.
- **Forecasts are third-party estimates.** Percentages come from AIPlanWatch's public assessment, not a probability stated by Tibo or a promise from OpenAI.
- **Completion requires evidence.** Until an upstream source reports it, the page still shows the plan or awaits confirmation. A countdown alone cannot establish that a reset happened.
- **Service acceptance is not phone receipt.** “Accepted by Bark” means the push service accepted the request. Check your phone to confirm delivery.

Main sources: [Data: codex-reset.com](https://codex-reset.com) (public posts, [text archive](https://codex-reset.com/tibo/x) and reset observations), [AIPlanWatch](https://codex-reset.aiplanwatch.com/), [tokenusage](https://tokenusage.dev/developers) and [follow-builders](https://github.com/zarazhangrui/follow-builders). Public X embeds and [FxEmbed](https://github.com/FxEmbed/FxEmbed) also help retrieve post text. The website retains source links for verification.

## Optional: run your own notifier

If website subscription slots are full, or you prefer to manage the notifier yourself, use the **[GitHub setup guide](docs/GITHUB_BARK.en.md)**. It walks through creating your repository, saving your Bark secret and verifying Lock Screen delivery, without installing a local development environment.

The GitHub version reads this project's shared public data and is scheduled to check every 10 minutes, with possible GitHub scheduling delays. It does not use a website subscription slot and runs with your computer shut down. Use either website binding or the GitHub notifier for the same phone to avoid receiving a copy from both services.

<details>
<summary>Developers: local setup and deployment</summary>

The website uses Vue 3 / uni-app, with Cloudflare Workers and Bark in the cloud. Node.js 24+ is required:

```sh
npm ci
npm test
npm run build
```

Web output is in `dist/build/h5/`. For local development, run `npm run server`, then `npm run dev` in another terminal.

To deploy your own Worker, copy `web/wrangler.example.jsonc` to `web/wrangler.jsonc`, configure your own KV / D1 resources, apply `web/migrations/` and set production secrets separately. See:

- [Data collection, notification flow and verification](docs/MINUTE_DISCOVERY.en.md)
- [Optional Cloudflare Queues configuration](docs/CLOUDFLARE_QUEUES.en.md)

| Directory | Purpose |
|---|---|
| `src/` | Website, localization and mobile layouts |
| `web/` | Public API, Bark subscriptions and delivery service |
| `scripts/github-notifier.mjs` | Personal GitHub Bark notifier |
| `backend/` | Source collection and local development service |
| `tests/` | Data, timing, thresholds, deduplication and notification checks |

</details>

## License and acknowledgments

Built with Vue, uni-app, Cheerio, Lucide and Radix Colors; see [licenses/](licenses/) for their terms. Original project code uses the [MIT License](LICENSE); upstream content retains its own terms. Thanks to the data providers and the Bark open-source project. This project is unaffiliated with their operators.
