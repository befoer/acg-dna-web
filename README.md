# ACG DNA Web

ACG DNA Web 是一个无需账号、无需自建服务器的属性图创作工具。所有项目数据默认保存在用户自己的浏览器中。

当前状态：核心 MVP 已建立本地编辑与可靠保存闭环。当前版本支持三级属性数据、全局标签样式、内置/本地字体、确定性基础聚合/重力碰撞布局、PC 画布完整适应与缩放、Canvas 实时预览、本地图片、三款本地模板、可调整的标签范围、多项目 IndexedDB 自动保存与恢复、撤销重做、带图片的项目文件导入导出，以及 PNG 导出；在线搜索按后续阶段推进。

## 核心 MVP

- 创建、打开、复制和删除本地属性图项目
- 编辑分类、属性和子属性的名称、数值、图片与显隐状态
- 通过 AniList 在线搜索可导出的角色/作品图片；Bangumi 中文词典延期到后续版本
- 在画布中实时预览属性气泡图
- 提供基础聚合与重力碰撞布局、三款本地模板、标签范围、全局标签样式、主题颜色和背景设置
- 默认使用系统黑体，并提供按需加载的资源圆体 Bold、阿里妈妈方圆体和用户本地字体
- 保留精简的视觉标题卡：头像、昵称、显隐和预设位置
- 撤销、重做和自动保存
- 导出 PNG
- 导入、导出 ACG DNA Web 自有项目文件
- 移动端尽量延续现有 APP，PC 端使用共享组件的简化工作区

详细边界见 docs/MVP_SCOPE.md。

## 不包含

- 登录、注册、QQ 登录或任何账号体系
- 云端发布、用户主页、关注、收藏和通知
- 公开图社区、相似度计算或服务器同步
- 从旧 Android 应用导入用户项目数据
- 自建图片代理和第三方数据批量采集

## 计划技术栈

- React
- TypeScript
- Vite
- Canvas 2D
- IndexedDB
- Vitest 与 Playwright
- GitHub Actions 与 GitHub Pages

## 素材说明

项目作者已确认现有 Logo、图标和模板为本人制作且可以公开。资源圆体采用 SIL OFL 1.1；阿里妈妈方圆体遵循其官方《阿里妈妈方圆体法律声明》，不应视为 OFL 开源字体。详见 THIRD_PARTY_NOTICES.md。

## 开发

需要 Node.js 20.19+、22.12+ 或 24+。在仓库根目录执行：

```bash
npm install
npm start
```

`npm start` 会启动 Vite 并自动打开正确的本地网址。不要直接双击仓库根目录的 `index.html`，它是需要 Vite 转译的源码入口。

提交前可运行完整本地检查：

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

项目和本地图片 Blob 会按项目隔离保存在浏览器 IndexedDB，支持新建、切换、复制、重命名和删除；旧版单项目记录会安全迁移且保留原记录。编辑器支持顶部按钮以及 `Ctrl/Cmd+Z`、`Ctrl/Cmd+Shift+Z`、`Ctrl/Cmd+Y` 撤销重做，也可导入或导出带图片的 `.acgdna.json` 项目文件。

两套内置中文字体只在用户选中时加载，PNG 导出会等待所选字体就绪。用户选择的 TTF、OTF、WOFF 或 WOFF2 字体只保存在当前浏览器的独立 IndexedDB 字体库，不上传，也不嵌入 `.acgdna.json`；换浏览器或换设备后需要重新选择同一字体文件。

## 许可证

源代码采用 Mozilla Public License 2.0。商标、Logo、截图、字体、模板和其他素材可能采用不同许可，具体以 THIRD_PARTY_NOTICES.md 及素材目录中的说明为准。
