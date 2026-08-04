# 在线图片与版权说明

## 工作方式

ACG DNA Web 使用 Bangumi 作为主要搜索来源，并以 AniList 作为角色和动画的补充来源。搜索仅在用户主动提交关键词后发生：

1. Bangumi 返回角色、动画、游戏或歌手的公开候选信息。
2. 用户选择角色或动画候选后，编辑器可按其原名请求 AniList 图片候选。
3. 用户确认图片后，浏览器以 CORS 请求下载图片 Blob。
4. 图片与裁切、缩放、位置等参数保存到用户当前浏览器的 IndexedDB。
5. Canvas 预览和 PNG 导出绘制本地 Blob，而非长期使用第三方热链。

角色支持按作品查找：先搜索并选择动画、游戏或书籍作品，再显示该作品的角色。游戏候选优先显示英文小字，歌手候选优先显示日文小字。

## 搜索体验

- 输入一个或更多字符即可搜索。
- Bangumi 结果按原图比例瀑布流显示，角色和歌手缩略图顶部聚焦，动画和游戏封面居中显示。
- 首批显示 6 张，滚动接近底部时继续加载后续候选。
- 结果优先显示可用中文名；角色显示关联原作名。
- 搜索和图片候选在当前页面会话内恢复，关闭或刷新页面后清除这层界面缓存。
- 同一节点重新打开图片调整窗口时，会保留已确认的 Bangumi 原图和 AniList 候选上下文。

## 版权与用户责任

Bangumi 和 AniList 可访问不代表其图片获得再许可。图片、封面、角色形象及相关素材的权利仍归各自权利人。ACG DNA Web 不提供这些资源可商用、可再分发或适合特定用途的保证。

用户应在确认拥有使用与导出权利后，再选择图片、制作或发布成品。仓库、模板与演示内容不应内置从 Bangumi 或 AniList 下载的第三方图片；编辑器不提供公共图片托管、公开图库或批量下载能力。

## 相关资料

- [Bangumi API](https://bangumi.github.io/api/)
- [Bangumi User-Agent 建议](https://github.com/bangumi/api/blob/master/docs-raw/user%20agent.md)
- [AniList GraphQL](https://docs.anilist.co/guide/graphql/)
- [AniList 使用条款](https://docs.anilist.co/guide/terms-of-use)
- [AniList 限流](https://docs.anilist.co/guide/rate-limiting)
