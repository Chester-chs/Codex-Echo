# Codex Echo: set up your own Bark notifications

[简体中文](GITHUB_BARK.md) | **English** · [Back to README](../README.en.md)

This guide assumes no GitHub experience. GitHub will check Codex reset announcements and source forecasts, then notify your own iPhone. **Bark is the only phone push service. Your computer and the website can be closed.**

## Choose your route

- For the quickest setup, open [Codex Echo](https://echo-radar.pages.dev/), expand **Phone alerts from the cloud**, paste your Bark address and connect. Use the page's test button. No GitHub account is required.
- To manage your own notifier, follow the GitHub steps below. This does not use a shared website subscription slot.

Choose one route per device. If switching from the website, unsubscribe there first to avoid receiving one message from each independent channel.

## Before you start

You need an iPhone with Bark, your own [GitHub account](https://github.com/), and a browser. A computer browser is easiest for configuration; your phone receives the messages. You can also use Safari on your iPhone.

You do not need to download code, use a terminal, install Node.js, buy a server/domain or create a personal access token. On mobile GitHub, repository tabs may scroll horizontally or appear under a menu. Safari's **Request Desktop Website** can help if the layout differs.

## Step 1: install Bark and copy your address

1. Find **Bark** in the iPhone App Store. Use the App Store link in the [official Bark project](https://github.com/Finb/Bark) to identify the app.
2. Install and open it once. Allow notifications when prompted.
3. In iPhone **Settings → Notifications → Bark**, enable **Allow Notifications** and **Lock Screen**. Some iOS versions also offer **Settings → Apps → Bark → Notifications**.
4. Copy the push address displayed by Bark. Its format is:

```text
https://api.day.app/YOUR_ACTUAL_DEVICE_KEY
```

This is a placeholder, **not an address to copy**. Copy the real address from your app. The full URL or just its device key is accepted. Only the default `api.day.app` service is supported.

**Checkpoint:** you have copied your own address. Keep it private: it can be used to send messages to your device.

## Step 2: create your own copy

1. Sign in to GitHub and open [Chester-chs/codex-echo-radar](https://github.com/Chester-chs/codex-echo-radar).
2. Above the file list, select **Use this template → Create a new repository**.
3. Fill in the form:

| Field | Value |
|---|---|
| **Owner** | Your own GitHub username |
| **Repository name** | `my-codex-alerts`, or another unused name in your account |
| **Description** | Optional |
| **Public / Private** | Prefer **Public** for free standard hosted runner time |
| **Include all branches** | Leave **unchecked**; copy only the default branch |

4. Select **Create repository from template**.

**Checkpoint:** the URL is now `github.com/YOUR_USERNAME/my-codex-alerts`. All remaining steps happen in **your repository**, not the author's repository. Public source does not mean your Bark key must be public.

## Step 3: add the one required secret

1. In your repository, select the top **Settings** tab.
2. In the left sidebar, select **Secrets and variables → Actions**. This is different from the top Actions tab used to run workflows.
3. Select **Secrets → New repository secret**.
4. Enter:

| Field | Value |
|---|---|
| **Name** | `BARK_DEVICE_KEY` exactly |
| **Secret** | Your actual push address copied from Bark |

5. Select **Add secret**.

**Checkpoint:** `BARK_DEVICE_KEY` appears in the Secrets list. GitHub hiding the saved value is normal; use its edit button to replace it later.

Do not create this as a Variable or put it in code, README text or public comments. GitHub supplies `GITHUB_TOKEN` automatically: **no second secret or paid API key is required**.

## Step 4: use the defaults or customize

You can proceed directly to Step 5. Defaults enable reset and forecast alerts, use a 60% threshold, send **Chinese messages**, and allow up to 20 attempts per UTC date.

For English messages, add `BARK_LANGUAGE` with value `en`.

To add any preference, open **Settings → Secrets and variables → Actions → Variables → New repository variable**. Fill Name and Value separately, then select **Add variable**. Add one row per setting; do not paste `NAME=value` into a single field.

| Name | Default | Accepted Value |
|---|---|---|
| `BARK_RESET_ALERTS` | `true` | `true` / `false` |
| `BARK_FORECAST_ALERTS` | `true` | `true` / `false` |
| `BARK_THRESHOLD` | `60` | `40`, `45`, …, `90`; omit `%` |
| `BARK_LANGUAGE` | `zh` | `zh` / `en` |
| `BARK_DAILY_LIMIT` | `20` | Integer 1–20; tests and retries count |
| `BARK_ENABLED` | `true` | `false` pauses this notifier |

**Example A, resets only:** add `BARK_FORECAST_ALERTS` with Value `false`; leave everything else unset.

**Example B, resets plus forecasts of at least 80%, in English:** add `BARK_THRESHOLD` with Value `80`, and `BARK_LANGUAGE` with Value `en`.

**Checkpoint:** the Variables list shows your chosen rows. Use lowercase values without quotes, spaces or a percent sign. README language links do not change notification language.

## Step 5: run a Lock Screen test

1. Select the top **Actions** tab in your own repository.
2. If GitHub asks, review the copied project and select **I understand my workflows, go ahead and enable them**. If there is no prompt, continue.
3. Select **Personal Bark alerts** on the left. **Check** is a separate code-check workflow and does not send notifications.
4. If this workflow is disabled, select **Enable workflow** first.
5. Select **Run workflow** and keep branch **main**.
6. **Check** `Send one test notification to your configured Bark device`, then select the **Run workflow** button inside the form.
7. Open the newest run. Refresh the list if it has not appeared. Yellow means queued/running, green means completed, red means failed.
8. Close the website, lock your iPhone and look for **“Codex Echo · Push test”**. With Chinese preferences, the title is **「Codex 回响 · 锁屏推送测试」**.

**Checkpoint: the message actually appears on your Lock Screen.** A green GitHub check or a message stored inside Bark alone does not prove this. Each newly started run with the test checkbox creates another test, so avoid repeated clicks.

### Read the result

Open the run → select the **notify** job → expand **Check signals and notify my device**:

| Log | Meaning / next action |
|---|---|
| `Bark is not configured` | No secret was found. Even a green run sent nothing. Recheck Step 3, your repository and the Secret name |
| `Personal notifications are paused` | Restore `BARK_ENABLED=true` in Variables |
| `... checked; dispatch attempts: 1` | One message was attempted; still verify receipt on the phone |
| `... checked; dispatch attempts: 0` | No attempt. Normal for a baseline or no new messages; select the test checkbox to test |
| `source_stale` | Source data is too old; automatic alerts wait for fresh data |
| Failed run | Use the troubleshooting table below, then test again |

## Step 6: leave automatic checks running

No further Start button is needed. Checks are scheduled every 10 minutes; later automatic runs appear as **schedule** in Actions history. Your browser and computer can be closed.

The first successful source check establishes a baseline without historical alerts. No new qualifying message means silence. The shared feed also refreshes about every 10 minutes, and GitHub can delay jobs: this is not instant delivery or a guaranteed ten-minute deadline.

Only newly collected qualifying announcements and valid new forecasts meeting your threshold are eligible. A public announcement does not prove your personal account allowance has recovered. Up to three messages are processed per run; explicit transient failures get at most three attempts. Uncertain outcomes are not automatically retried.

## Change, pause, stop or replace a device

| Goal | Action |
|---|---|
| Change threshold, language or alert types | Edit the Step 4 Variables; saved values apply next run |
| Pause notifications | Set `BARK_ENABLED=false`; change back to `true` to resume |
| Stop scheduled runs | Actions → Personal Bark alerts → workflow `…` menu → **Disable workflow** |
| Re-enable | Select **Enable workflow** on that page and run a test |
| Stop completely | Disable the workflow, then delete the `BARK_DEVICE_KEY` Secret. Unsubscribe on the website separately if needed |
| Replace a phone/address | Edit `BARK_DEVICE_KEY` and test again; a new device starts a fresh baseline |

Changing a threshold does not resend an already sent message. GitHub disables scheduled workflows in public repositories after 60 days without repository activity. Re-enable when needed; this project does not create empty commits to bypass that rule.

## Troubleshooting

| Symptom | What to check |
|---|---|
| No Settings / cannot add a secret | Sign in and check you are in your own repository. On mobile, scroll tabs or request the desktop site |
| No Use this template | Sign in and open the template's Code page. Code → Download ZIP only downloads files; it does not enable alerts |
| No Run workflow | Select your own Personal Bark alerts workflow, enable it and use main; do not select Check |
| Secret exists but “not configured” | It must be a **Repository secret**, not a Variable or Environment secret, named exactly `BARK_DEVICE_KEY` |
| `Invalid notification preferences` | Check lowercase true/false, threshold 40–90 in steps of 5, zh/en language, daily limit 1–20 and no quotes |
| `GitHub state request failed` / HTTP 403 | Check Settings → Actions → General for disabled Actions or organization restrictions. The workflow already requests contents-write; normally no default permission change is needed. PR creation/approval permission is unnecessary. Use a personal repository or ask the organization administrator if policy blocks it |
| Missing/corrupt state file | Do not clear it to retry. Preserve the error text and ask for help without sharing your key |
| Green run, no phone message | Check the test checkbox, pause switch and current phone's address. Open Bark once; review notification permission, Lock Screen, Focus and Scheduled Summary |
| Message inside Bark, none on Lock Screen | Review Lock Screen permission, Focus and Scheduled Summary; lock the phone and start a new manual test |
| Duplicate messages | Check for both website and GitHub subscriptions, or multiple running notifier repositories; retain one |
| Test works, no automatic announcement | Check whether a new message appeared after the baseline. Forecasts must also be valid and meet your threshold |
| No scheduled runs for a long time | Check workflow status, the 60-day inactivity rule, platform outages and limits. Keeping the website open does not fix this |

## Privacy, cost and dependencies

Keep the raw Bark address in your repository Secret; the author does not need it. The notifier creates `echo-notifier-state/state.json` (file `state.json` on branch `echo-notifier-state`) with an anonymous device digest, message identifiers, necessary public message content and outcomes. Raw keys are never stored there. State in a public repository is public, and Git history may retain necessary public content. Do not edit/delete the state file or merge this branch into main.

This setup uses public-repository standard runners and requires no purchased server/domain or paid API. Private repositories have different minute allowances. Policies, free tiers and availability can change; permanent free or immediate delivery is not guaranteed. The notifier runs your personal pushes independently but still reads Codex Echo's shared public feed.

Official references: [Template repositories](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-repository-from-a-template) · [Secrets](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets) · [Manual runs](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow) · [Billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions) · [Schedules](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)

**Final checklist: your own repository → Bark Secret saved → Personal Bark alerts enabled → Lock Screen test received. Then wait for new messages.**
