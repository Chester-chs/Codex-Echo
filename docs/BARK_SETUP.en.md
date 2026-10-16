# Connect Bark on iPhone for Codex alerts with the website closed

[简体中文](BARK_SETUP.md) | **English** · [Back to README](../README.en.md)

**Bark cloud alerts are recommended.** You only need your phone and a browser; no GitHub configuration or purchased server/domain.

| Mode | With the website closed | Requirement |
|---|---|---|
| **Bark cloud alerts (recommended)** | The cloud can still send to your iPhone, including its Lock Screen | Install Bark, connect your own address, allow phone notifications |
| Page notifications | **Stop** | Keep the page open and running; backgrounding or locking may suspend it |

Enabling page notifications does not connect Bark. The two sets of preferences are independent.

## 1. Install Bark and allow Lock Screen notifications

1. Find **Bark** in the App Store. Use the App Store link in the [official Bark project](https://github.com/Finb/Bark) to identify it.
2. Install and open it. Allow notifications when prompted.
3. In iPhone **Settings → Notifications → Bark**, enable **Allow Notifications** and **Lock Screen**. Some versions also offer **Settings → Apps → Bark → Notifications**.
4. For the test, check that Focus does not silence Bark and Scheduled Summary does not delay it.

**Checkpoint:** Bark is installed and can show Lock Screen notifications.

## 2. Copy your own push address

Copy the address displayed inside Bark. Its format is:

```text
https://api.day.app/YOUR_ACTUAL_DEVICE_KEY
```

This is a placeholder: copy **your real address from Bark**, not the example. The full address or its device key is accepted. Only the default `api.day.app` service is supported.

Keep the address private; it can send notifications to your device. You do not need to share it with the author. Do not use someone else's address.

**Checkpoint:** your actual address is on the clipboard.

## 3. Connect on the website

1. Open **[Codex Echo](https://echo-radar.pages.dev/)** in iPhone Safari. Use the header language switch for English.
2. Scroll below the collected Tibo posts and expand **Phone alerts from the cloud**. This is separate from **Page notifications**.
3. Paste your address into **Your Bark push address**. It is hidden by default; select **Show address** to check it.
4. Choose your preferences:

| Setting | Meaning |
|---|---|
| **Reset announcements** | Newly collected public announcements, not your personal account allowance |
| **Source forecasts** | Valid new estimates reaching your threshold, not official promises |
| **Forecast alert threshold** | 40%–90% in steps of 5; 75% means a forecast must reach or exceed 75% |
| **Notification language** | Chinese or English; independent of website display language |

5. Select **Connect and save**. Defaults are both types enabled, 60% and the initial form's selected language; choose your desired message language explicitly.

**Checkpoint:** a connected status, masked device hint or connection-success message appears. Pasting without saving does not subscribe you. “No device linked here” means this browser has no management credential.

## 4. Close the website and test the Lock Screen

1. Select **Send a test notification** once in the connected section.
2. After the queued message appears, close the website and lock the phone. Dispatch usually takes about a minute and may queue longer when busy.
3. Look for **“Codex Echo · Push test”**, or **「Codex 回响 · 锁屏推送测试」** for Chinese messages.
4. Reopen the page and select **Refresh status** if you want to inspect the recent receipt.

**Checkpoint: the test actually appears on your Lock Screen.** Queued means waiting. “Accepted by Bark” means only that the service accepted the request; it is not phone-delivery proof. Tests have a ten-minute cooldown.

The test is not a reset or forecast announcement. Once verified, leave cloud alerts running without keeping the website or your computer open.

## Change preferences or unsubscribe

- Edit switches, threshold or language and select **Save alert preferences**. Unsaved edits do not apply.
- To pause cloud alerts, turn both types off and save. Closing the website does not pause Bark.
- Re-enable a type and save to resume.
- To stop, select **Unsubscribe and delete address**, then confirm. Future cloud alerts stop and the saved address is removed; a request already in flight may still arrive.
- In a new browser or after clearing browser data, paste the same Bark address again to restore management. This invalidates the previous browser's management credential. An unlinked browser alone does not mean your existing cloud subscription stopped.

## Troubleshooting

| Symptom | What to do |
|---|---|
| Cannot find settings | Scroll below Tibo posts and expand Phone alerts from the cloud |
| Disabled button | Paste your address, wait for pending requests, or allow the test cooldown to expire |
| Invalid address | Copy again from this phone's Bark; do not use examples, another person's address or a self-hosted server |
| Queued test not received | Wait, then Refresh status. For failure, check the address/network. Uncertain outcomes are not automatically repeated |
| Inside Bark but no Lock Screen alert | Check notification permission, Lock Screen, Focus and Scheduled Summary; open Bark once and retry after cooldown |
| Test received, no automatic message | No historical backfill. A new qualifying announcement or valid forecast meeting your threshold is required |
| Duplicates | Check for a personal GitHub notifier or another service sending to the same phone; retain one channel |
| Cannot manage an old connection | Use the original browser, or paste the same Bark address to restore management |

The current shared free trial supports 30 devices and 20 send attempts per device per UTC date, including tests/retries. Sources update about every ten minutes; notification dispatch runs each minute. This is not instant delivery. Upstreams, Bark, networks and phone settings affect receipt.

**Use Bark for closed-page alerts. Page notifications require the page to keep running.** Running your own program is optional; see the separate [GitHub setup guide](GITHUB_BARK.en.md) if desired.

The Reset announcements switch also includes newly announced precise reset plans. These messages say Planned reset announced and do not confirm completion. No reconnection is needed; the forecast threshold does not apply to plans.

Two-stage alerts: with Reset announcements enabled, a new plan triggers one alert and a later newly collected explicit completion confirmation triggers a separate alert. Each message is deduplicated. Reaching the target alone never triggers completion; without source confirmation the state stays unconfirmed and says nothing about your personal account allowance.
