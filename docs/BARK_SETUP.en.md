# Connect Bark on iPhone

**English** | [简体中文](BARK_SETUP.md) · [README](../README.md)

Use this route for the simplest setup. No GitHub account or server is needed.

## 1. Prepare Bark

Install Bark using the App Store link in its [official project](https://github.com/Finb/Bark), open it, and allow notifications. In **iPhone Settings → Notifications → Bark**, enable **Lock Screen**.

Copy your push address from Bark. It looks like `https://api.day.app/YOUR_DEVICE_KEY`; use your real address, not this example. Only the default `api.day.app` service is supported. Keep the address private.

## 2. Connect and save

Open [Codex Echo](https://echo-radar.pages.dev/). Below the Tibo post list, expand **Phone alerts from the cloud**:

1. Paste your Bark address.
2. Choose **Reset announcements** and/or **Source forecasts**.
3. Set the forecast threshold (40%–90%) and notification language.
4. Select **Connect and save** and wait for the connected status.

The threshold applies only to forecasts. A recognized reset plan and matching completion evidence generate separate alerts; repeated confirmations are deduplicated. Initial connection does not replay old messages.

## 3. Test the Lock Screen

Select **Send a test notification** once, then close the website and lock your phone. Usually it arrives in about a minute. Confirm that it actually appears; “Accepted by Bark” alone is not proof of delivery. Tests have a 10-minute cooldown.

**After setup, the website and your computer can stay closed.** Your phone must be online and allow notifications. Page notifications are separate and require the page to keep running.

## Manage or stop

- Change settings here and select **Save alert preferences**.
- Turn both alert types off and save to pause; select **Unsubscribe and delete address** to stop and remove the address. An in-flight notification may still arrive.
- In another browser, paste the same address to restore management. This replaces the previous browser's management access.

## If nothing arrives

- Check Bark's Lock Screen permission, Focus and Scheduled Summary.
- Refresh the status on the website; verify the address if the request failed.
- A successful test does not guarantee new alerts: a new qualifying event is needed.
- Avoid running both website and GitHub notifications for the same phone.

The shared service currently supports 30 devices, with 20 send attempts per device per UTC day, including tests and retries. If full, use the [personal GitHub notifier](GITHUB_BARK.en.md).
