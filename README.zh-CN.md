# Codex 回响

[English](README.md) | **简体中文**

在一页查看 Codex 重置计划、完成状态、历史日历和已收录的 Tibo 推文，也可通过 Bark 接收 iPhone 提醒。

**[打开网页](https://echo-radar.pages.dev/) · [设置 Bark 提醒](docs/BARK_SETUP.md)**

![Codex 回响网页预览](docs/images/desktop-en.png)

## 主要功能

- 重置倒计时和完成提示，附来源链接。
- 支持伦敦／北京／UTC 时区、中英文切换，并记住选择。
- 公告历史、日历和 Tibo 推文。
- 独立绑定 Bark：选择重置或预测提醒、调整阈值、随时退订。

## 开始使用

1. 在 iPhone 安装 [Bark](https://github.com/Finb/Bark)，允许锁屏通知。
2. 复制 Bark 中的推送地址。
3. 打开网页 → **手机云端提醒** → 粘贴地址 → **绑定并保存**。
4. 发送测试通知，确认锁屏收到消息。

**Bark 提醒不需要开着网页或电脑。** 识别到计划时提醒一次，收到对应完成证据后再提醒一次，提前完成也适用；重复确认会去重。页面提醒则必须保持页面运行。

[Bark 分步教程](docs/BARK_SETUP.md) · [可选：GitHub 自助提醒](docs/GITHUB_BARK.md)

## 使用须知

- 上游提供数据后，网页更新和云端提醒通常约 **1–4 分钟**；上游延迟另算。推文可能遗漏，未覆盖的措辞可能无法识别。
- 预测是第三方估计；计划不代表已完成，完成状态需要来源证据。
- 本项目独立于 OpenAI，不监测个人账号。你的额度以账号显示为准，日历统计的是公告数量。
- 网页订阅目前免费、名额有限。请勿公开 Bark 地址。

## 开发

需要 Node.js 24+：依次运行 `npm ci`、`npm test`、`npm run build`。

[采集与部署](docs/MINUTE_DISCOVERY.md) · [可选 Queues 配置](docs/CLOUDFLARE_QUEUES.md) · [MIT 许可](LICENSE)

数据来源包括 [codex-reset.com](https://codex-reset.com) 和 [AIPlanWatch](https://codex-reset.aiplanwatch.com/)。感谢 [Bark](https://github.com/Finb/Bark) 及[开源依赖](licenses/)。
