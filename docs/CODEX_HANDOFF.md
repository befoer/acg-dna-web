# Codex 项目交接

更新日期：2026-07-16

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
- 资料板块按 Android APP 创作页完整复刻，但删除从账号自动载入资料和“我的主页”头像来源；头像仅从本地选择。
- 第一版允许在线搜索图片并只接入 AniList；Bangumi 中文词典和元数据接入延期到后续版本。
- 现有 Logo、图标、模板图形均由项目作者制作并允许公开。资源圆体采用 SIL OFL 1.1；阿里妈妈方圆体遵循其官方《阿里妈妈方圆体法律声明》，允许合法的商业、非商业及嵌入式使用，但不得写成 OFL。

## UI 决策

移动端优先，尽量延续现有 APP：顶部标题/保存状态/导出，中间画布，底部模板、数据、资料、外观入口和可展开抽屉。MVP 的外观入口仅包含背景、画布比例、基础描边等设置，不等于完整装饰图层系统。

PC 第一版不完整复制概念图中的双侧面板，而使用：顶部工具栏、左侧工具栏、单个 320 至 360 像素功能面板、中央自适应画布。属性设置继续在左侧面板内切换，右侧属性检查器、可调宽度面板和复杂拖放延后。

移动端和 PC 必须共享 Editor Store、Canvas、DataPanel、TemplatePanel、ProfilePanel 和 AppearancePanel，不能维护两套业务逻辑。

## 当前实现进度

- 已完成 React + TypeScript + Vite 工程、ESLint、Prettier、Vitest、Schema v1、共享 Editor Store、三级数据编辑、本地图片、Canvas 预览与 PNG 导出。
- IndexedDB 已升级为多项目存储：每个项目的文档和图片 Blob 相互隔离，支持新建、切换、复制、重命名和确认删除；切换前会强制保存当前编辑，删除最后一个项目后自动创建新项目。
- 数据库结构版本为 v3：升级时保留旧版 `current` 项目和旧图片表，并在新版项目库为空时复制迁移；也能修复仅有旧表的中间态 v2 数据库，迁移失败不会删除旧记录。
- 已支持带版本号的 `.acgdna.json` 项目文件：图片以内嵌 Base64 携带，导入前校验格式、Schema、版本、大小、图片引用和可解码性；成功导入为新项目，失败不覆盖当前项目。
- PC Canvas 使用统一比例完整适应可用舞台；预览支持相对适应比例 50% 至 200% 缩放，放大后只在 Canvas 视口内部滚动，导出逻辑尺寸不变。
- Canvas 设置包含 packing 和 gravity 两种布局模式；旧 Schema v1 数据缺少该字段时回退到 packing。
- gravity 使用固定步数和稳定哈希，对顶层分类、分类内属性、属性内子属性递归执行重力松弛、零间距圆碰撞和父圆边界约束；顶层分类最终向底部中心收拢成紧凑堆叠，子级在碰撞前会等比放大到父圈 98.5% 可用半径，避免横向长链和父圈大面积空置；拥挤布局无法收敛时回退到最近一次有效位置。
- 数据树沿用 APP 的紧凑编辑行：节点名称旁直接显示权重滑块和数值，选中节点卡片不再重复提供独立权重输入。
- 数据面板已接入共享的全局标签设置：分类/标签文字和图片显隐、分级描边、色块透明度、字重、可撤销的统一标签色与文字色，以及一键重置。默认字体为系统黑体；资源圆体 Bold 和阿里妈妈方圆体按需加载。阿里妈妈方圆体沿用 APP 的轴映射：0–100 圆度按 5% 量化后映射到 BEVL 1–100，并与 wght 同时设置。由于旧 Chromium 会忽略 FontFace 上的变量描述符，预览改由与 Canvas 对齐的 SVG/CSS 文字层绘制；PNG 导出将同一文字层和原始 TTF 内嵌到临时 SVG 后栅格化回 Canvas。用户也可载入最大 20 MB 的本地 TTF、OTF、WOFF 或 WOFF2。Canvas 预览和 PNG 导出等待字体就绪；本地字体保存在独立 IndexedDB 字体库，只随项目保存 ID/名称引用，不上传也不嵌入项目文件，换设备时需重新选择。
- 已接入 APP 同款本地资料板块：可爱日记 3 个、工业风 2 个资料子模板直接使用作者原始配置与素材；支持头像/昵称独立显隐、男/女/无性别、0–4 个标签、模板文本块和可在画布拖动的自定义文字。自定义文字包含字体、字号、字重、方圆体圆度、旋转、宽度、颜色与描边，预览和 PNG 共用 SVG 可变字体管线。头像复用项目图片 Blob、撤销重做、自动保存、项目文件和 PNG 导出；没有账号自动载入、“我的主页”、社交或服务器逻辑。
- 已接入经典画布、可爱日记和工业风三款带版本号的本地模板；模板只更新画布尺寸、背景和默认标签范围，不替换用户分类、节点或图片，并可作为一步历史撤销。
- Canvas 和数据模型已支持归一化标签范围（位置、宽高和旋转）；经典画布默认使用整张画布，最终圆群会保持正圆与碰撞关系并等比贴合模板范围。PC 左侧工具栏与移动端底部抽屉共享数据、模板、范围三个面板，范围编辑边框不会进入 PNG。
- 已完成编辑历史：项目名、背景以及同一节点同一字段在 900 毫秒内的连续输入合并为一步，结构和图片操作独立入栈，最多保留 60 步；撤销重做同时恢复文档、选择和图片资产，并触发本地自动保存。
- 顶栏提供移动端可用的撤销重做按钮，同时支持 `Ctrl/Cmd+Z`、`Ctrl/Cmd+Shift+Z` 和 `Ctrl/Cmd+Y`。
- 在线搜索尚未展开。

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
8. 接入 AniList 搜索提供方。
9. 接入 APP 资料板块和第一批固定模板。
10. 完成 375、768、1024、1440 宽度和 PNG 视觉回归。

## 安全与许可

- 不复制 Android 的 BackendApiConfig、keystore.properties、local.properties、数据库备份、QQ SDK、云函数或 SQL。
- 仓库当前不具备个人私有仓库的 GitHub Secret Protection；公开后 Secret Scanning 会免费运行。私人阶段继续使用本地扫描和严格 .gitignore。
- 资源圆体已无损转换为 WOFF2 并附 SIL OFL 1.1；阿里妈妈方圆体保留原始 TTF，并遵循其官方《阿里妈妈方圆体法律声明》。公开仓库时应同时保留清晰的字体来源和独立授权说明。
- Bangumi 派生数据公开前补齐来源、生成日期和 CC BY-SA 许可说明。
- 原创图形/模板还需要确定独立的素材许可证；不要擅自假设 MPL-2.0 自动覆盖商标和所有二进制素材。

## 禁止事项

- 不恢复账号、发布、社交、关注、通知或相似度功能。
- 不为搜索功能引入隐藏服务器或密钥。
- 不把整个 Android 工程或 reference 目录提交到 Web 仓库。
- 不直接把不支持 CORS 的远程图片画入 Canvas。
- 不在没有测试的情况下重写全部布局算法。
