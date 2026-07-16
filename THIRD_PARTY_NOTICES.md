# 第三方素材与许可记录

## 当前状态

项目作者已确认 ACG DNA Logo、编辑器图标、效果截图、Cute Pink 和 Endfield 模板图形为本人制作并可公开。字体必须逐套核对：资源圆体是 OFL 开源字体，阿里妈妈方圆体是厂商授权字体，二者不能笼统写成“都是开源字体”。

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

## 阿里妈妈方圆体

- 仓库文件：`src/assets/fonts/alimama-fangyuan-vf.ttf`
- 字体内部版本：1.000（2023）
- 字体内部版权：Copyright (c) 2023 Alibaba (China) Co., Ltd. All rights reserved.
- 字体设计署名：Alibaba Design；Liu Chuan、Hong Liangfen、Han Xiaoming、Chen Yangjian、Gong Wei、Yi Si、Li Mu
- 官方来源：阿里妈妈·智造字 / Iconfont 字体库，https://www.iconfont.cn/
- 许可证性质：厂商免费字体授权，不是 SIL OFL 或其他开源许可证
- 处理：保留官方原始可变 TTF，不转换、不裁剪、不修改字体数据；浏览器只在用户选择后加载

根据阿里妈妈发布的《阿里妈妈方圆体法律声明》，用户可基于合法目的用于商业用途、非商业用途，以及嵌入式使用（Embedded Use）。本项目按嵌入式字体使用场景保留官方原始 TTF，并遵循该字体自身授权；MPL-2.0 不覆盖或改变阿里妈妈方圆体的授权条件。公开仓库时应同时保留本节的来源、版权与独立授权说明。

## 用户本地字体

用户主动选择的 TTF、OTF、WOFF 或 WOFF2 只保存在其浏览器的独立 IndexedDB 字体库，不上传、不提交到仓库，也不嵌入 `.acgdna.json` 项目文件。用户应自行确认其所选字体的使用与导出权限。

## Bangumi 数据

本地 Bangumi 派生词典应按照原始数据来源补充署名和许可证。旧 APP 的许可说明记录其为 CC BY-SA 3.0；公开前必须再次核对上游说明，并在数据目录保留来源、生成日期和许可副本。

Bangumi API 文档：https://bangumi.github.io/api/

## AniList API

本项目计划使用 AniList GraphQL API 做非商业、按需的图片搜索，不进行批量抓取或数据囤积。必须遵守其使用条款和限流要求。

- 使用条款：https://docs.anilist.co/guide/terms-of-use
- 限流说明：https://docs.anilist.co/guide/rate-limiting

## 待补齐

- 为原创图形和模板确定单独的素材许可证
- 公开仓库时保留阿里妈妈方圆体的官方来源、版权和独立授权说明
- 为 Bangumi 派生数据补齐可复现的来源和生成信息
