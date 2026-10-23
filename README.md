# Codex Echo

**English** | [简体中文](README.zh-CN.md)

Codex reset plans, completion updates, a history calendar and collected Tibo posts — in one page, with optional Bark alerts for iPhone.

**[Open website](https://echo-radar.pages.dev/) · [Set up Bark](docs/BARK_SETUP.en.md)**

![Codex Echo website preview](docs/images/desktop-en.png)

## Features

- Reset countdowns and completion updates, with source links.
- London / Beijing / UTC time, English / Chinese, and saved preferences.
- Announcement history, calendar and Tibo posts.
- Your own Bark subscription: reset and forecast alerts, adjustable threshold, and unsubscribe anytime.

## Get started

1. Install [Bark](https://github.com/Finb/Bark) on your iPhone and allow Lock Screen notifications.
2. Copy your Bark push address.
3. Open the website → **Phone alerts from the cloud** → paste the address → **Connect and save**.
4. Send a test notification and check your Lock Screen.

**Bark works with the website closed and your computer off.** A recognized plan triggers an alert; matching completion evidence triggers another, even if the reset happens early. Duplicate confirmations are suppressed. Page notifications require the page to stay running.

[Step-by-step Bark guide](docs/BARK_SETUP.en.md) · [Optional personal GitHub notifier](docs/GITHUB_BARK.en.md)

## Good to know

- Once upstream data is available, website updates and cloud alerts normally take about **1–4 minutes**; upstream delays are additional. Posts may be missing, and unfamiliar wording may not be recognized.
- Forecasts are third-party estimates. Plans are not completed resets; completion requires source evidence.
- This independent project is not affiliated with OpenAI and does not monitor your account. Your personal allowance may differ; calendar counts are announcement counts.
- Website subscriptions are currently free with limited capacity. Keep your Bark address private.

## Development

Node.js 24+: run `npm ci`, `npm test`, then `npm run build`.

[Collection and deployment](docs/MINUTE_DISCOVERY.en.md) · [Optional Queues](docs/CLOUDFLARE_QUEUES.en.md) · [MIT License](LICENSE)

Data includes [codex-reset.com](https://codex-reset.com) and [AIPlanWatch](https://codex-reset.aiplanwatch.com/). Thanks to [Bark](https://github.com/Finb/Bark) and the [open-source dependencies](licenses/).
