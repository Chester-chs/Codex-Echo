# 回响 · Echo

一个简洁的中英文 Codex 公告观察站：最近重置公告、日历、Tibo 已收录推文、来源预测，以及可关闭网页运行的 Bark 手机提醒。

**[打开网页](https://echo-radar.pages.dev/) · [给朋友的 Bark 配置教程](docs/GITHUB_BARK.md)**

## 最简单的用法

安装 iPhone 的 [Bark](https://github.com/Finb/Bark)，在网页的「手机云端提醒」绑定自己的推送地址。无需 GitHub 账号，可以分别设置重置/预测提醒、阈值、推送语言，也能退订。网页当前免费试运行限 30 台设备；少量朋友使用无需购买服务器。

## 自己用 GitHub 接收提醒

点击 **Use this template → Create a new repository**，只复制默认分支，在自己的公开仓库添加 **Secret** `BARK_DEVICE_KEY`，粘贴自己的 Bark 地址。打开 Actions，启用 **Personal Bark alerts**，手动运行并勾选测试通知。

可用 Variables 自定义 `BARK_RESET_ALERTS`、`BARK_FORECAST_ALERTS`、`BARK_THRESHOLD`（40–90，步长 5）、`BARK_LANGUAGE`（zh/en）、`BARK_DAILY_LIMIT`（1–20）和 `BARK_ENABLED`。详细操作路径和故障排查见 **[配置教程](docs/GITHUB_BARK.md)**。

- 不需安装项目到自己的电脑，也不需填写 Cloudflare 凭据或申请 GitHub 个人令牌；由仓库工作流每 10 分钟读取回响的公开数据并发送到自己的 Bark。
- 首次运行建立基线，不补发历史；发送前先持久化去重状态，结果不明不自动重发。状态保存在自己的 `echo-notifier-state` 分支，密钥只在 GitHub Secret 中。
- 网页与 GitHub 两种通道建议二选一，避免同一手机重复收到通知。仅查看或复制代码不会自动订阅。
- 公开仓库标准 Actions 运行时间目前免费；平台可能延迟调度，仓库连续 60 天无活动会停用定时任务。不承诺永久免费或实时送达。

## 开发与源码

需要 Node.js 24+。本仓库保留 Vue 3 / uni-app 网页、可选微信工程、自托管 Node 后端、Cloudflare Worker 和测试。它们是不同运行方式，使用 GitHub 提醒不需要全部部署。

~~~sh
npm ci
npm test
npm run build
~~~

构建网页输出在 `dist/build/h5/`。本地开发先运行 `npm run server`，另开终端运行 `npm run dev`。微信接入见 [INTEGRATION.md](docs/INTEGRATION.md)，需要自己的 AppID 和模板，尚未完成微信真机验收。

如自行部署 Worker，复制 `web/wrangler.example.jsonc` 为忽略提交的 `web/wrangler.jsonc`，填自己的 KV / D1 标识并应用 `web/migrations/`。不要使用别人的资源 ID 或把凭据写入前端。

| 目录 | 用途 |
|---|---|
| `src/` | 单页界面、中英文、手机适配 |
| `web/` | 来源缓存 API、Bark 订阅和云端队列 |
| `scripts/github-notifier.mjs` | 无额外 npm 依赖的个人 GitHub 提醒入口 |
| `backend/` | Node / SQLite 后端及公开来源采集 |
| `cloud/` | 可选微信云函数 |
| `tests/` | 分类、时间、去重、隔离、阈值、推送等测试 |

## 信息边界

公告条数不是你的账号额度或实际重置次数；帖子发布时间与重置完成时间不同。概率来自 AIPlanWatch 的公开来源评估，不是 OpenAI 官方承诺。推文列表是免费公开来源已收录的内容，可能不完整；保留原文和出处。依赖 [AIPlanWatch](https://codex-reset.aiplanwatch.com/)、[tokenusage](https://tokenusage.dev/developers)、X 公开嵌入和 [FxEmbed](https://github.com/FxEmbed/FxEmbed)。与原作者、Bark 及 OpenAI 无隶属关系。

使用 Vue、uni-app、Cheerio、Lucide 和 Radix Colors；直接分发资源的许可说明见 `licenses/`。本仓库自有代码使用 MIT 许可，上游代码和内容遵循各自许可。

## English

Echo is a bilingual single-page Codex announcement tracker. [Visit the website](https://echo-radar.pages.dev/) or create your own repository from this template to run personal Bark alerts with GitHub Actions. Add your Bark URL as the `BARK_DEVICE_KEY` repository **Secret**, enable **Personal Bark alerts**, and run a manual test. Customize alert types, forecast threshold and notification language using repository Variables. [Setup guide](docs/GITHUB_BARK.md#english-quick-start).
