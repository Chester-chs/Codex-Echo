# Personal Bark alerts with GitHub

**English** | [简体中文](GITHUB_BARK.md) · [README](../README.md)

For most people, [connecting Bark on the website](BARK_SETUP.en.md) is easier. This optional route runs in your own GitHub repository without using a website subscription slot. Use only one route per phone to avoid duplicates.

## Setup

1. **Prepare Bark.** Install it and enable Lock Screen notifications as described [here](BARK_SETUP.en.md#1-prepare-bark). Copy your real push address.
2. **Create your repository.** Sign in to GitHub, open [Codex Echo](https://github.com/Chester-chs/Codex-Echo), then select **Use this template → Create a new repository**. Choose your own account, a name such as `my-codex-alerts`, and **Public** for standard free hosted runners. Leave **Include all branches** off. Continue in your new repository.
3. **Save the secret.** Go to **Settings → Secrets and variables → Actions → Secrets → New repository secret**. Name: `BARK_DEVICE_KEY`. Secret: your Bark push address. Select **Add secret**. Do not put it in Variables, code or comments.
4. **Send one test.** Open **Actions → Personal Bark alerts** (not **Check**). Enable workflows if prompted. Select **Run workflow**, choose `main`, enable **Send one test notification to your configured Bark device**, then run once. Lock your iPhone and confirm receipt.

Automatic checks then run on a **10-minute schedule**, with possible GitHub delays. You can close the website and turn off your computer. The first check establishes a baseline; old announcements are not replayed. This notifier depends on the shared public feed.

## Optional preferences

Defaults: reset and forecast alerts on, 60% threshold, Chinese notifications. Add only the settings you want to change under **Settings → Secrets and variables → Actions → Variables → New repository variable**:

| Name | Value |
|---|---|
| `BARK_LANGUAGE` | `en` for English, `zh` for Chinese |
| `BARK_THRESHOLD` | `40`–`90` in steps of 5, without `%` |
| `BARK_RESET_ALERTS` | `true` / `false` |
| `BARK_FORECAST_ALERTS` | `true` / `false` |
| `BARK_ENABLED` | `false` to pause, `true` to resume |

Changes apply on the next run. The forecast threshold does not affect reset plans.

## Stop or troubleshoot

- **Stop:** Actions → Personal Bark alerts → **… → Disable workflow**. Delete the `BARK_DEVICE_KEY` secret if you no longer need it.
- **No test:** open the run → **notify → Check signals and notify my device**. “Bark is not configured” means the secret is missing; a green run alone does not prove phone delivery.
- **Bark has it, Lock Screen does not:** check notification permission, Focus and Scheduled Summary.
- **No scheduled runs:** verify the workflow is enabled. GitHub may disable public-repository schedules after 60 days without activity; re-enable if needed.
- **403 error:** check repository/organization Actions restrictions. No personal access token is needed.

Keep the generated `echo-notifier-state` branch intact; it stores notification history for deduplication, not your raw Bark key. In a public repository, that history is public. No server purchase is needed; private repositories have different runner allowances. See [GitHub billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions) and [schedule limits](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).
