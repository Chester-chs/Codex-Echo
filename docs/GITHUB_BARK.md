# 给朋友：用自己的 GitHub 接收 Bark 提醒

不需要购买服务器、域名或付费 API。安装 Bark 后，把提醒程序复制到自己的 GitHub 账号；每个人的设备、阈值和语言分别配置。网页仍可直接使用：[回响 · Echo](https://echo-radar.pages.dev/)。

只想简单订阅的人，也可以直接在网页的「手机云端提醒」粘贴自己的 Bark 地址。**网页订阅和 GitHub 自助提醒是两套独立通道；同一手机建议选择其中一种，避免收到两份提醒。**

## 1. 安装 Bark

在 iPhone 的 App Store 搜索 **Bark**，核对开源项目 [Finb/Bark](https://github.com/Finb/Bark)，安装并打开一次。

进入 iPhone「设置 → 通知 → Bark」，允许通知并勾选「锁定屏幕」。复制 Bark 中自己的推送地址，通常形如 `https://api.day.app/你的设备密钥`。本项目支持默认的 `api.day.app`，暂不支持自建 Bark 服务地址。

## 2. 复制这个项目

登录 GitHub，打开 [Chester-chs/echo-radar](https://github.com/Chester-chs/echo-radar)，点击 **Use this template → Create a new repository**，创建在自己的账号下。

建议选择 **Public（公开）**，使用标准 GitHub 托管运行器的公开仓库 Actions 运行时间目前免费；私有仓库有免费分钟数限制。创建时只复制默认分支，**不要勾选复制所有分支**，避免继承别人的去重状态。

## 3. 填入自己的 Bark 密钥

在自己复制的仓库里打开：

**Settings → Secrets and variables → Actions → Secrets → New repository secret**

| Name | Secret |
|---|---|
| `BARK_DEVICE_KEY` | 粘贴自己的完整 Bark 推送地址，或地址中的设备密钥 |

这是唯一必填项。不要把密钥写进代码、README、Issues、评论或 Variables。`GITHUB_TOKEN` 由 GitHub 自动提供，不需要申请个人访问令牌。

## 4. 选择提醒内容（可选）

仍在 **Settings → Secrets and variables → Actions**，切换 **Variables → New repository variable**，按需添加。未添加时使用下表默认值。

| Name | 默认值 | 可选设置 |
|---|---|---|
| `BARK_RESET_ALERTS` | `true` | 重置公告：`true` 开启，`false` 关闭 |
| `BARK_FORECAST_ALERTS` | `true` | 来源预测：`true` 开启，`false` 关闭 |
| `BARK_THRESHOLD` | `60` | 预测阈值：40–90 的整数，每档 5，例如 `75`；不带 `%` |
| `BARK_LANGUAGE` | `zh` | `zh` 中文；`en` 英文 |
| `BARK_DAILY_LIMIT` | `20` | 每个 UTC 日期最多发送尝试次数，可填 1–20 |
| `BARK_ENABLED` | `true` | 总开关；填 `false` 暂停此仓库的推送 |

示例：只要重置消息，就设置 `BARK_FORECAST_ALERTS=false`。想接收概率至少 80% 的英文预测，就设置 `BARK_THRESHOLD=80`、`BARK_LANGUAGE=en`。

## 5. 开启并测试

1. 打开自己仓库的 **Actions**，如看到启用工作流的提示，选择启用。
2. 左侧选择 **Personal Bark alerts**。
3. 点击 **Run workflow**，选择 `main`，勾选 **Send one test notification to your configured Bark device**，然后运行。
4. 等这次任务结束，在 iPhone 锁屏检查测试消息。工作流显示绿色、或 Bark 服务接受请求，都不等于锁屏已经显示。

首次成功检查只建立历史基线，不补发之前的公告和预测；勾选的测试消息会发送一次。之后按计划每 10 分钟检查回响的公开数据源。电脑关机、网页关闭不会影响 GitHub 上运行的程序。

GitHub 定时任务可能延迟；来源本身也约每 10 分钟更新，所以不是秒级提醒。来源过旧或预测过期时不会发送自动提醒。每轮最多处理 3 条消息，明确暂时失败最多重试 3 次；结果不明不盲目重发，以减少重复通知。

## 修改、暂停和退出

- 修改阈值、类型或语言：更新自己的 **Variables**，下次运行生效。已被标记为发送过的消息不会因为调整阈值而重发。
- 暂停：把 `BARK_ENABLED` 设为 `false`；或在 Actions 的工作流菜单选择 **Disable workflow**。
- 彻底停用：先禁用工作流，再删除自己仓库的 `BARK_DEVICE_KEY` Secret。如另有网页订阅，需要到网页单独退订。
- 更换手机：替换 `BARK_DEVICE_KEY`，新的设备会重新建立基线；不要删除状态文件来尝试补发历史。
- 长期不使用：公开仓库连续 60 天没有活动，GitHub 会自动停用定时工作流。需要在 Actions 重新启用；本项目不制造空提交来绕过该限制。

## 常见问题

**没有收到消息？** 先手动运行勾选测试的工作流。检查 Secret 名称是否完全正确、Bark 地址是否复制完整、Bark 是否允许锁屏通知，以及 iPhone 的专注模式和通知摘要。未配置密钥时工作流会明确提示，不会发送。

**任务提示 GitHub state request failed / contents-write？** 检查仓库 **Settings → Actions → General → Workflow permissions** 是否允许工作流读写仓库；组织账号可能有上级策略限制。程序必须先保存去重状态才会尝试推送，写入失败时会停止。

**哪里保存历史状态？** 程序在自己仓库的 `echo-notifier-state` 分支保存 `state.json`，只存匿名设备摘要、消息标识、必要的公开消息内容和发送结果，不保存 Bark 密钥或 GitHub Token。公开仓库的这些记录也是公开的；已结束事件的完整正文不会继续写入新状态快照，但历史 Git 提交仍可能保留当时必要的公开正文。不要合并此分支到 `main`，也不要修改或删除状态文件。当前网页的数据服务仍由回响提供，GitHub 版独立承担的是个人推送，不是独立采集全部上游。

**能保证一直免费、实时送达吗？** 不能。当前实现不需要付费套餐，但依赖 GitHub、回响的公开数据服务和 Bark，免费额度、服务可用性及平台政策都可能变化。任务失败可在 Actions 查看；不要在求助截图里暴露密钥。

## 官方依据

- [GitHub Actions 费用](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
- [GitHub 定时任务限制](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)
- [GitHub Secrets 使用说明](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets)
- [Bark 开源项目](https://github.com/Finb/Bark)

## English quick start

Create your own public repository with **Use this template** (default branch only). Add your Bark URL/key as the repository **Secret** `BARK_DEVICE_KEY`. Optional repository **Variables**: `BARK_RESET_ALERTS=true`, `BARK_FORECAST_ALERTS=true`, `BARK_THRESHOLD=60` (40–90 in steps of 5), `BARK_LANGUAGE=en`, `BARK_DAILY_LIMIT=20`, `BARK_ENABLED=true`.

Enable **Personal Bark alerts** in Actions. Run it manually with **send_test** checked and verify the notification on your iPhone Lock Screen. The first successful check establishes a baseline without historical notifications. Subsequent checks are scheduled every 10 minutes and may be delayed by GitHub. Pause by disabling the workflow or setting `BARK_ENABLED=false`. Keep the `echo-notifier-state` branch; it contains public signal identifiers and anonymous delivery state, never your Bark secret. Do not subscribe through both the website and Actions for the same device unless you want duplicate channels.
