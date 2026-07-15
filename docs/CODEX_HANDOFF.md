# Codex 项目交接

更新日期：2026-07-15

## 项目定位

ACG DNA Web 是从 Android APP 创作页抽离出来的纯前端属性图编辑器。产品无账号、无自建服务器、无公开社区、无相似度对比；项目数据默认保存在浏览器本地。

GitHub 仓库：https://github.com/befoer/acg-dna-web

当前仓库暂时为 Private，完成并完成安全/许可检查后再公开。源代码许可证为 MPL-2.0。

## 工作区结构

当本仓库位于作者本机的完整工作区时，以仓库根目录为基准：

- .：当前 Git 仓库（外层工作区中的 acg-dna-web 子目录）
- ../reference：精选 Android 源码、原始素材、字典、截图和工具，仅供迁移参考，不提交 Git
- ../HANDOFF.md：外层工作区入口

后续 AI 必须先阅读本文件、MVP_SCOPE.md、ONLINE_IMAGE_SEARCH.md 和外层 reference/README.md。

## 已确定产品决策

- React + TypeScript + Vite。
- Canvas 2D 负责属性图预览和高清导出。
- IndexedDB 保存项目 JSON 和图片 Blob。
- 不导入旧 Android 用户项目数据。
- 保留分类、属性、子属性三级数据。
- 保留布局、模板、资料视觉标题卡、撤销重做、自动保存和 PNG 导出。
- 资料标题卡只保留本地头像、昵称、显隐和少量预设；不连接账号。
- 第一版允许在线搜索图片，优先 AniList，Bangumi 用于本地中文词典和元数据。
- 现有 Logo、图标、模板图形均由项目作者制作并允许公开；字体为开源字体。

## UI 决策

移动端优先，尽量延续现有 APP：顶部标题/保存状态/导出，中间画布，底部模板、数据、资料、外观入口和可展开抽屉。MVP 的外观入口仅包含背景、画布比例、基础描边等设置，不等于完整装饰图层系统。

PC 第一版不完整复制概念图中的双侧面板，而使用：顶部工具栏、左侧工具栏、单个 320 至 360 像素功能面板、中央自适应画布。属性设置继续在左侧面板内切换，右侧属性检查器、可调宽度面板和复杂拖放延后。

移动端和 PC 必须共享 Editor Store、Canvas、DataPanel、TemplatePanel、ProfilePanel 和 AppearancePanel，不能维护两套业务逻辑。

## 在线搜索关键结论

详见 ONLINE_IMAGE_SEARCH.md。不可忽略的结论：AniList API 和图片 CDN 可用于浏览器 Blob/Canvas；Bangumi API 可跨域，但其图片 CDN 当前会污染 Canvas。不要通过 no-cors 或未知公共代理绕过。

AniList 当前降级到每分钟 30 次请求，代码必须以响应头为准并处理 429。其条款禁止把 API 当备份数据库或批量囤积数据。

## 迁移参考优先级

以下路径均以 Git 仓库根目录为基准：

1. ../reference/android-source/data/model/AttributeGraph.kt 等模型：只提取与本地图形有关的字段。
2. ../reference/android-source/visualization：优先迁移 CirclePackingLayout 和 VerletPhysicsLayout，再迁移绘制逻辑。
3. ../reference/android-source/presentation/ui/create/editor：用作交互和功能清单，不能逐行照搬 Compose UI。
4. ../reference/assets/profile_templates 与 Android 模板图片：形成 Web 模板配置。
5. ../reference/data/bangumi 与 ../reference/tools：形成浏览器可懒加载的搜索索引。
6. ../reference/screenshots：视觉回归基准。

## 推荐实施顺序

1. 初始化 Vite React TypeScript、测试、Lint 和 GitHub Actions。
2. 建立精简的 Web 图模型、版本字段和运行时校验。
3. 建立 Editor Store、撤销重做和 IndexedDB 项目存储。
4. 翻译布局算法并用固定数据做单元测试。
5. 完成最小 Canvas 渲染和 PNG 导出。
6. 完成移动端数据面板，再扩展 PC 简化布局。
7. 接入本地图片上传、裁切、Blob 存储。
8. 接入 AniList 搜索提供方和 Bangumi 本地词典。
9. 接入精简资料标题卡和第一批固定模板。
10. 完成 375、768、1024、1440 宽度和 PNG 视觉回归。

## 安全与许可

- 不复制 Android 的 BackendApiConfig、keystore.properties、local.properties、数据库备份、QQ SDK、云函数或 SQL。
- 仓库当前不具备个人私有仓库的 GitHub Secret Protection；公开后 Secret Scanning 会免费运行。私人阶段继续使用本地扫描和严格 .gitignore。
- 字体进入正式 public 目录前必须转换为 Web 格式并附带上游许可证。
- Bangumi 派生数据公开前补齐来源、生成日期和 CC BY-SA 许可说明。
- 原创图形/模板还需要确定独立的素材许可证；不要擅自假设 MPL-2.0 自动覆盖商标和所有二进制素材。

## 禁止事项

- 不恢复账号、发布、社交、关注、通知或相似度功能。
- 不为搜索功能引入隐藏服务器或密钥。
- 不把整个 Android 工程或 reference 目录提交到 Web 仓库。
- 不直接把不支持 CORS 的远程图片画入 Canvas。
- 不在没有测试的情况下重写全部布局算法。
