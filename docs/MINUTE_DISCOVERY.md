# 每分钟推文发现与 Bark

[简体中文](MINUTE_DISCOVERY.md) | [English](MINUTE_DISCOVERY.en.md)

每分钟任务先检查 codex-reset.com 的确认事件，再检查 `/api/feed` 与 `/tibo/x`。每个地址使用独立、持久化的 60 秒请求许可，和完整采集共用；遇到 429 会遵守 `Retry-After`。重置计划、承诺、完成消息直接进入 D1，再在同一次任务中发送 Bark；已配置 Cloudflare Queues 时在同一次任务中提交队列。推送不等待 KV 传播。

网页合并公开来源能提供的推文、普通动态与回复。只有推文新增或内容变化才写 KV；点赞数、接口抓取时间和轮询健康时间不会引发每分钟写入。网页每分钟刷新一次，API 缓存保持 30 秒。其他完整采集仍按部署配置运行，当前生产环境为 10 分钟。以每日完整采集 144 次、100 个发生推文变化的分钟为例，共约 244 次 KV 写入；这是说明性估算，不是每日写入上限或保证。

这些来源不等于 X 的完整实时流。上游尚未收录的日常推文无法凭空取得；公开文字归档也可能滞后。发帖到提醒 1–4 分钟是目标，不是承诺：上游检查和缓存、Cron 调度、限流、队列积压及网络都会影响时间。日常推文只显示网页，不触发 Bark；原有来源概率预测仍由独立开关和阈值控制。

## 分类和去重

- Tibo 的自我回复可从父帖继承重置语境和类型，时间只从当前推文计算。父帖可来自当前 feed 或前次保留的 feed；缺失时保留待以后重新检查。回复其他用户不推送，即使上游标为 signal。
- PST/PT/PDT 与未注明时区的 EOD 按 `America/Los_Angeles` 及夏令时换算；UTC/GMT 按 UTC。`within`、`in N hours`、`by` 等使用“最晚约 / By about”，不是确定完成时刻。
- 计划和慢路径共用事件键。同一串 10 分钟内的具体计划替代尚未发送的预告；预告已送达时，具体计划仍单独提醒。取消或被替代的待发送计划不再发送。
- 同一设备在 6 小时内只接收一次完成提醒，Tibo 确认、来源实测及相同重置的旧路径共同去重。未知网络结果会按既有策略处理；服务端接受不等于手机锁屏送达。
- 首次启用监控建立持久化起点，不补发启用前的推文。后续部署（包括新增推文通道）沿用已有的监控起点，直接路径和旧路径共用它；恢复最近 6 小时内仍有效、发布于监控及设备绑定之后且未发送的公告。旧版本留下的较晚功能基线不再遮挡这些公告。原事件键及发送记录保留，已发送的计划不重发；已有订阅、设备密钥、开关和阈值保留。
- 新提醒保留原文、自我回复的父帖及伦敦/北京时间。中文优先使用已有译文，并在允许翻译时最多补译两段短文本；免费翻译失败时明确显示译文待补，原文始终保留。

样例测试保留了真实 feed 的父帖关系和原文。当前 feed/timeline 没有提供 “Done and dusted” 与旧 “Hi. It is done.” 的回复元数据，因此另外通过项目原有的免费 FxEmbed 镜像验证：这两条均不是回复。`tibo-post-cases.json` 中的用户提供片段与完整来源快照分开保存，未把 timeline 摘要冒充推文原文。

## 部署

1. 拉取仓库最新代码，安装现有依赖并检查：

   ```powershell
   npm ci
   npm test
   npm run build
   ```

2. 使用你原有的私有配置发布 Worker：

   ```powershell
   npx wrangler deploy --config web/wrangler.jsonc
   ```

   本次不修改 `web/wrangler.jsonc`、订阅数据库结构或 Secrets，也不要求启用付费服务或新建 Queues。原配置只需已有每分钟 Cron；完整采集的 5/10 分钟间隔可保持不变。

3. 使用现有前端发布流程上传构建产物。网站维持 [echo-radar.pages.dev](https://echo-radar.pages.dev/)。首次安装不补发启用前的推文；升级沿用原监控起点并恢复仍符合条件的未发送公告，不重复已发送的消息。

## 用日志验证

在仓库目录打开 PowerShell：

```powershell
npx wrangler tail --config web/wrangler.jsonc --format pretty |
  Select-String 'tweet_alert|tweet_alert_skipped|posts_updated'
```

保持该窗口运行，等待真实新推文。无需保持网页或自己的电脑开启来运行云端监测；这个窗口只是查看日志。

| 事件 | 意义 |
| --- | --- |
| `tweet_alert` | 识别到新的计划/承诺/完成消息；`class` 为类别，`selfReply` 表示自我回复，`lagSeconds` 为发现时间减发帖时间。它不代表锁屏已送达。 |
| `tweet_alert_skipped` | 被排除的候选；检查 `reason`：`reply_to_other`、`parent_missing` 或 `no_rule_match`。父帖缺失的候选会继续等待父帖。 |
| `posts_updated` | 网页新增推文；包含 `added` 和最新新增推文的 `lagSeconds`。无新推文时不打印，即使原文被修正或译文补全。 |

要查看发送链路和失败信息，可去掉 `Select-String`。已有 `bark_check`/`bark_queue_batch` 表示发送尝试；只有在 iPhone 锁屏实际看到通知，才确认设备收到了。请勿贴出设备地址、密钥或管理令牌。
