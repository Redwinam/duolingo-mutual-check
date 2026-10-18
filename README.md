# 多邻国 · 互关核对（油猴脚本）

装进 Tampermonkey（篡改猴 / 油猴）后，多邻国网页右下角会出现 **「⇄ 互关核对」** 按钮。点击即可核对，不需要手动输入密码或令牌。

**[安装脚本](https://raw.githubusercontent.com/Redwinam/duolingo-mutual-check/main/dist/duolingo-mutual-check.user.js)** · [下载版本](https://github.com/Redwinam/duolingo-mutual-check/releases) · [反馈问题](https://github.com/Redwinam/duolingo-mutual-check/issues)

Duolingo Mutual Check — a Tampermonkey userscript for comparing following and followers, with local snapshots and change history.

本项目由社区独立开发，与 Duolingo 官方无隶属关系。

## 安装一次

1. 在浏览器安装 [Tampermonkey](https://www.tampermonkey.net/)（已安装可跳过）。
2. 点击 **[安装脚本](https://raw.githubusercontent.com/Redwinam/duolingo-mutual-check/main/dist/duolingo-mutual-check.user.js)**，在油猴页面确认安装。
3. 打开并登录 [多邻国](https://www.duolingo.com/)，刷新页面，点击右下角「⇄ 互关核对」。

如果安装链接只显示代码或下载了文件，可以在油猴「添加新脚本」中，用 `dist/duolingo-mutual-check.user.js` 的完整内容替换默认代码后保存。

也可以在油猴「管理面板 → 实用工具 → 从文件导入」中选择这个 `.user.js` 文件。更新时保持脚本名称和 namespace 不变，覆盖原脚本即可继续使用原历史。

公开版包含更新地址，油猴可以检查 GitHub 上的新版本。脚本运行时不加载远程代码；更新遵循油猴本身的更新设置。

若按钮没有出现，先确认脚本已启用。Chromium 浏览器还可能需要在油猴扩展详情中启用「允许用户脚本」；见 [油猴官方说明](https://www.tampermonkey.net/faq.php#Q209)。支持 `www.duolingo.com`、`preview.duolingo.com` 和 `duolingo.com`。

## 每次使用

1. 打开已登录的多邻国网页，建议停留在自己的个人主页。
2. 点击右下角「⇄ 互关核对」，等待核对完成。
3. 查看分类，点击账号旁的「打开主页」去回关或取消关注。

| 分类 | 表示什么 |
| --- | --- |
| 需要回关 | 关注了你，但你还没有关注的人 |
| 对方未关注我 | 你关注了对方，但对方不在当前关注者名单中 |
| 新增关注者 | 与所选历史记录相比，新增到关注者名单的人 |
| 疑似取关 | 与所选历史记录相比，从关注者名单消失的人 |

第一次核对会建立基线，不能追溯安装前谁取关了你。第二次起会比较上次完整记录，也可以选择更早记录。每次成功核对保留一份快照，最多保存最近 30 次；「导出记录」可下载 JSON 存档，目前不提供导入历史功能。

工具只核对和提供个人主页链接，不自动关注或取关。网页端与手机端显示范围不同的记录，仍需在手机核对。「疑似取关」只证明账号从网页名单中消失，不能单凭它确定消失原因。

## 登录与数据

- 复用多邻国当前页面已有的登录状态，登录信息仅在内存中用于请求同一多邻国站点，不保存、不导出、不写日志。
- 所有请求均为读取，不调用关注、取关等写入接口。
- 快照只保存账号 ID、昵称、用户名、时间及两份名单，放在油猴的脚本本地存储中，不上传到第三方。标准站和 preview 站共享同一份脚本历史。
- 按账号 ID 隔离历史记录，支持切换账号；改昵称不会被误认为取关。
- 仅申请油猴本地读写和菜单权限，没有远程代码依赖或跨站请求权限。网页载入时只显示按钮，点击按钮后才核对。
- 删除脚本可能同时清除它的本地历史，删除前请导出需要保留的记录。

## 完整性检查

会读取分页直到结束，并重复读取两份名单，确认账号集合稳定后才保存。分页异常、重复账号、网络失败、登录失效、请求限流或读取中名单变化，都不会覆盖历史记录。在自己的英文个人主页上，还会核对显示计数与实际条数。

即便两边人数相等，也会逐个比较账号。网页内部接口可能变化，若出现格式变化提示，需要更新工具后再试。

## 本地开发

无需安装第三方依赖。Node.js 22 或更新版本：

```sh
npm test
npm run build
```

生成的独立油猴脚本为 `dist/duolingo-mutual-check.user.js`。源代码在 `src/`，测试在 `tests/`。

实现依据：2026-10-18 检查的多邻国公开网页客户端中，名单读取使用 `/2017-06-30/friends/users/{id}/following` 与 `/followers`，分页字段为 `pageSize`、`pageAfter` 和响应 `cursor`。这不是多邻国提供的接口稳定性承诺。油猴接口参考 [官方文档](https://www.tampermonkey.net/documentation.php)。

## 反馈问题

请在 [Issues](https://github.com/Redwinam/duolingo-mutual-check/issues) 中描述浏览器、油猴版本和报错文字。不要提交 Cookie、登录令牌或完整个人名单；截图请先隐去个人资料。

## 协议

Copyright © 2026 [Redwinam](https://github.com/Redwinam)。

本项目的源代码、发布脚本和文档均采用 **[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)**（知识共享署名—非商业性使用—相同方式共享 4.0 国际）协议：允许在遵守协议的前提下分享和修改；需要署名、附上协议链接并注明修改，不得用于商业目的，改编作品以相同协议分享。完整条款见 [LICENSE](LICENSE)。

署名示例：多邻国 · 互关核对，作者 Redwinam，https://github.com/Redwinam/duolingo-mutual-check ，CC BY-NC-SA 4.0；如有修改，请注明。
