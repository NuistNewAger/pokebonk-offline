# PokéBonk 离线版 · 手机版（Android APK）

> ## 🙏 致敬与感谢
>
> **首先要感谢的是游戏原作者 —— Charcher。**
> 这个游戏是 TA 一个人做出来的免费同人作品：[pokebonk.com](https://pokebonk.com/)，
> 没有广告、没有内购、没有捐赠。本仓库一行游戏代码都没写过，只是把人家做好的
> 游戏打包成安卓应用离线跑。喜欢的话请去官网玩、加入[官方 Discord](https://discord.gg/X7KusQqx8X)
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
> | [v-reza/pokebonk-re](https://github.com/v-reza/pokebonk-re)（MIT） | **最主要的参考**：把客户端里写死的 `api.pokebonk.com` 重定向到本地实现、用本地存储模拟账号/档案/对局/赛季接口。本项目的 `pb-api-shim.js` 就是据此裁剪出的单机版 |
> | [acshan/pokebonk-recovered](https://github.com/acshan/pokebonk-recovered) | 浏览器内还原版的实践，验证了"后端搬到本地"可行 |
> | [vacfeg/pokebonk-multiplayer](https://github.com/vacfeg/pokebonk-multiplayer) | 在服务端改写 bundle 字符串（改 API 地址、注入钩子）的做法 |
> | [JOWEND04/unofficial_pokebonk_app](https://github.com/JOWEND04/unofficial_pokebonk_app) · [byazlle/pokebonk-app](https://github.com/byazlle/pokebonk-app) · [alfonsopuicercus/pokebonk-thor-launcher](https://github.com/alfonsopuicercus/pokebonk-thor-launcher) | 安卓 WebView 封装与启动器的思路 |
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

把 [pokebonk.com](https://pokebonk.com/) 打包成安卓应用：**装上就能玩，不需要电脑、不需要 Node、断网也能玩**。

当前版本：**v0.8.28**，APK 约 106.7 MB（游戏文件全在里面）。

> 📦 **APK 本体不在仓库里** —— 单文件 106.7 MB，超过 GitHub 仓库的 100 MB 上限，
> 请到 **[Releases](../releases)** 下载（打包好的完整包也在那里）。
> 本目录保留的是**安卓工程完整源码**，可按下方「四、自己从源码构建」自行打包。

![预览](预览-平板.png)

---

## 一、安装

1. 把 `Pokebonk-Offline-0.8.28.apk` 传到平板/手机（数据线、网盘、微信文件传输都行）；
2. 点开安装，系统会提示"未知来源应用"，允许即可（**没有上架应用商店，是自签名包**）；
3. 桌面出现 **PokéBonk 离线版** 图标，打开就是横屏全屏游戏。

要求 **Android 7.0 及以上**。已在 **华为 MatePad 11（Android 12 / Chromium 114 内核）** 真机实测通过。

## 二、功能

* 完整游戏内容：6773 个文件（模型、贴图、音效、9 种语言）全部内置，**离线可玩**
* 本地账号：可以「游客」直接玩，也可以「创建账号」建正式账号；游客后来创建账号会**升级**成正式账号并保留进度
* 本地存档：存在应用私有目录，不联网也不丢
* **官网排行榜**：联网时由原生层拉取真实全服榜（浏览器跨域拿不到），并把你自己的成绩合并进来在本地重新排名
* 触摸操作：虚拟摇杆 + 技能按钮，横屏全屏，隐藏系统栏

> 与电脑单机版的差别：手机端的存档在应用内（和电脑上的 `data\store.json` 不互通）；
> 另外手机端不提供好友/战队/合作模式（与电脑版一致，接口返回空数据）。

## 三、已修的兼容问题（华为平板实测）

游戏是给新版 Chromium 设计的，旧内核 + 高 DPR 机型会有两处显示问题，都已在服务层修掉（不改游戏文件）：

| 现象 | 原因 | 修法 |
| --- | --- | --- |
| 选御三家卡片一片空白 | 旧内核 UA 样式给 `<button>` 设 `align-items: flex-start`（新版是 `normal`），游戏的卡片是 `<button>` + 纵向 flex 且没自己声明，导致精灵容器宽度塌成 0 | 注入 `button { align-items: normal }`（`android/assets-extra` 同级由构建脚本打包 `pb-compat.css`） |
| 标题和底部按钮被裁 | 游戏只在「触摸 + 横屏 + 短边 < 480px」时放宽虚拟视口；平板 DPR 2.5 只拿到 1024×640，装不下约 740px 高的基础布局 | 用正则把阈值改成 `screen.width>=900 ? 820/1280 : 480/1100`，平板视口变 1280×800 |

## 四、自己从源码构建

需要：**JDK 11+**、**Android SDK**（`platforms;android-34`、`build-tools`、`platform-tools`）。
**不需要 Gradle，也不需要 Android Studio**（脚本直接调 aapt2 / javac / d8 / apksigner）。

```powershell
powershell -ExecutionPolicy Bypass -File android\build-apk.ps1
```

脚本会自动：打包 assets → 编译资源与 Java → d8 生成 dex → 对齐 → 用 `android\pokebonk.keystore` 签名 → 检测到 adb 设备就自动安装。

> 构建需要同级目录里的 **电脑单机版-Windows**（提供 `web\` 游戏文件与 `lib\pb-compat.css`），脚本会自动去找。

```
android\
├─ java\com\pokebonk\offline\MainActivity.java   WebView + 资源拦截 + 官网榜单桥接 + 两处兼容补丁
├─ assets-extra\pb-api-shim.js                   浏览器版本地 API（接管 window.fetch，localStorage 存档）
├─ res\、AndroidManifest.xml
├─ build-apk.ps1                                 一条命令打包
└─ dev\                                          排查用脚本（模拟管线、真机驱动、视口诊断、健康检查）
```

## 五、更新到新版本

游戏发新版后：先在**电脑单机版**里同步（`node sync.mjs --update --list-file state\asset-list.txt`），
再回来跑一次 `android\build-apk.ps1` 即可重新打包安装。

---

游戏素材版权归原作者及相应权利人所有，**禁止商用、仅供个人游玩**，详见 `LICENSE` 与 `NOTICE.md`。
需要电脑版请看同级目录里的 **电脑单机版-Windows/**。