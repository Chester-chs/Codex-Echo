# Cloudflare Queues 部署与验证

[中文](CLOUDFLARE_QUEUES.md) | [English](CLOUDFLARE_QUEUES.en.md)

本次代码增加了 codex-reset.com 来源和可选 Queues。**仅推送 GitHub 不会替你创建队列或修改私有生产配置。** 没有 `BARK_QUEUE` 时仍使用现有每分钟发送流程；原有 Bark 订阅、加密密钥、D1 数据及 KV 无需重建。

## 1. 创建队列

在仓库根目录打开 PowerShell，先登录已有的 Cloudflare 免费账号：

```powershell
npx wrangler login
npx wrangler queues create bark-send
npx wrangler queues create bark-send-dlq
```

使用 Workers Free，不要为本功能主动升级付费套餐。Cloudflare 目前包含每天 10,000 次队列操作，保留 24 小时；一次正常投递通常消耗写入、读取和删除三次操作。重试和补漏也消耗操作，几台设备的通知量通常远低于额度。参见 [官方价格](https://developers.cloudflare.com/queues/platform/pricing/)。

## 2. 修改你自己的配置

已有部署：**编辑原来的 `web/wrangler.jsonc`，保留资源 ID、Worker 名称、域名和所有现有变量，不要用示例覆盖它。** 本项目不会替你改这个私有文件。

加入以下顶层字段；如果已有同名字段，合并而非重复添加：

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

在已有 `vars` 里面加入 `"PUBLIC_POLL_SECONDS": "300"`（状态接口显示五分钟抓取频率），以及 `"BARK_RESEND_UNCERTAIN": "true"`，保持 `BARK_ENABLED`、`BARK_VISITORS_ENABLED` 为 `"true"`。`false` 表示发送结果不明确时不自动重发，记录为“结果不明”；`true` 会以相同合并 ID 重试，最多三次发送尝试。绝不把密钥写进 GitHub。

全新自建部署才使用 `web/wrangler.example.jsonc`，填自己的 KV/D1 ID，按原部署教程初始化数据库和 secrets。已有部署无需新建数据库、无需清空任何记录，无新迁移。

## 3. 检查并部署

```powershell
npm ci
npm test
npm run build
npx wrangler deploy --config web/wrangler.jsonc --dry-run
npx wrangler deploy --config web/wrangler.jsonc
npx wrangler tail --config web/wrangler.jsonc --format pretty
```

新数据源：推文和重置历史每 5 分钟检查，`/api/forecast` 每分钟检查。每个接口最多每分钟一次；持久化的请求时间隔离重叠 cron。本地进程也缓存一分钟。页面每两分钟读取后端，不是 X 实时直播。正常情况下争取数分钟内发现，**1–3 分钟不是保证**；推文收录还可能等待一次五分钟抓取。

`latest_alert` 未公开稳定 schema。目前保存的样本只确认了 `kind=reset, state=confirmed`；不认识的预警类型只记日志，不推送。明确计划仍走已有推文规则；模糊的 “Landing…” 不会被擅自当作重置承诺。实测确认只表示来源自有监测账号，不保证你个人恢复。

第一次启用新来源建立基线，不补发历史。各用户只接收晚于自己绑定时间、六小时内的事件。已发送的同一来源事件再次出现不会再入队；独立的计划和完成仍分别通知。来源健康时，已发送确认的同一原帖/同一明确完成时间会抑制旧路径重复；健康中断超过 15 分钟自动保留旧来源备用。不凭“时间相近”合并不同事件。

## 4. 如何验证

先看日志：

- `codex_reset_alert`：新确认事件已写入待发记录，含 ID 和发现延迟。
- `codex_reset_alert_ignored`：未知 kind/state；不要为消除此日志而放宽校验。
- `codex_reset_failed`：来源失败或结构变化，不包含响应正文。
- `bark_queue_batch`：批次大小、成功、重试、跳过、D1 查询数（最多 48）。
- `bark_sent`：Bark 接受重置消息；含帖子 ID 和延迟，不含设备地址。

从网页的手机云端提醒区域给**自己的一台设备**点一次测试，观察 `bark_queue_batch` 和手机实际锁屏。关闭网页和电脑后，云端仍继续运行。队列至少投递一次，数据库认领和发送记录负责去重；网络中断时无法在外部服务之间实现绝对 exactly-once。

确认事件来自上游，不能通过修改真实时间线来制造测试。未知事件格式需要后续真实样本才能增加支持。

### 单设备测试 Bark 合并 ID

下面脚本会向你输入的设备发送 **两条明确标为测试、使用相同 `id`** 的消息，不写数据库、不改真实数据。不把地址放在命令行、文件、日志或截图里。Bark 官方服务端将 `id` 传给 APNs `CollapseID`；实际合并表现还取决于 iOS/Bark 版本及消息是否已投递，不能保证通知中心永远只剩一条。

```powershell
node scripts/test-bark-collapse.mjs
```

按提示粘贴你自己的 Bark 地址（隐藏输入），按 Enter。两条相隔五秒，查看锁屏和 Bark 消息列表；测试标题包含时间以便辨认。不要在公开终端录屏时操作。

## 5. 故障和退回

- 创建/绑定失败：在 Cloudflare Dashboard 检查队列是否可用、名称是否一致；未创建资源前不要部署含 queues 的配置。
- 暂时不用 Queues：删除私有配置里的 `queues` 字段再部署，原有 D1 事件和订阅保留，每分钟发送恢复。个人模式及 GitHub Actions 自助版从未改用 Queues。
- 额度到达：设备每天最多 20 次、全站每天最多 600 次（UTC）；待发事件延后，但过期事件会取消，不会为了补发发送陈旧重置。
- 死信：在 Cloudflare Dashboard 查看 `bark-send-dlq`，先排查错误，不要盲目重放历史。数据库仍保留待发/重试记录，定时补漏会恢复未完成工作。

数据署名：[Data: codex-reset.com](https://codex-reset.com)。
