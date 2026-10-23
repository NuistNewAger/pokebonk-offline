# 署名、素材来源与致谢

本文件说明本项目**哪些东西是别人的**、**哪些是自己写的**，以及出现问题如何联系下架。

---

## 一、游戏原作者

| 项目 | 说明 |
| --- | --- |
| 游戏名称 | **PokéBonk**（浏览器 3D 宝可梦幸存者 / Survivor） |
| 作者 | **Charcher** |
| 官网 | <https://pokebonk.com/> |
| 官方社区 | Discord <https://discord.gg/X7KusQqx8X> |
| 作者自述 | 非官方、免费、非营利的同人游戏：没有广告、内购或捐赠；与任天堂、The Pokémon Company、Creatures Inc. 和 GAME FREAK inc. 无任何关联，也未获其赞助或认可 |

**请支持原作者**：去官网玩正版、加入官方 Discord、把反馈提给作者。
本仓库只是"把同一个游戏同步到自己电脑/手机上离线玩"的工具与副本。

## 二、素材版权归属

| 内容 | 权利人 / 许可 |
| --- | --- |
| 宝可梦名称、角色、形象 | © Nintendo / Creatures Inc. / GAME FREAK inc. |
| 精灵图（PMD 风格像素图） | [PMD SpriteCollab](https://sprites.pmdcollab.org/)，**CC BY-NC 4.0（禁止商用）** |
| 游戏本体：代码包、界面、模型、音效、音乐、字体、多语言文本 | PokéBonk 作者 Charcher 及相关权利人 |
| 3D 渲染库 three.js | MIT License |

这些素材**没有**随本项目的 LICENSE 授权给你，详见 [LICENSE](LICENSE) 第三节。
本项目不含任何素材的转授权，也不允许任何商业使用。

## 三、参考与致敬的开源项目

本项目的做法不是凭空来的，下面这些项目提供了关键参考，在此一并致谢：

| 项目 | 作者 | 借鉴了什么 |
| --- | --- | --- |
| [v-reza/pokebonk-re](https://github.com/v-reza/pokebonk-re)（MIT） | v-reza | **接口形状与实现思路的主要来源**：把客户端里写死的 `api.pokebonk.com` 重定向到本地实现、用本地 JSON 模拟账号/档案/对局/赛季接口。本项目的 `lib/api-shared.mjs`、`lib/api-social.mjs` 与手机端 `pb-api-shim.js` 都是据此裁剪出的单机版本（去掉了联机/合作部分） |
| [acshan/pokebonk-recovered](https://github.com/acshan/pokebonk-recovered) | acshan | 浏览器内还原版的实践，验证了"把后端搬到本地"这条路可行 |
| [vacfeg/pokebonk-multiplayer](https://github.com/vacfeg/pokebonk-multiplayer) | vacfeg | 展示了在服务端改写 bundle 字符串（改写 API 地址、注入钩子）的做法，本项目的改写策略与此同源 |
| [JOWEND04/unofficial_pokebonk_app](https://github.com/JOWEND04/unofficial_pokebonk_app) | JOWEND04 | 安卓/Windows 客户端的封装思路 |
| [byazlle/pokebonk-app](https://github.com/byazlle/pokebonk-app) | byazlle | 把网页游戏封装成原生安卓应用的参考 |
| [alfonsopuicercus/pokebonk-thor-launcher](https://github.com/alfonsopuicercus/pokebonk-thor-launcher) | alfonsopuicercus | 手柄/启动器方向的探索 |
| [captainChaozi/pokebonk-wiki](https://github.com/captainChaozi/pokebonk-wiki)、[git-sanbu/pokebonk-guide](https://github.com/git-sanbu/pokebonk-guide) | 各位作者 | 中文资料与攻略整理 |
| [opengameapp/pokebonk](https://github.com/opengameapp/pokebonk) | opengameapp | 版本留存与迭代记录的整理方式 |

如果你是本表里某项目的作者，希望调整署名方式或移除引用，**告知后立刻改**。

## 四、本项目自己写的部分

以下内容为本项目原创（非商用范围内自由使用，保留署名即可）：

* `sync.mjs` —— 官网镜像同步：增量比对哈希/ETag、构建号检测、清单批量抓取
* `server.mjs` —— 本地服务器：静态文件、本地 API 路由、游戏内 URL 改写、榜单合并排序、视图兼容补丁
* `lib/` —— 单机化后的本地 API 实现（账号、档案、对局结算、赛季、活动、社交空实现）
* `android/` —— 安卓工程（WebView 资源拦截、原生榜单桥接、构建脚本，不依赖 Gradle）
* `android/assets-extra/pb-api-shim.js` —— 浏览器版本地 API 层（接管 `window.fetch`）
* `lib/pb-compat.css` —— 旧内核 Chromium 的样式兼容修正
* 启动器、更新脚本、定时任务脚本

## 五、本工程的开发方式与用途

本工程**全程由 DSH（DeepSeek Harness）开发**，发布到 GitHub 上**仅用作个人纪录**。

## 六、移除承诺

若 PokéBonk 作者、任天堂 / Creatures Inc. / GAME FREAK inc.、PMD SpriteCollab
或任何权利人认为本仓库或其发布包侵犯权益，请通过仓库 Issue 告知，
**我们会在第一时间删除相关文件与发布包**，不辩解、不拖延。