import { describe, expect, it } from 'vitest'

import type { GraphCategory } from '../domain/graph'
import type { LocalImageAsset } from '../editor/assets'
import { bangumiCharacterId, oshiSendPayload } from './oshiSend'

const asset = (patch: Partial<LocalImageAsset>): LocalImageAsset =>
  ({
    id: 'a',
    fileName: 'a.png',
    mimeType: 'image/png',
    byteLength: 3,
    blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
    objectUrl: '',
    image: {} as HTMLImageElement,
    ...patch,
  }) as LocalImageAsset

describe('发送到推日', () => {
  it('Bangumi 角色图片带上角色编号，作品类图片不带', () => {
    const source = {
      provider: 'bangumi' as const,
      externalId: '46465',
      sourceUrl: 'https://bgm.tv/character/46465',
      originalUrl: 'https://lain.bgm.tv/a.jpg',
      fetchedAt: '',
    }
    expect(bangumiCharacterId(asset({ source }))).toBe(46465)
    expect(
      bangumiCharacterId(
        asset({
          source: {
            ...source,
            searchSeed: { kind: 'anime' } as never,
          },
        }),
      ),
    ).toBeUndefined()
    expect(bangumiCharacterId(asset({}))).toBeUndefined()
  })

  it('按分类生成角色列表：本地图转 data URL，Bangumi 图只发链接，空名和重名跳过', async () => {
    const category = {
      id: 'c',
      name: '角色',
      attributes: [
        { id: '1', name: '本地', imageAssetId: 'local', children: [] },
        { id: '2', name: '远程', imageAssetId: 'remote', children: [] },
        { id: '3', name: '本地', children: [] },
        { id: '4', name: ' ', children: [] },
      ],
    } as unknown as GraphCategory
    const payload = await oshiSendPayload(category, {
      local: asset({ id: 'local' }),
      remote: asset({
        id: 'remote',
        byteLength: 0,
        remoteUrl: 'https://lain.bgm.tv/pic/crt/l/a.jpg',
        source: {
          provider: 'bangumi',
          externalId: '7',
          sourceUrl: '',
          originalUrl: '',
          fetchedAt: '',
        },
      }),
    })
    expect(payload.type).toBe('acg-dna:characters')
    expect(payload.characters).toEqual([
      { name: '本地', image: 'data:image/png;base64,AQID' },
      {
        name: '远程',
        imageUrl: 'https://lain.bgm.tv/pic/crt/l/a.jpg',
        bangumiId: 7,
      },
    ])
  })
})
