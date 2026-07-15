# 在线图片搜索方案

## 第一版结论

第一版采用可替换的搜索提供方接口，但优先实现 AniList。Bangumi 用于中文词典、别名、拼音和元数据；暂不直接把 Bangumi CDN 图片写入可导出的 Canvas。

## 选择依据

2026-07-15 实测：

- Bangumi API 返回 Access-Control-Allow-Origin: *，浏览器可直接调用。
- Bangumi 图片 CDN lain.bgm.tv 的图片响应没有 Access-Control-Allow-Origin。图片可以显示在普通 img 中，但画入 Canvas 后会污染画布，导致 PNG 导出失败。
- AniList GraphQL API 返回 Access-Control-Allow-Origin: *。
- AniList 图片 CDN 会为请求来源返回 Access-Control-Allow-Origin，图片可以读取为 Blob 并安全画入 Canvas。
- AniList 官方文档显示常规上限为每分钟 90 次；当前处于降级状态，实际响应头和文档均显示每分钟 30 次。

## AniList 第一版实现

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

禁止把第三方热链 URL 作为项目图片的唯一引用。

## Bangumi 第一版用途

- 使用已保留的本地压缩词典做中文、繁简、拼音和别名匹配。
- 可调用 Bangumi API 补充条目元数据和来源链接。
- 不直接导入 lain.bgm.tv 图片到 Canvas。
- 如果未来 Bangumi CDN 增加稳定 CORS，可重新测试后启用。
- 如仍无 CORS，只能让用户手动下载后上传，或在取得用户授权后单独评估代理；不得悄悄加入第三方 CORS 代理。

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
