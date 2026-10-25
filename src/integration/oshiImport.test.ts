import { describe, expect, it } from 'vitest'

import {
  isAllowedOshiOrigin,
  isOshiImportRequest,
  OSHI_CHARACTERS,
  oshiImageFile,
  parseOshiMessage,
} from './oshiImport'

const png = 'iVBORw0KGgo='

describe('推日联动', () => {
  it('只认 ?import=oshi-calendar 和本机推日地址', () => {
    expect(isOshiImportRequest('?import=oshi-calendar')).toBe(true)
    expect(isOshiImportRequest('?import=other')).toBe(false)
    expect(isAllowedOshiOrigin('http://127.0.0.1:36524')).toBe(true)
    expect(isAllowedOshiOrigin('http://localhost:36524')).toBe(true)
    expect(isAllowedOshiOrigin('http://127.0.0.1:4173')).toBe(false)
    expect(isAllowedOshiOrigin('https://evil.example')).toBe(false)
  })

  it('校验消息：去掉空名和重名，限制作品数，只收 data URL 头像', () => {
    const parsed = parseOshiMessage({
      type: OSHI_CHARACTERS,
      version: 1,
      characters: [
        {
          name: ' 洛琪希 ',
          works: ['无职转生', 3],
          image: `data:image/png;base64,${png}`,
        },
        { name: '洛琪希', works: [] },
        { name: '', works: [] },
        { name: '远程图', image: 'https://example.com/a.png' },
        'bad',
      ],
    })
    expect(parsed).toEqual([
      {
        name: '洛琪希',
        works: ['无职转生'],
        image: { mimeType: 'image/png', base64: png },
      },
      { name: '远程图', works: [] },
    ])
    expect(
      parseOshiMessage({ type: 'other', version: 1, characters: [] }),
    ).toBeNull()
    expect(
      parseOshiMessage({ type: OSHI_CHARACTERS, version: 2, characters: [] }),
    ).toBeNull()
  })

  it('头像转成可直接载入的图片文件', () => {
    const file = oshiImageFile({
      name: '洛琪希',
      works: [],
      image: { mimeType: 'image/png', base64: png },
    })
    expect(file?.type).toBe('image/png')
    expect(file?.name).toBe('洛琪希.png')
    expect(file?.size).toBe(8)
  })
})
