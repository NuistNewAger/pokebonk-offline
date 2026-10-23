# PokéBonk 离线版（Windows 单机 + Android）

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
> | [v-reza/pokebonk-re](https://github.com/v-reza/pokebonk-re)（MIT） | **最主要的参考**：把客户端里写死的 `api.pokebonk.com` 重定向到本地实现、用本地存储模拟账号/档案/对局/赛季接口。本项目的 `lib/` 与手机端 `pb-api-shim.js` 就是据此裁剪出的单机版 |
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
> * 游戏素材的版权不属于本项目，详见 [LICENSE](LICENSE) 与 [NOTICE.md](NOTICE.md)。
> * 任何权利人要求删除，**我们立刻删除，不辩解**。

把 [pokebonk.com](https://pokebonk.com/) 这个网页游戏搬到本机：**双击即玩、断网可玩**，游戏文件仍会**定时从官网同步更新**。同一套内容也打包成了 **Android APK**，可以在平板上原生全屏玩。

当前状态：**v0.8.28（构建 mvkwzlv4）**，已镜像 6771 个文件 / 约 127 MB；每 6 小时自动更新游戏文件；每次启动自动同步官网全服排行榜；**APK 已在华为 MatePad 11（Android 12）真机实测通过**。

![预览](预览.png)

---

## 一、怎么玩

### 电脑（Windows）

双击 **`启动游戏.vbs`**。

它会做三件事：

1. 后台静默启动本地服务器（`127.0.0.1:8787`，只监听本机）；
2. 用 Chrome/Edge 的“应用窗口”打开游戏，看起来就像一个独立客户端；
3. 关掉窗口后服务器仍在后台（占用极小），下次启动会自动复用。

首次进入是**游客登录**（本地账号，与官网无关），也可以直接「创建账号」，选一只御三家就能开打。

- 想看到服务器日志 / 排查问题：双击 `启动游戏(调试).cmd`。
- 想彻底重置存档：关闭游戏窗口，删除 `data\store.json`。

### 平板 / 手机（Android）

安装根目录的 **`Pokebonk-Offline-0.8.28.apk`**（约 107 MB）：

1. 把 APK 传到平板（数据线、微信文件传输、网盘都行）；
2. 点开安装，系统会提示“未知来源应用”，允许即可（没有上架应用商店，属于自签名包）；
3. 桌面出现 **PokéBonk 离线版** 图标，打开就是横屏全屏游戏。

装好之后**完全独立**：游戏文件（含模型、贴图、音效、多语言）都在 APK 里，不装 Node、不需要电脑、断网也能玩。只有“官网排行榜”这一项需要联网，联网时会通过原生接口取回真实榜单。

![平板端排行榜](预览-平板.png)

---

## 二、目录结构

| 路径 | 作用 |
| --- | --- |
| `web\` | 游戏本体（官网镜像：脚本、模型、贴图、音效、多语言数据） |
| `data\store.json` | 你的存档：账号、进度、图鉴、星尘、设置 |
| `browser\` | 游戏专用 Chrome 配置（localStorage 存档文件也在这里） |
| `state\index.json` | 同步索引（每个文件的哈希 / ETag，用于增量更新） |
| `state\sync.log` | 每次自动更新的日志 |
| `server.mjs` | 本地服务器：静态文件 + 本地 API + 游戏内 URL 改写 |
| `sync.mjs` | 镜像同步工具（首次全量 / 之后增量） |
| `lib\` | 本地 API 实现（账号、档案、对局结算、排行榜等） |
| `Pokebonk-Offline-0.8.28.apk` | 安卓安装包（游戏文件全在里面，约 107 MB） |
| `android\` | 安卓工程：Java 源码、清单、图标、构建脚本、开发工具 |
| `android\assets-extra\pb-api-shim.js` | 手机端的本地 API 层（浏览器版，等价于电脑上的 `lib\`） |

---

## 三、更新游戏（“联网更新数据”）

游戏文件不是焊死的，会按下面三种方式保持最新：

1. **定时自动更新（推荐，已装好）**：Windows 计划任务 `PokebonkOfflineSync` 每 6 小时检查一次；关机/睡眠错过的计划会在开机后补跑。
   - 手动试跑：`检查更新.cmd`
   - 取消：`移除定时更新.cmd`
   - 官网构建号没变时，一次检查只要 3 秒左右；有新版时才下载新增的 JS/CSS（约 10–20 MB）。
2. **启动即用最新缓存**：计划任务更新时把新文件写进 `web\`，下次打开游戏就是新版。
3. **按需补抓**：万一游戏里用到了镜像里没有的资源（新活动图、新宝可梦模型等），本地服务器会当场从官网取一份、存进 `web\`，之后离线也能用。

更新是**增量**的：只下载哈希/ETag 变化了的文件（官网每次发版，JS/CSS 文件名会变），已缓存且未变化的不重复下载。

命令行手动同步：

```powershell
node sync.mjs --update --list-file state\asset-list.txt   # 增量
node sync.mjs --crawl                                     # 全量重抓
node sync.mjs --list                                      # 只列出发现的新资源，不下载
```

---

## 四、官网排行榜同步

每次启动游戏，本地服务器会在后台做两件事：

1. 用浏览器里那套官方接口（`api.pokebonk.com`）拉取**真实的全服排行榜**——击败数/生存时间的本周榜与历史榜、各地区榜、按宝可梦榜；
2. 结果存进 `data\leaderboard-cache.json`，游戏内打开「排行榜」看到的就是官网数据（真实玩家、真实名次、真实赛季倒计时）。

规则：

- 启动时同步一次；之后**每 15 分钟**刷新一次，长时间挂着玩也不会过期；
- 同一份榜单 5 分钟内只请求一次，切页签不重复拉；
- 官网接口需要登录态，所以服务器会自己注册一个**匿名游客账号**，只用来读公开榜单，不参与排名、不上传你的任何数据；
- 断网或官网维护时，自动回退到上一次缓存；连缓存都没有时，退回“本机账号榜单”（空榜）；
- 官网连续请求失败会进入 2 分钟冷却，避免离线打开排行榜时卡住；
- 你的本地游客身份不会出现在官网榜里（所以底部仍显示“游客不计入排行榜”），这是正常现象。

![排行榜同步效果](预览-排行榜.png)

想立刻刷新：

```powershell
curl http://127.0.0.1:8787/__pb/refresh-boards
```

查看缓存状态：

```powershell
curl http://127.0.0.1:8787/__pb/status
```

---

## 五、本地账号与本地排名

### 创建账号（不是游客）

登录页有三个标签：**游客 / 进入 / 创建账号**。

- **创建账号**：填训练家名称（3–16 字）+ 密码（输两遍），回车即可。账号存在本机，密码用 scrypt 加盐哈希，不会上传到任何地方。
- **进入**：用已创建的账号登录。
- **游客**：临时玩，不计入排行榜（和官网规则一致）。

### 游客升级成正式账号（保留进度）

游客玩过之后，再在登录页点「创建账号」，客户端会走 `/auth/upgrade`——把当前游客身份升级成正式账号（改名、设密码），**已有的图鉴、星尘、战绩全部保留**，不会开新档。

### 本地排名怎么算

游戏内「排行榜」现在是**官网全服榜 + 你的本地账号**合并后的结果：

1. 取官网榜单的前 100 名（击败数 / 生存时间 / 各地区的本周榜与历史榜）；
2. 把你本地所有**正式账号**（游客不算）按同一规则算一份成绩，插入进去；
3. 在本机按规则重新排序、重新编号——击败数榜从高到低，时间榜从快到慢；
4. 「你的赛季」卡片显示你在这个合并榜里的名次、击败数、以及距离前 100 还差多少。

![本地账号参与排名](预览-排行榜-本地账号.png)

说明：官网接口一次最多给 100 条，所以你的名次是“**已知的 100 名 + 本地账号**”范围内的名次；排在 100 名之外时统一显示 `101`（表示“前 100 之外”），而不是官方 25 万人的真实名次。本地账号也不会出现在官网服务器上。

---

## 六、和官网版的区别

| | 官网 | 本离线版 |
| --- | --- | --- |
| 网络 | 必须联网 | 断网可玩，联网时自动更新 |
| 账号 | 官网账号 / 云存档 | 本机账号（可注册、可登录），存档在 `data\store.json` |
| 排行榜 | 全服排行 | 同步官网全服榜（只读）+ 本地账号合并后在本机重排 |
| 好友 / 战队 / 合作模式 | 支持 | 不可用（接口返回空数据） |
| 数据上传 | 会上报 | 不连 `api.pokebonk.com` 的写接口，只读取公开榜单 |

技术上做了三件事：

1. 把游戏里写死的 `https://api.pokebonk.com` 在服务端改写为 `/api`，由 `lib/` 里的本地实现应答；
2. Cloudflare Turnstile 验证码用本地桩（`lib/turnstile-stub.js`）替代；
3. 去掉 Cloudflare 的统计脚本。

因为改写在服务端进行（不落盘修改），官网发新版后依然有效，不需要重新打补丁。

---

## 七、常见问题

**Q：提示找不到 Node.js？**
安装 [Node.js LTS](https://nodejs.org)（本机是 v24，装默认选项即可），然后重新双击 `启动游戏.vbs`。

**Q：端口 8787 被占用？**
改 `server.mjs` 顶部的 `PORT`，同时把 `启动游戏.vbs` 里的 `port = 8787` 改成同一个值（改端口等于换存档位置，旧存档不会自动带过去）。

**Q：SmartScreen / 杀毒软件报警？**
`启动游戏.vbs` 只是一个“启动 node + 打开 Chrome”的脚本，没有任何联网上传行为，可自行用记事本打开核对。

**Q：存档在哪？怎么备份？**
`data\store.json`（进度）+ `browser\` 目录（浏览器端缓存）。整个文件夹拷贝走就是完整备份。

**Q：能把官网的老进度搬过来吗？**
不能直接搬：官网进度存在它的服务器账号里，本离线版是另一套账号体系。只能重新开档。

**Q：更新会不会把存档冲掉？**
不会。更新只动 `web\`，存档在 `data\` 和 `browser\`。

**Q：平板上截图看不到游戏画面 / 只有 HUD？**
这是华为等部分设备的系统限制：WebGL 图层不参与截图合成，屏幕上肉眼是正常的（已用 `readPixels` 验证过画面确实在渲染）。

**Q：平板端存档在哪？怎么备份？**
存在应用私有目录的 WebView 存储里。备份用 `adb backup` 或应用内「保存到账号」后自行记录；卸载应用会一并清除。

**Q：平板端怎么更新游戏版本？**
见下面「十、手机版（Android）详解」的更新小节。

---

## 八、手机版（Android）详解

### 它是怎么跑起来的

APK 里没有 Node，所以换了一套等价实现：

| 电脑版 | 手机版 |
| --- | --- |
| `server.mjs` 提供静态文件 | Java 层用 `shouldInterceptRequest` 把 `https://pb.local/...` 映射到 APK 内的 `assets/web/...` |
| 服务端改写 `api.pokebonk.com` → `/api` | 返回 JS 时做同样替换 |
| `lib/*.mjs` 实现本地 API | 页面里注入 `pb-api-shim.js`（浏览器版，接管 `window.fetch`，用 localStorage 存档） |
| `lib/official.mjs` 用 Node 拉官网榜单 | Java 的 `PBAndroid.officialGet()` 同步拉取（绕开浏览器跨域限制），再交给 JS 合并排序 |

也就是说：手机端和电脑端**账号、对局、榜单合并的规则完全一致**，只是把 Node 换成了「Java 资源拦截 + JS 本地 API」。

### 平板兼容修正（两个真机踩到的坑）

游戏是给新版 Chromium 设计的，华为平板的内核是 Chromium 114，加上它上报的 DPR 偏高，直接跑会有两处显示问题，都已经在服务层修掉（不改磁盘上的游戏文件）：

1. **选御三家卡片一片空白** —— 旧内核的 UA 样式表里 `<button>` 是 `align-items: flex-start`，新版改成了 `normal`（等价 stretch）。游戏的 `.sp-card` 是 `<button>` + 纵向 flex 且没自己声明 `align-items`，于是卡片里的精灵容器宽度塌成 0。
   修正：注入 `lib/pb-compat.css` → `button { align-items: normal }`。
2. **标题和底部按钮被裁掉** —— 游戏只在「触摸 + 横屏 + 短边 < 480px」时才放宽虚拟视口（手机逻辑）。平板物理 2560×1600、DPR 2.5，只拿到 1024×640 的 CSS 视口，装不下约 740px 高的基础布局，居中的容器就上下一起溢出。
   修正：把游戏里那对阈值 `480 / 1100` 用正则替换成 `screen.width>=900 ? 820/1280 : 480/1100`，让平板也走放宽分支 → 视口变成 1280×800，正好是平板常见尺寸。

两处修正都写在 `server.mjs`（`applyViewportPatch`）和 `MainActivity.java`（同名方法）里，电脑版与手机版行为一致；以后官网换构建版本，正则匹配变量名仍然有效，匹配不到就只记一条日志、按原样提供。

`android/dev/` 里是排查用的脚本（模拟 APK 管线、真机流程驱动、视口/裁切诊断、健康检查），需要时可以直接 `node android/dev/xxx.mjs` 复跑。

### 更新到新版本

游戏发新版后，在电脑上这样重新打包（`web\` 是同一份镜像）：

```powershell
node sync.mjs --update --list-file state\asset-list.txt     # 1. 同步官网最新文件
powershell -ExecutionPolicy Bypass -File android\build-apk.ps1   # 2. 重新打包（连上平板会自动安装）
```

`build-apk.ps1` 会自动：打包 assets → 编译资源与 Java → d8 生成 dex → 对齐 → 用 `android\pokebonk.keystore` 签名 → 检测到 adb 设备就 `adb install -r`。
（Java 层已经预留了 `filesDir/overlay` 覆盖目录，将来要做应用内增量更新时直接往那里写文件即可。）

### 自己从源码构建需要什么

- JDK 11+（本机是 JDK 25）
- Android SDK：`platforms;android-34`、`build-tools;36.0.0`（脚本会自动选用已安装的最新 build-tools）、`platform-tools`
- 不需要 Gradle，也不需要 Android Studio

---

## 九、卸载

电脑版：直接删除整个 `Pokebonk-Offline` 文件夹；如果装过定时任务，先运行一次 `移除定时更新.cmd`，再删除。

平板版：像普通应用一样卸载即可。

---

## 十、参考与致谢

- 游戏本体与素材：[PokéBonk](https://pokebonk.com/)，作者 Charcher。
- 本地 API 的接口形状与实现思路参考了 [v-reza/pokebonk-re](https://github.com/v-reza/pokebonk-re)（MIT），它把客户端的 `api.pokebonk.com` 重定向到本地实现；本目录的 `lib/` 与 `android/assets-extra/pb-api-shim.js` 是据此裁剪出的单机版本，去掉了合作/联机相关部分。
- 本目录的 `sync.mjs`、`server.mjs`、安卓工程与启动器为本项目自写，用来把“镜像 + 定时增量更新 + 本地存档 + 本地排名”串起来。

