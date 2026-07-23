# 在线图片搜索方案

## 当前结论

在线搜索采用 Bangumi 主搜索、AniList 备用和候选补充的双提供方流程。默认通过作者控制的受限无状态网关 `https://bangumi-api.acg-dna.top` 访问 Bangumi；用户可以手动切换 AniList，或使用 Bangumi 返回的日文原名重搜。用户确认 Bangumi 结果后，图片调整窗口使用该结果的日文原名加载 AniList 候选，同时保留 Bangumi 原图供切换，不把 Bangumi 第一条结果在未确认时自动选为最终图片。Canvas 不长期依赖第三方热链。

可通过 `VITE_BANGUMI_GATEWAY_URL` 替换网关部署地址。仅在调试 CORS 或网络环境时，可显式设置 `VITE_BANGUMI_SEARCH_MODE=direct` 让浏览器直连 Bangumi 文字 API；此模式不读取 Bangumi 图片，不是正式默认路径。AniList 继续由浏览器直接调用。

## 选择依据

2026-07-15 实测：

- Bangumi API 返回 Access-Control-Allow-Origin: *，浏览器可直接调用。
- Bangumi 图片 CDN lain.bgm.tv 的图片响应没有 Access-Control-Allow-Origin。图片可以显示在普通 img 中，但画入 Canvas 后会污染画布，导致 PNG 导出失败。
- AniList GraphQL API 返回 Access-Control-Allow-Origin: *。
- AniList 图片 CDN 会为请求来源返回 Access-Control-Allow-Origin，图片可以读取为 Blob 并安全画入 Canvas。
- AniList 官方文档显示常规上限为每分钟 90 次；当前处于降级状态，实际响应头和文档均显示每分钟 30 次。

## AniList 头像候选实现

- Endpoint：https://graphql.anilist.co
- 使用 POST GraphQL 请求，不需要用户登录或 API 密钥。
- 用户可在 Bangumi 没有合适结果时手动切换 AniList，建议使用日文名或罗马音；确认 Bangumi 候选后，会用其原名加载角色头像或作品封面。
- 头像候选显示在图片调整窗口中，用户可在调整裁切前切换图片。
- 输入至少 1 个字符后请求，支持“白”等单字名称，防抖 500ms。
- 新搜索开始时使用 AbortController 取消旧请求；AniList 请求按 Bangumi 候选名称缓存。
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

## 当前搜索与调整界面

- Bangumi 搜索结果使用适应原图宽高比的瀑布流；角色图片顶部聚焦，动画封面保持居中。AniList 搜索结果保持统一卡片尺寸。
- 结果名称优先使用 Bangumi 可用的中文名或中文别名，无法解析时保留原名；超长名称在卡片内省略，不溢出容器。
- 搜索窗口提供 Bangumi/AniList 切换和“搜日文”提示，底部保留“尝试全名或日文”的示例，不以热门排行伪装成无结果搜索。
- 图片调整窗口使用竖向工作区、半透明遮罩、拖动定位和四角缩放；Bangumi 角色图默认顶部聚焦，AniList 候选默认居中。候选缩略图标明来源，重新打开同一节点时继续显示已保存的候选上下文。

## Bangumi 网关边界

- 搜索词长度限制为 1 至 80 个字符，每次最多返回 18 项。
- 搜索响应除可用图片外还返回最多 8 个 Bangumi 原始名称，供 AniList 日文名称回退。
- 第一阶段只开放角色和动画两类搜索。
- 图片代理只接受 HTTPS 的 lain.bgm.tv/pic/ 路径，最大 15 MB，并校验响应图片类型。
- 网关不接收项目内容、用户画像、账号或设备标识。
- 不把 Bangumi 图片直接作为 Canvas 热链；选中后必须下载为 Blob 并保存到当前本地项目。
- 网关源码随 Web 项目公开，部署地址可通过 VITE_BANGUMI_GATEWAY_URL 替换。
- 当前正式网关域名为 `https://bangumi-api.acg-dna.top`；`workers.dev` 地址只作为 Cloudflare 内部部署入口，不再作为前端默认地址。
- 网关只接受正式站点 `https://acg-dna.com`、`https://www.acg-dna.com` 和本地开发地址的浏览器 Origin；`/health` 可在无 Origin 时检查。非白名单 Origin 返回 403。
- Worker Rate Limiting binding 按客户端 IP 限制：搜索每 10 秒最多 30 次，图片代理每 60 秒最多 120 次；超限分别返回 429 和 `Retry-After`。这不是身份认证，非浏览器脚本仍可能伪造 Origin，因此限速不可省略。
- 限速计数由 Cloudflare 按边缘位置最终一致地执行，适合防滥用而不是精确计费或账号配额。
- Worker 名称为 `acg-dna-bangumi-probe`，`npx wrangler deploy` 只发布该网关，不发布前端站点。发布后至少验证 `/health`、正式 Origin 搜索、非白名单 Origin 403、限流响应和图片 Blob。

## 版权边界

API 可访问不代表图片获得再许可。界面必须显示来源和版权提示；仓库、模板和演示数据不得内置从 Bangumi 或 AniList 下载的第三方图片。用户只有在确认拥有相应权利时才应选择并导出图片。产品不提供第三方图片可商用的保证，也不提供公共作品托管、云同步或批量下载。

## 统一结果模型建议

每个结果至少包含：提供方、外部 ID、显示名称、别名、缩略图 URL、原图 URL、来源页面、资源类型、CORS 可用状态和署名信息。

## 缓存与隐私

- 小规模搜索结果按“提供方 + 类型 + 标准化搜索词”在内存中缓存到当前页面关闭或刷新；最多保留最近使用的 80 条，超过后淘汰最久未使用项。重复打开调整窗口或再次查询相同候选时会优先复用缓存，减少 Bangumi 和 AniList 请求。缓存只保存搜索结果元数据和缩略图地址，不保存第三方图片 Blob。
- 同一属性节点的搜索窗口会在当前页面会话中恢复上次搜索词、搜索类型、结果和状态；完整刷新页面或关闭标签页后会清除这层界面缓存。
- 选中 Bangumi 结果后，其中文名、日文原名、来源和图片地址会作为解析上下文随最终图片资产保存。即使最终改选 AniList 头像，重新打开图片调整窗口仍会同时显示 Bangumi 原图和 AniList 方形头像候选。
- 首次确认搜索结果时，节点名称同步为该结果显示名；在同一调整窗口中从 Bangumi 原图改选 AniList 头像不会改变已经确认的 Bangumi 中文名。角色缩略图和默认裁切顶部聚焦，动画图片保持居中。
- 搜索请求只发送搜索词和 API 所需参数。
- 不发送完整项目、用户画像、属性列表或设备标识。
- 提供清空搜索结果与缩略图缓存的入口；清理本地图片时必须先检查项目引用，只删除未被任何项目引用的 Blob。

## 官方文档

- Bangumi API：https://bangumi.github.io/api/
- Bangumi User-Agent 建议：https://github.com/bangumi/api/blob/master/docs-raw/user%20agent.md
- AniList GraphQL：https://docs.anilist.co/guide/graphql/
- AniList 使用条款：https://docs.anilist.co/guide/terms-of-use
- AniList 限流：https://docs.anilist.co/guide/rate-limiting
