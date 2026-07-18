# 在线图片搜索方案

## 当前结论

在线搜索采用可替换的提供方接口：Bangumi 为中文名称和图片的主来源，AniList 为浏览器直连备用。默认通过作者控制的受限无状态网关 `https://bangumi-api.acg-dna.top` 访问 Bangumi，图片也经过同源受限端点下载，不让 Canvas 长期依赖第三方热链。等待 5 秒仍未返回时显示 AniList 备用按钮，10 秒仍未返回时自动切换。原始中文查询若得到不匹配的 AniList 热门榜项会被过滤，不作为搜索结果显示。

可通过 `VITE_BANGUMI_GATEWAY_URL` 替换网关部署地址。仅在调试 CORS 或网络环境时，可显式设置 `VITE_BANGUMI_SEARCH_MODE=direct` 让浏览器直连 Bangumi 文字 API；此模式不读取 Bangumi 图片，不是正式默认路径。AniList 继续由浏览器直接调用。

## 选择依据

2026-07-15 实测：

- Bangumi API 返回 Access-Control-Allow-Origin: *，浏览器可直接调用。
- Bangumi 图片 CDN lain.bgm.tv 的图片响应没有 Access-Control-Allow-Origin。图片可以显示在普通 img 中，但画入 Canvas 后会污染画布，导致 PNG 导出失败。
- AniList GraphQL API 返回 Access-Control-Allow-Origin: *。
- AniList 图片 CDN 会为请求来源返回 Access-Control-Allow-Origin，图片可以读取为 Blob 并安全画入 Canvas。
- AniList 官方文档显示常规上限为每分钟 90 次；当前处于降级状态，实际响应头和文档均显示每分钟 30 次。

## AniList 备用实现

- Endpoint：https://graphql.anilist.co
- 使用 POST GraphQL 请求，不需要用户登录或 API 密钥。
- 支持角色图片和作品封面搜索。
- 输入至少 2 个字符后请求，防抖 500ms。
- 新搜索开始时使用 AbortController 取消旧请求。
- 每页最多请求 12 至 20 条结果。
- 读取 X-RateLimit-Limit、X-RateLimit-Remaining、Retry-After 和 X-RateLimit-Reset。
- 遇到 429 时暂停请求并显示剩余等待时间。
- 尽可能过滤成人内容；角色搜索需要结合其关联作品的 isAdult 信息做额外检查。
- 不批量抓取、不把 AniList 当作备份数据库、不预下载完整数据集。

## 图片进入项目的流程

1. API 返回搜索结果和缩略图 URL。
2. 用户明确选择某张图片。
3. 浏览器使用 CORS fetch 下载 Blob。
4. 对图片解码、裁切和压缩。
5. 把 Blob 保存到 IndexedDB，并在项目模型中只保存本地资源 ID、来源 URL、提供方和外部 ID。
6. Canvas 只绘制同源 Blob URL，保证离线重开和 PNG 导出。

图片资产同时记录提供方、外部 ID、来源页面、原始图片地址和获取时间。来源信息随 IndexedDB 自动保存和 .acgdna.json 项目文件保留。

禁止把第三方热链 URL 作为项目图片的唯一引用。

## Bangumi 网关边界

- 搜索词长度限制为 2 至 80 个字符，每次最多返回 18 项。
- 搜索响应除可用图片外还返回最多 8 个 Bangumi 原始名称，供 AniList 日文名称回退。
- 第一阶段只开放角色和动画两类搜索。
- 图片代理只接受 HTTPS 的 lain.bgm.tv/pic/ 路径，最大 15 MB，并校验响应图片类型。
- 网关不接收项目内容、用户画像、账号或设备标识。
- 不把 Bangumi 图片直接作为 Canvas 热链；选中后必须下载为 Blob 并保存到当前本地项目。
- 网关源码随 Web 项目公开，部署地址可通过 VITE_BANGUMI_GATEWAY_URL 替换。
- 当前正式网关域名为 `https://bangumi-api.acg-dna.top`；`workers.dev` 地址只作为 Cloudflare 内部部署入口，不再作为前端默认地址。

## 版权边界

API 可访问不代表图片获得再许可。界面必须显示来源和版权提示；仓库、模板和演示数据不得内置从 Bangumi 或 AniList 下载的第三方图片。用户只有在确认拥有相应权利时才应选择并导出图片。产品不提供第三方图片可商用的保证，也不提供公共作品托管、云同步或批量下载。

## 统一结果模型建议

每个结果至少包含：提供方、外部 ID、显示名称、别名、缩略图 URL、原图 URL、来源页面、资源类型、CORS 可用状态和署名信息。

## 缓存与隐私

- 小规模搜索结果可短期缓存，用户选择的图片长期保存在本地。
- 搜索请求只发送搜索词和 API 所需参数。
- 不发送完整项目、用户画像、属性列表或设备标识。
- 提供清空搜索结果与缩略图缓存的入口；清理本地图片时必须先检查项目引用，只删除未被任何项目引用的 Blob。

## 官方文档

- Bangumi API：https://bangumi.github.io/api/
- Bangumi User-Agent 建议：https://github.com/bangumi/api/blob/master/docs-raw/user%20agent.md
- AniList GraphQL：https://docs.anilist.co/guide/graphql/
- AniList 使用条款：https://docs.anilist.co/guide/terms-of-use
- AniList 限流：https://docs.anilist.co/guide/rate-limiting
