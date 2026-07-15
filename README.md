# ACG DNA Web

ACG DNA Web 是一个无需账号、无需服务器的属性图创作工具。所有项目数据默认保存在用户自己的浏览器中。

当前状态：核心 MVP 规划与仓库初始化。

## 核心 MVP

- 创建、打开、复制和删除本地属性图项目
- 编辑分类、属性和子属性的名称、数值、图片与显隐状态
- 在画布中实时预览属性气泡图
- 提供基础布局、主题颜色、背景和画布比例设置
- 保留精简的视觉标题卡：头像、昵称、显隐和预设位置
- 撤销、重做和自动保存
- 导出 PNG
- 导入、导出 ACG DNA Web 自有项目文件
- 适配桌面端和移动端

详细边界见 docs/MVP_SCOPE.md。

## 不包含

- 登录、注册、QQ 登录或任何账号体系
- 云端发布、用户主页、关注、收藏和通知
- 公开图搜索、相似度计算或服务器同步
- 从旧 Android 应用导入项目数据
- 远程图片搜索和第三方内容数据集

## 计划技术栈

- React
- TypeScript
- Vite
- Canvas 2D
- IndexedDB
- Vitest 与 Playwright
- GitHub Actions 与 GitHub Pages

## 素材说明

Android 工程中的 Logo、图标和模板不会自动获得 MPL-2.0 授权。只有确认具备再分发权并记录来源的素材，才会复制到本仓库。详见 THIRD_PARTY_NOTICES.md。

## 开发

前端工程将在下一阶段初始化。届时本节将补充安装、运行、测试和构建命令。

## 许可证

源代码采用 Mozilla Public License 2.0。商标、Logo、截图、字体、模板和其他素材可能采用不同许可，具体以 THIRD_PARTY_NOTICES.md 及素材目录中的说明为准。
