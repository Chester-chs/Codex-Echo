# Codex 回响：从零配置自己的 Bark 提醒

**简体中文** | [English](GITHUB_BARK.en.md) · [返回首页](../README.md)

第一次使用 GitHub 也可以跟着完成。程序在 GitHub 上检查 Codex 重置公告与来源预测，推送到自己的 iPhone。**手机推送只使用 Bark；关闭网页、关闭电脑后仍可运行。**

## 先选路线

- 想尽快用起来：打开 [Codex 回响网页](https://echo-radar.pages.dev/)，展开「手机云端提醒」，粘贴 Bark 地址并绑定保存，再用页面测试按钮确认收件。无需 GitHub。
- 想自己管理程序：继续下面的 GitHub 配置，不占用网页订阅名额。

同一手机建议只选一种；如果从网页切换到 GitHub，可先在网页退订，否则两个独立通道可能各发一份。

## 准备清单

| 需要什么 | 说明 |
|---|---|
| iPhone | 安装 Bark 并允许通知 |
| 自己的 GitHub 账号 | 没有就到 [GitHub](https://github.com/) 注册，并按网站提示验证账号 |
| 浏览器 | 推荐电脑配置、手机收件；也可以全程用 iPhone Safari |

不需要下载代码、使用终端、安装 Node.js、购买服务器或域名，也不用申请个人访问令牌。下面保留 GitHub 英文按钮名，方便对照页面。

全程用手机时，请用 Safari 登录 GitHub 网页。仓库顶部菜单可能需要横向滑动，或从 `…` / 下拉菜单找 **Settings**；必要时在 Safari 页面菜单选「请求桌面网站」。

## 第 1 步：安装 Bark，复制自己的地址

1. 在 iPhone App Store 搜索 **Bark**，可通过 [Bark 官方项目](https://github.com/Finb/Bark) 的 App Store 链接核对应用。
2. 安装后打开一次，允许通知。
3. 进入 iPhone「设置 → 通知 → Bark」，开启「允许通知」，勾选「锁定屏幕」。有的 iOS 版本也可从「设置 → App → Bark → 通知」进入。
4. 回到 Bark，复制它显示的推送地址。格式通常是：

```text
https://api.day.app/这里是你自己的设备密钥
```

这是格式示意，**不要复制示例文字**。复制 Bark 中的真实地址即可，完整地址或其中的设备密钥都能用。目前只支持默认的 `api.day.app` 服务。

**完成标志：**已复制自己的地址。它能用来给你的手机发消息，不要公开或转发给别人。

## 第 2 步：在自己账号下复制程序

1. 登录 GitHub，打开模板 [Chester-chs/codex-echo-radar](https://github.com/Chester-chs/codex-echo-radar)。
2. 文件列表上方点击 **Use this template（使用此模板）→ Create a new repository（创建新仓库）**。
3. 按表填写：

| 字段 | 怎么填 |
|---|---|
| **Owner** | 选择你自己的 GitHub 用户名 |
| **Repository name** | 填 `my-codex-alerts`；自己已用过这个名称就换一个 |
| **Description** | 可以留空 |
| **Public / Private** | 建议选 **Public（公开）**，使用公开仓库的免费标准运行器 |
| **Include all branches** | **不要勾选**，只复制默认分支 |

4. 点击 **Create repository from template**，等待跳转。

**完成标志：**地址栏变成 `github.com/你的用户名/my-codex-alerts`。接下来都在**自己的仓库**操作，不是在作者仓库里。公开仓库不等于公开密钥，下一步单独保密保存。

## 第 3 步：添加唯一必填的保密密钥

1. 在自己的仓库顶部点击 **Settings（设置）**。
2. 左侧选择 **Secrets and variables（密钥与变量）→ Actions**。这里不是顶部运行任务的 Actions 标签。
3. 选择 **Secrets** 标签，点击 **New repository secret**。
4. 填写：

| 字段 | 填什么 |
|---|---|
| **Name** | `BARK_DEVICE_KEY`，完整复制这个名称 |
| **Secret** | 第 1 步从 Bark 复制的真实推送地址 |

5. 点击 **Add secret**。

**完成标志：**Secrets 列表出现 `BARK_DEVICE_KEY`。保存后看不到原值是正常的；需要更换时用旁边的编辑按钮重新填写。

不能创建成 Variable，也不要填进 README、代码或公开评论。`GITHUB_TOKEN` 由 GitHub 自动提供，**不需要添加第二个密钥**，也不需要付费 API Key。

## 第 4 步：默认设置即可用，也能自己调整

**可以直接跳到第 5 步。**默认设置是：重置和预测提醒都开启、预测阈值 60%、中文推送、每个 UTC 日期最多 20 次发送尝试。

要修改时，仍在 **Settings → Secrets and variables → Actions**，这次选择 **Variables**：

1. 点击 **New repository variable**。
2. **Name** 填下表的名称，**Value** 只填对应值。
3. 点击 **Add variable**。每项单独添加，不要把 `名称=值` 整行粘进一个字段。

| Name | 默认值 | Value 可填什么 |
|---|---|---|
| `BARK_RESET_ALERTS` | `true` | `true` 开启重置公告，`false` 关闭 |
| `BARK_FORECAST_ALERTS` | `true` | `true` 开启来源预测，`false` 关闭 |
| `BARK_THRESHOLD` | `60` | `40`、`45`……`90`，不能写 `75%` |
| `BARK_LANGUAGE` | `zh` | `zh` 中文，`en` 英文 |
| `BARK_DAILY_LIMIT` | `20` | `1`–`20` 的整数；测试和重试也计入 |
| `BARK_ENABLED` | `true` | `false` 暂停整个 GitHub 推送通道 |

示例 A：**只要重置公告**。添加一项，Name 为 `BARK_FORECAST_ALERTS`，Value 为 `false`，其余保持默认。

示例 B：**保留重置，只要至少 80% 的英文预测**。添加两项：`BARK_THRESHOLD` 的 Value 为 `80`；`BARK_LANGUAGE` 的 Value 为 `en`。

**完成标志：**Variables 列表显示你添加的名称和值。值用英文小写，不加引号、空格或百分号。README 的语言切换不会改变消息语言。

## 第 5 步：手动发送一次锁屏测试

1. 点击自己仓库顶部的 **Actions**。
2. 若出现 **I understand my workflows, go ahead and enable them**，确认是自己复制的项目后启用；没有提示就继续。
3. 左侧选择 **Personal Bark alerts**。不要选 **Check**，后者只检查代码，不发手机消息。
4. 如果显示工作流已禁用，先点 **Enable workflow**。
5. 右侧点击 **Run workflow**，分支选 **main**。
6. **勾选** `Send one test notification to your configured Bark device`，再点击弹出框中的 **Run workflow**。
7. 等运行列表出现新任务，点开最新一条；没出现可以刷新。黄色是排队或运行中，绿色是完成，红色是失败。
8. 关闭网页并锁屏，检查手机是否收到 **「Codex 回响 · 锁屏推送测试」**；英文为 **“Codex Echo · Push test”**。

**完成标志：锁屏上实际看到了测试通知。**只看到 GitHub 绿色勾，或只在 Bark 应用里看到记录，都不能代替这一步。每次新运行并勾选测试都会创建新的测试消息，不要连续点击。

### 如何看懂日志

点开运行 → 点 **notify** 任务 → 展开 **Check signals and notify my device**：

| 日志 | 含义与处理 |
|---|---|
| `Bark is not configured` | 没读到密钥，即使绿色也没发消息。回第 3 步检查自己的仓库、Secret 名称和位置 |
| `Personal notifications are paused` | 总开关是 false；将 `BARK_ENABLED` 改回 `true` |
| `... checked; dispatch attempts: 1` | 本轮尝试处理了 1 条消息，仍以手机收件为准 |
| `... checked; dispatch attempts: 0` | 没有发送尝试。首次基线、没有新消息时正常；想测试请确认勾选测试框 |
| `source_stale` | 来源数据过旧，自动提醒暂停，恢复后再检查 |
| 红色失败 | 按下面排错表处理，再运行测试 |

## 第 6 步：等待自动运行

测试通过后不需要再点“启动”，也不用保持网页或电脑开启。程序计划每 10 分钟运行；自己仓库的 Actions 历史里，后续自动运行会标为 **schedule**。

- 首次成功读取数据只建立基线，不补发旧公告和已有预测；没新消息时安静是正常现象。
- 数据来源也约每 10 分钟更新，GitHub 可能排队，所以不是秒级提醒，也不保证刚好 10 分钟内送达。
- 自动提醒只针对绑定后新收录、符合设置的公告，以及有效且达到阈值的新预测。公开公告不代表你的账号额度一定恢复。
- 每轮最多处理 3 条消息；明确暂时失败最多尝试 3 次。结果不明不自动重发，减少重复消息。

## 修改、暂停、退出和更换手机

| 你想做什么 | 操作 |
|---|---|
| 改阈值、语言、提醒类型 | 修改第 4 步 Variables，保存后下次运行生效 |
| 暂停推送 | `BARK_ENABLED=false`；恢复时改回 `true` |
| 停止定时运行 | Actions → Personal Bark alerts → `…` 菜单 → **Disable workflow** |
| 恢复工作流 | 同一页面点 **Enable workflow**，再手动测试 |
| 彻底退出 | 先禁用工作流，再从 Secrets 列表删除 `BARK_DEVICE_KEY`；网页订阅需要单独退订 |
| 换手机或地址 | 编辑 `BARK_DEVICE_KEY`，重新填写并测试；新设备重新建立基线 |

调整阈值不会重推已发过的同一消息。公开仓库连续 60 天无活动时，GitHub 会停用定时任务，需要重新启用；本项目不制造空提交绕过规则。

## 排错：按现象找原因

| 现象 | 怎么办 |
|---|---|
| 没有 Settings / 不能添加密钥 | 登录后确认地址栏是自己的仓库；手机可横向滑动菜单或请求桌面网站 |
| 找不到 Use this template | 登录后打开作者仓库首页的 Code 页面。Code → Download ZIP 只是下载文件，不能开启提醒 |
| 找不到 Run workflow | 在自己仓库选择 Personal Bark alerts，确认已启用，分支 main，不是 Check |
| 密钥已添加仍显示没配置 | 必须是 **Repository secret**，不是 Variable 或 Environment secret；名称完整为 `BARK_DEVICE_KEY` |
| `Invalid notification preferences` | 检查开关 true/false，阈值 40–90 且每档 5，语言 zh/en，日上限 1–20，均不加引号 |
| `GitHub state request failed` / HTTP 403 | 检查 Settings → Actions → General 是否禁用 Actions 或受组织策略限制。工作流已申请 contents 写权限，通常不需修改默认权限，也无需允许创建/审批 PR。组织策略阻止时使用个人仓库或联系管理员 |
| 状态文件损坏或丢失 | 不要直接清空状态，以免破坏去重。保留错误文字求助，不附密钥 |
| GitHub 成功但没收到 | 确认勾选测试、总开关未暂停、地址属于当前手机；打开 Bark 一次，检查通知权限、锁屏、专注模式和定时摘要 |
| Bark 有记录但锁屏没显示 | 重点检查锁屏开关、专注模式和定时摘要，再锁屏运行一次新的测试 |
| 收到两份提醒 | 检查是否同时使用网页和 GitHub，或有多个提醒仓库在运行；保留一个 |
| 测试能收，但没新公告提醒 | 检查是否真的出现首次基线后的新收录消息；预测还须达到阈值且有效 |
| 长期没有自动任务 | 查看是否被禁用、60 天无活动停用、平台故障或额度限制；保持网页打开不能解决 |

## 隐私、费用与依赖

原始 Bark 地址只保存在你仓库的 Secret，不必发给作者。程序会创建 `echo-notifier-state` 分支和 `state.json`，保存匿名设备摘要、消息标识、必要的公开消息内容和结果，不保存原始密钥。公开仓库的状态也是公开的，历史提交可能保留当时必要的公开正文。不要修改或删除状态文件，也不要合并该分支到 main。

当前使用公开仓库标准运行器，不需要购买服务器、域名或付费 API。私有仓库有不同的免费分钟数限制；各平台政策和可用性可能变化，不承诺永久免费或实时送达。GitHub 版独立执行个人推送，仍读取 Codex 回响的共享公开数据，不是独立采集全部上游。

官方参考：[创建模板仓库](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-repository-from-a-template) · [Secrets](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets) · [手动运行](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow) · [费用](https://docs.github.com/en/billing/concepts/product-billing/github-actions) · [调度限制](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)

**最后核对：自己的仓库 → 已添加 Bark Secret → Personal Bark alerts 已启用 → 锁屏测试收到。完成这四项即可等待新消息。**
