# 第三方素材与许可记录

## 当前状态

项目作者已确认 ACG DNA Logo、编辑器图标、效果截图、Cute Pink 和 Endfield 模板图形为本人制作并可公开。当前仓库仅内置采用 OFL 1.1 的资源圆体。

QQ SDK、账号相关素材、数据库备份和服务器端文件不会进入本仓库。

## 迁移规则

从原 Android 工程复制任何 Logo、图标、模板、字体、截图或示例图片前，必须记录：

- 文件路径
- 作者或权利人
- 原始来源
- 适用许可证
- 是否允许修改和再分发
- 是否需要署名

MPL-2.0 主要覆盖本仓库源代码，不会自动授予第三方素材、商标或 Logo 的使用权。

## 已确认来源

- ACG DNA 项目 Logo 与文字标识：项目作者制作
- 编辑器功能图标：项目作者制作
- 默认模板、Cute Pink、Endfield 模板图形：项目作者制作
- APP 与 PC 效果截图：项目作者制作；公开前仍需单独核查截图中嵌入的角色图、封面等内容是否允许再分发

## 资源圆体 Bold

- 仓库文件：`src/assets/fonts/resource-han-rounded-bold.woff2`
- 上游项目：Resource Han Rounded
- 上游版本：0.990
- 作者/维护者：CyanoHao；字形项目派生自 Adobe 与 Google 的 Source Han Sans
- 来源：https://github.com/CyanoHao/Resource-Han-Rounded
- 许可证：SIL Open Font License 1.1
- 许可证副本：`licenses/Resource-Han-Rounded-OFL-1.1.txt`
- 处理：由项目参考目录中的 Bold TTF 无损转换为 WOFF2；未裁剪字符集

OFL 允许随软件分发及转换字体，但分发时仍需保留许可证与版权说明。该字体只在用户选择后由浏览器加载。

## 用户本地字体

用户主动选择的 TTF、OTF、WOFF 或 WOFF2 只保存在其浏览器的独立 IndexedDB 字体库，不上传、不提交到仓库，也不嵌入 `.acgdna.json` 项目文件。用户应自行确认其所选字体的使用与导出权限。

## Bangumi 数据

本地 Bangumi 派生词典应按照原始数据来源补充署名和许可证。旧 APP 的许可说明记录其为 CC BY-SA 3.0；公开前必须再次核对上游说明，并在数据目录保留来源、生成日期和许可副本。

Bangumi API 文档：https://bangumi.github.io/api/

## AniList API

本项目使用 AniList GraphQL API 做按需的角色头像和动画封面候选搜索，不进行批量抓取或数据囤积。图片只在用户明确选择后下载到其浏览器本地；必须遵守 AniList 使用条款和限流要求。

- 使用条款：https://docs.anilist.co/guide/terms-of-use
- 限流说明：https://docs.anilist.co/guide/rate-limiting

## 待补齐

- 为原创图形和模板确定单独的素材许可证
- 为 Bangumi 派生数据补齐可复现的来源和生成信息

当前版本不内置 Bangumi 派生词典；相关来源和 CC BY-SA 说明在未来实际引入数据前补齐。
