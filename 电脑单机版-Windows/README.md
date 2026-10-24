# PokéBonk 离线版 · 电脑单机版（Windows）

> ## 🙏 致敬与感谢
>
> **首先要感谢的是游戏原作者 —— Charcher。**
> 这个游戏是 TA 一个人做出来的免费同人作品：[pokebonk.com](https://pokebonk.com/)，
> 没有广告、没有内购、没有捐赠。本仓库一行游戏代码都没写过，只是把人家做好的
> 游戏同步到本地离线跑。喜欢的话请去官网玩、加入[官方 Discord](https://discord.gg/X7KusQqx8X)
> 支持作者，反馈也请提给作者而不是这里。
>
> **感谢素材来源：** 精灵像素图来自 [PMD SpriteCollab](https://sprites.pmdcollab.org/)
> （CC BY-NC 4.0，禁止商用）；宝可梦相关名称与形象版权属
> © Nintendo / Creatures Inc. / GAME FREAK inc.；3D 库为 three.js（MIT）。
>
> **感谢 GitHub 上做同类项目的各位作者**（本项目站在他们肩膀上）：
>
> | 项目 | 借鉴了什么 |
> | --- | --- |
> | [v-reza/pokebonk-re](https://github.com/v-reza/pokebonk-re)（MIT） | **最主要的参考**：把客户端里写死的 `api.pokebonk.com` 重定向到本地实现、用本地存储模拟账号/档案/对局/赛季接口。本项目的 `lib/` 就是据此裁剪出的单机版 |
> | [acshan/pokebonk-recovered](https://github.com/acshan/pokebonk-recovered) | 浏览器内还原版的实践，验证了"后端搬到本地"可行 |
> | [vacfeg/pokebonk-multiplayer](https://github.com/vacfeg/pokebonk-multiplayer) | 在服务端改写 bundle 字符串（改 API 地址、注入钩子）的做法 |
> | [JOWEND04/unofficial_pokebonk_app](https://github.com/JOWEND04/unofficial_pokebonk_app) · [byazlle/pokebonk-app](https://github.com/byazlle/pokebonk-app) · [alfonsopuicercus/pokebonk-thor-launcher](https://github.com/alfonsopuicercus/pokebonk-thor-launcher) | 安卓封装与启动器的思路 |
> | [captainChaozi/pokebonk-wiki](https://github.com/captainChaozi/pokebonk-wiki) · [git-sanbu/pokebonk-guide](https://github.com/git-sanbu/pokebonk-guide) · [opengameapp/pokebonk](https://github.com/opengameapp/pokebonk) | 中文资料、攻略与版本留存整理 |
>
> **⚠️ 使用条款（务必遵守）**
>
> * 本项目是**非官方**第三方工具，与原作者 Charcher 及任天堂等权利人**无任何关系**，未获授权或认可。
> * **禁止任何商业使用**：不得售卖、不得放进付费内容、不得挂广告、不得预装到商业设备、不得用于引流变现。
> * **仅供个人离线游玩**：请把它当成"我自己从官网同步的一份离线副本"，不要再分发、不要二次打包成自己的作品发布。
> * 游戏素材的版权不属于本项目，详见下面的 `LICENSE` 与 `NOTICE.md`。
> * 任何权利人要求删除，**我们立刻删除，不辩解**。
> * 本工程**全程由 DSH（DeepSeek Harness）开发**，发布到 GitHub 上**仅用作个人纪录**。

把 [pokebonk.com](https://pokebonk.com/) 搬到本机：**双击即玩、断网可玩**，游戏文件还能**定时从官网同步更新**。

当前版本：**v0.8.34（构建 mvlr7rzv）**，游戏文件 7532 个 / 约 144 MB。

![预览](预览.png)

---

## 一、怎么玩

**需要先装 [Node.js](https://nodejs.org)（LTS 版，默认选项即可）。**

双击 **`启动游戏.vbs`**，它会：

1. 后台静默启动本地服务器（`127.0.0.1:8787`，只监听本机，不对外网开放）；
2. 用 Chrome/Edge 的“应用窗口”打开游戏，看起来就像一个独立客户端；
3. 关掉窗口后服务器仍在后台（占用极小），下次启动自动复用。

首次进入可以「游客」直接玩，也可以「创建账号」建一个**本地正式账号**（名字 + 密码，密码用 scrypt 加盐哈希存在本机），选一只御三家就能开打。

- 想看服务器日志 / 排查问题：双击 `启动游戏(调试).cmd`
- 想彻底重置存档：关闭游戏窗口，删除 `data\store.json`

## 二、目录说明

| 路径 | 作用 |
| --- | --- |
| `web\` | 游戏本体（官网镜像：脚本、模型、贴图、音效、9 种语言数据） |
| `data\store.json` | 你的存档：账号、进度、图鉴、星尘、设置 |
| `browser\` | 游戏专用 Chrome 配置（浏览器端 localStorage 存档也在这里） |
| `state\index.json` | 同步索引（哈希 / ETag，用于增量更新） |
| `server.mjs` | 本地服务器：静态文件 + 本地 API + 游戏内 URL 改写 + 榜单合并 |
| `sync.mjs` | 官网镜像同步（首次全量 / 之后增量） |
| `lib\` | 本地 API 实现（账号、档案、对局结算、赛季、活动、排行榜） |

## 三、更新游戏

游戏文件不是焊死的，按下面三种方式保持最新：

1. **定时自动更新**：双击一次 `安装定时更新.cmd`，注册计划任务 `PokebonkOfflineSync`，每 6 小时检查一次，错过的计划开机后补跑；取消用 `移除定时更新.cmd`。
2. **启动即用最新缓存**：更新会把新文件写进 `web\`，下次打开就是新版。
3. **按需补抓**：万一用到镜像里没有的资源，本地服务器会当场从官网取一份存下来，之后离线可用。

更新是增量的：只下载哈希/ETag 变化了的文件；官网构建号没变时，一次检查只要 3 秒左右。

```powershell
node sync.mjs --update --list-file state\asset-list.txt   # 手动增量更新（也可双击 检查更新.cmd）
node sync.mjs --crawl                                     # 全量重抓
```

## 四、排行榜

每次启动游戏，服务器会顺带把**官网真实全服排行榜**拉下来（官网接口没有 CORS，所以由服务端去取），打开游戏里的「排行榜」看到的就是真实数据；**你自己账号的成绩会和官网前 100 名合并后在本机重新排名**，「你的赛季」卡片显示你插在第几名。

- 只有**正式账号**计入本地排名，游客不算（与官网规则一致）
- 官网接口一次最多给 100 条，所以排在 100 名之外时显示 `101`（表示"前 100 之外"），不是官方 25 万人的真实名次
- 断网时自动回退到上次缓存，连缓存都没有就退回本地空榜
- 手动刷新：浏览器打开 `http://127.0.0.1:8787/__pb/refresh-boards`

## 五、常见问题

**Q：提示找不到 Node.js？** 装 [Node.js LTS](https://nodejs.org) 后重新双击 `启动游戏.vbs`。

**Q：端口 8787 被占用？** 改 `server.mjs` 顶部的 `PORT`，同时改 `启动游戏.vbs` 里的 `port`（改端口等于换存档位置）。

**Q：杀毒 / SmartScreen 报警？** `启动游戏.vbs` 只做两件事：启动 node、打开 Chrome 应用窗口，可用记事本打开核对。

**Q：存档在哪？怎么备份？** `data\store.json` + `browser\` 目录，整个文件夹拷走就是完整备份。

**Q：能把官网的老进度搬过来吗？** 不能，官网进度在它的服务器账号里，这里是另一套本地账号体系。

**Q：更新会不会把存档冲掉？** 不会，更新只动 `web\`。

---

游戏素材版权归原作者及相应权利人所有，**禁止商用、仅供个人游玩**，详见 `LICENSE` 与 `NOTICE.md`。
需要手机版请看同级目录里的 **手机版-APK/**。