import type { GraphProfileGender } from '../domain/graph'
import {
  getProfileSubTemplate,
  getProfileTemplateAssetUrl,
  resolveProfileLabelSlot,
  type ProfileSubTemplate,
} from '../domain/profileTemplates'

export type ProfileTemplateAssetMap = Readonly<Record<string, HTMLImageElement>>

const cache = new Map<string, Promise<ProfileTemplateAssetMap>>()

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('资料模板素材加载失败'))
    image.src = url
  })
}

function avatarFrameName(
  template: ProfileSubTemplate,
  gender: GraphProfileGender,
): string {
  if (gender === 'male') return template.avatarFrameMale
  if (gender === 'female') return template.avatarFrameFemale
  return template.avatarFrameNone ?? template.avatarFrameFemale
}

function genderIconName(
  template: ProfileSubTemplate,
  gender: GraphProfileGender,
): string | undefined {
  if (gender === 'male') return template.genderIconMale
  if (gender === 'female') return template.genderIconFemale
  return undefined
}

export async function loadProfileTemplateAssets(
  subTemplateId: string | null,
  gender: GraphProfileGender,
): Promise<ProfileTemplateAssetMap> {
  if (!subTemplateId) return {}
  const template = getProfileSubTemplate(subTemplateId)
  if (!template) return {}

  const cacheKey = subTemplateId + ':' + gender
  const cached = cache.get(cacheKey)
  if (cached) return cached

  const loading = (async () => {
    const requested = new Map<string, string>()
    const add = (key: string, assetName: string | undefined) => {
      const url = getProfileTemplateAssetUrl(template, assetName)
      if (url) requested.set(key, url)
    }

    add('headerImage', template.headerImage)
    add('avatarFrame', avatarFrameName(template, gender))
    add('genderIcon', genderIconName(template, gender))
    template.labelSlots.forEach((rawSlot) => {
      const slot = resolveProfileLabelSlot(template, rawSlot)
      add('labelBg_' + rawSlot.type, slot.backgroundImage)
    })
    add('textBlockBg', template.textSlots[0]?.backgroundImage)

    const entries = await Promise.all(
      [...requested.entries()].map(async ([key, url]) => {
        try {
          return [key, await loadImage(url)] as const
        } catch {
          return null
        }
      }),
    )
    return Object.fromEntries(
      entries.filter((entry) => entry !== null),
    ) as ProfileTemplateAssetMap
  })()
  cache.set(cacheKey, loading)
  void loading.catch(() => cache.delete(cacheKey))
  return loading
}
