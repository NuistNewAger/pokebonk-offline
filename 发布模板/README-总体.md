# PokéBonk 离线版 · 完整包（电脑单机版 + 手机版）

> ## 🙏 致敬与感谢
>
> **首先要感谢的是游戏原作者 —— Charcher。**
> 这个游戏是 TA 一个人做出来的免费同人作品：[pokebonk.com](https://pokebonk.com/)，
> 没有广告、没有内购、没有捐赠。本仓库一行游戏代码都没写过，只是把人家做好的
> 游戏同步到本地、并打包成安卓应用来离线跑。喜欢的话请去官网玩、加入
> [官方 Discord](https://discord.gg/X7KusQqx8X) 支持作者，
> 遇到游戏本身的问题也请反馈给作者，而不是这里。
>
> **感谢素材来源：**
> 精灵像素图来自 [PMD SpriteCollab](https://sprites.pmdcollab.org/)（**CC BY-NC 4.0，禁止商用**）；
> 宝可梦相关名称与形象版权属 © Nintendo / Creatures Inc. / GAME FREAK inc.；
> 3D 渲染库为 three.js（MIT）。
>
> **感谢 GitHub 上做同类项目的各位作者**（本项目是站在他们肩膀上做的）：
>
> | 项目 | 借鉴了什么 |
> | --- | --- |
> | [v-reza/pokebonk-re](https://github.com/v-reza/pokebonk-re)（MIT） | **最主要的参考**：把客户端里写死的 `api.pokebonk.com` 重定向到本地实现、用本地存储模拟账号/档案/对局/赛季接口。本项目的 `lib/`（电脑版）与 `pb-api-shim.js`（手机版）都是据此裁剪出的单机版本 |
> | [acshan/pokebonk-recovered](https://github.com/acshan/pokebonk-recovered) | 浏览器内还原版的实践，验证了"把后端搬到本地"这条路可行 |
> | [vacfeg/pokebonk-multiplayer](https://github.com/vacfeg/pokebonk-multiplayer) | 在服务端改写 bundle 字符串（改 API 地址、注入钩子）的做法，本项目的改写策略与此同源 |
> | [JOWEND04/unofficial_pokebonk_app](https://github.com/JOWEND04/unofficial_pokebonk_app) · [byazlle/pokebonk-app](https://github.com/byazlle/pokebonk-app) · [alfonsopuicercus/pokebonk-thor-launcher](https://github.com/alfonsopuicercus/pokebonk-thor-launcher) | 安卓 WebView 封装与启动器的思路 |
> | [captainChaozi/pokebonk-wiki](https://github.com/captainChaozi/pokebonk-wiki) · [git-sanbu/pokebonk-guide](https://github.com/git-sanbu/pokebonk-guide) · [opengameapp/pokebonk](https://github.com/opengameapp/pokebonk) | 中文资料、攻略与版本留存整理 |
>
> 如果上面某个项目的作者希望调整署名方式或移除引用，**告知后立刻改**。
>
> **⚠️ 使用条款（务必遵守）**
>
> * 本项目是**非官方**第三方工具，与原作者 Charcher 及任天堂等权利人**无任何关系**，未获授权或认可。
> * **禁止任何商业使用**：不得售卖、不得放进付费内容、不得挂广告、不得预装到商业设备、不得用于引流变现。
> * **仅供个人离线游玩**：请把它当成"我自己从官网同步的一份离线副本"，不要再分发、不要二次打包成自己的作品发布。
> * 游戏本体的代码、美术、音频、文本等素材版权**不属于本项目**，本项目也不授予任何素材权利，详见 [LICENSE](LICENSE) 与 [NOTICE.md](NOTICE.md)。
> * 任何权利人要求删除，**我们立刻删除，不辩解**。

---

## 这是什么

把浏览器游戏 [PokéBonk](https://pokebonk.com/) 变成**本地可玩**的两个版本：一个是 Windows 上的单机版，一个是安卓手机上装的 APK。两者内容完全一样，都是把官网的游戏文件同步到本地，再用一套本地后端（账号、存档、结算、排行榜合并）驱动它跑起来。

**断网也能玩**；联网时还能自动从官网同步游戏更新、并把官网真实排行榜取回来。

当前版本：**v0.8.28（构建 mvkwzlv4）**，游戏文件 6773 个 / 约 127 MB。

---

## 两个版本怎么选

| | 💻 电脑单机版（Windows） | 📱 手机版（Android APK） |
| --- | --- | --- |
| 目录 | `电脑单机版-Windows\` | `手机版-APK\` |
| 怎么用 | 双击 `启动游戏.vbs` | 安装 `Pokebonk-Offline-0.8.28.apk` |
| 前置条件 | 需要装 [Node.js](https://nodejs.org)（LTS） | 什么都不用装，Android 7.0+ |
| 独立性 | 依赖本机 Node 起一个本地服务器 | **完全独立**，装机即玩，不依赖电脑 |
| 游戏更新 | 每 6 小时自动同步官网（可关） | 重新打包 APK 安装即可 |
| 存档位置 | `data\store.json` + `browser\` | 应用私有目录（与电脑版不互通） |
| 排行榜 | 官网全服榜 + 你的账号合并后本地重排 | 同左（联网时由原生层拉取） |
| 实测机型 | Windows 10/11 + Chrome/Edge | 华为 MatePad 11（Android 12）真机通过 |

两个版本**互不影响**，可以只留一个，也可以都留着。

---

## 快速开始

### 💻 电脑单机版

1. 进 `电脑单机版-Windows\`；
2. 装好 [Node.js](https://nodejs.org)（LTS，默认选项）；
3. 双击 **`启动游戏.vbs`** —— 首次进入选「游客」或「创建账号」，选一只御三家开打。
4. （可选）双击一次 `安装定时更新.cmd`，之后每 6 小时自动同步官网更新。

### 📱 手机版

1. 进 `手机版-APK\`；
2. 把 `Pokebonk-Offline-0.8.28.apk` 传到手机/平板；
3. 点开安装（提示"未知来源应用"时允许即可，没有上架应用商店，是自签名包）；
4. 桌面点 **PokéBonk 离线版** 图标，横屏全屏开始玩。

---

## 目录结构

```
Pokebonk-Offline-0.8.28/
├─ README.md                  ← 你正在看的这份总体说明
├─ LICENSE                    ← 自写代码可自由使用；游戏素材不授权、禁止商用、仅个人游玩
├─ NOTICE.md                  ← 署名、素材权利人、同类项目致谢、下架承诺
│
├─ 电脑单机版-Windows/         ← 双击 启动游戏.vbs 即玩
│   ├─ README.md              （单机版详细说明）
│   ├─ 启动游戏.vbs / 启动游戏(调试).cmd
│   ├─ 检查更新.cmd / 安装定时更新.cmd / 移除定时更新.cmd
│   ├─ server.mjs            本地服务器 + 本地 API + 榜单合并
│   ├─ sync.mjs              官网镜像增量同步
│   ├─ lib/                  本地 API 实现（账号/档案/对局/赛季/活动/官网榜单）
│   ├─ web/                  游戏本体（6773 个文件，约 127 MB）
│   └─ state/asset-list.txt  资源清单（同步用）
│
└─ 手机版-APK/                ← 装 APK 即玩
    ├─ README.md              （手机版详细说明）
    ├─ Pokebonk-Offline-0.8.28.apk      安装包（约 106.7 MB，自签名）
    └─ android/                         完整源码与构建脚本（无需 Gradle）
        ├─ java/ res/ AndroidManifest.xml
        ├─ assets-extra/pb-api-shim.js  手机端本地 API 层
        ├─ build-apk.ps1                一条命令重新打包
        └─ dev/                         排查用脚本（可选）
```

---

## 它是怎么实现的（简述）

官网游戏是个前端 SPA，所有逻辑在浏览器里，但账号、存档、结算、排行榜都要请求 `api.pokebonk.com`。所以两个版本都做了同一件事：**把那个后端搬到本地**。

* **电脑版**：`server.mjs` 起一个只监听 `127.0.0.1` 的服务器，提供游戏文件；返回 JS 时把写死的 `https://api.pokebonk.com` 改写成 `/api`，由 `lib/` 里的本地实现应答（本地账号、存档、结算、赛季、活动）。官网排行榜由服务端用匿名游客身份去取，再和你自己的成绩合并、本地重新排名。
* **手机版**：APK 里没有 Node，所以 Java 层用 `shouldInterceptRequest` 把 `https://pb.local/...` 映射到包内资源，并做同样的 JS 改写；页面里注入 `pb-api-shim.js`（浏览器版本地 API，接管 `window.fetch`，用 localStorage 存档）；官网排行榜因为浏览器跨域拿不到，改由 Java 原生同步拉取，通过 `PBAndroid.officialGet()` 交给 JS 合并。

两处改写都在服务层进行，**不改磁盘上的游戏文件**，所以官网发新版后依然有效。

---

## 已知限制

* **排行榜名次**：官网接口一次最多给 100 条，所以名次是"已知的 100 名 + 本地账号"范围内的排名；排在 100 名之外显示 `101`（表示前 100 之外），不是官方 25 万人的真实名次。
* **好友 / 战队 / 合作模式**不可用（接口返回空数据），两个版本都一样。
* **官网账号不能登录**，官网的老进度也搬不过来（本地是另一套账号体系）。
* **手机端截图看不到游戏画面**：华为等部分设备的系统不把 WebGL 图层合成进截图，屏幕上肉眼正常（已用画布读像素验证过确实在渲染）。

---

## 版权与下架

游戏本体与素材版权归 **PokéBonk 作者 Charcher** 及相应权利人所有，本项目**不主张任何素材权利**：

* 自写代码（同步工具、本地服务器、安卓工程、启动器）可自由用于非商业用途，保留署名即可；
* 游戏素材**禁止一切商业使用**，**仅供个人离线游玩**；
* 本项目为非官方作品，与原作者及任天堂等无任何关联；
* **权利人要求删除，我们立刻删除**，联系方式见 [NOTICE.md](NOTICE.md)。

如果你喜欢这个游戏，请去 <https://pokebonk.com/> 支持原作者。