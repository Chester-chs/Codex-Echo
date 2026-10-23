# 通过 GitHub 自行接收 Bark 提醒

[English](GITHUB_BARK.en.md) | **简体中文** · [返回 README](../README.zh-CN.md)

大多数人直接[在网页绑定 Bark](BARK_SETUP.md)即可。本教程是可选方案，程序运行在你自己的 GitHub 仓库，不占网页订阅名额。同一手机只选一种方式，避免重复提醒。

## 配置步骤

1. **准备 Bark。** 按[这里](BARK_SETUP.md#1-准备-bark)安装并允许锁屏通知，复制自己的真实推送地址。
2. **创建自己的仓库。** 登录 GitHub，打开 [Codex Echo](https://github.com/Chester-chs/Codex-Echo)，点击 **Use this template → Create a new repository**。选择自己的账号，填写名称（如 `my-codex-alerts`），选 **Public** 使用标准免费运行资源，不勾选 **Include all branches**。后续操作都在新仓库中完成。
3. **保存密钥。** 打开 **Settings → Secrets and variables → Actions → Secrets → New repository secret**。Name 填 `BARK_DEVICE_KEY`，Secret 粘贴 Bark 推送地址，点击 **Add secret**。不要放进 Variables、代码或评论。
4. **发送一次测试。** 打开 **Actions → Personal Bark alerts**（不是 **Check**），若提示则启用工作流。点击 **Run workflow**，选择 `main`，勾选 **Send one test notification to your configured Bark device**，运行一次。锁屏确认收到通知。

之后按 **每 10 分钟**的计划自动检查，GitHub 调度可能延迟。网页和电脑都可关闭。首次检查建立基线，不补发历史公告；数据仍依赖共享公开接口。

## 可选设置

默认开启重置和预测提醒、阈值 60%、中文通知。只需添加想修改的项目，位置为 **Settings → Secrets and variables → Actions → Variables → New repository variable**：

| Name | Value |
|---|---|
| `BARK_LANGUAGE` | 英文 `en`，中文 `zh` |
| `BARK_THRESHOLD` | `40`–`90`，每档 5，不带 `%` |
| `BARK_RESET_ALERTS` | 开启 `true`，关闭 `false` |
| `BARK_FORECAST_ALERTS` | 开启 `true`，关闭 `false` |
| `BARK_ENABLED` | 暂停 `false`，恢复 `true` |

修改后下次运行生效。预测阈值不影响重置计划提醒。

## 停止与排查

- **停止：** Actions → Personal Bark alerts → **… → Disable workflow**。不再使用时可删除 `BARK_DEVICE_KEY` 密钥。
- **没有测试消息：** 打开运行记录 → **notify → Check signals and notify my device**。“Bark is not configured”表示缺少密钥；绿色成功标记不代表手机收到。
- **Bark 中有，锁屏没有：** 检查通知权限、专注模式和通知摘要。
- **长期没有自动运行：** 检查工作流是否启用。公开仓库 60 天无活动时，GitHub 可能停用定时任务，需要重新启用。
- **403 错误：** 检查仓库或组织的 Actions 限制，无需个人访问令牌。

请保留自动生成的 `echo-notifier-state` 分支，它保存用于去重的通知历史，不包含原始 Bark 密钥；公开仓库中的历史也公开。无需购买服务器，私有仓库的运行额度不同，详见 [GitHub 计费](https://docs.github.com/en/billing/concepts/product-billing/github-actions)和[定时任务限制](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)。
