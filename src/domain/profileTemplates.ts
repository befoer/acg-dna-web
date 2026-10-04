import cuteAvatarFemale from '../assets/profile-templates/cute-pink/avatar_frame_female.png'
import cuteAvatarMale from '../assets/profile-templates/cute-pink/avatar_frame_male.png'
import cuteAvatarNone from '../assets/profile-templates/cute-pink/avatar_frame_none.png'
import cuteConfigJson from '../assets/profile-templates/cute-pink/config.json'
import cuteHeader from '../assets/profile-templates/cute-pink/header_title.png'
import cuteLabelBackground from '../assets/profile-templates/cute-pink/label_bg.png'
import cuteNicknameDecoration from '../assets/profile-templates/cute-pink/nickname_deco.png'
import cutePreview1 from '../assets/profile-templates/cute-pink/preview_cute_pink_1.webp'
import cutePreview2 from '../assets/profile-templates/cute-pink/preview_cute_pink_2.webp'
import cutePreview3 from '../assets/profile-templates/cute-pink/preview_cute_pink_3.webp'
import cuteTextBackground from '../assets/profile-templates/cute-pink/text_bg.png'
import endfieldConfigJson from '../assets/profile-templates/endfield/config.json'
import endfieldGenderFemale from '../assets/profile-templates/endfield/女.png'
import endfieldGenderMale from '../assets/profile-templates/endfield/男.png'
import endfieldAvatarFrame from '../assets/profile-templates/endfield/头像.png'
import endfieldNicknameBackground from '../assets/profile-templates/endfield/name.png'
import endfieldPreview1 from '../assets/profile-templates/endfield/preview_endfield_1.jpg'
import endfieldPreview2 from '../assets/profile-templates/endfield/preview_endfield_2.jpg'
import endfieldTextBackground from '../assets/profile-templates/endfield/textbg.png'
import endfieldLabelBackground from '../assets/profile-templates/endfield/标签.png'
import type { GraphTemplateId } from './graph'

export type GraphProfileSubTemplateId =
  'cute_pink_1' | 'cute_pink_2' | 'cute_pink_3' | 'endfield_1' | 'endfield_2'

export interface ProfileCommonLabelStyle {
  backgroundImage?: string
  bgScale?: number
  bgOffsetX?: number
  bgOffsetY?: number
  textColor?: string
  fontSize?: number
  fontWeight?: number
  textOffsetX?: number
  textOffsetY?: number
  rotation?: number
  strokeColor?: string
  strokeWidth?: number
  stroke2Color?: string
  stroke2Width?: number
  fontFamily?: string
  shadowDistance?: number
  shadowColor?: string
  shadowAlpha?: number
  shadowExpand?: number
}

export interface ProfileLabelSlot extends ProfileCommonLabelStyle {
  type: string
  x: number
  y: number
  zeroLabelX?: number
  zeroLabelY?: number
  bgAnchor?: string
  textAlign?: string
  shrinkAfterChars?: number
  followBoundsSource?: string
  prefix?: string
  useCommonStyle?: boolean
}

export interface ProfileTextSlot {
  id: string
  x: number
  y: number
  width: number
  height: number
  backgroundImage?: string
  bgOffsetX?: number
  bgOffsetY?: number
  bgScale?: number
  textColor?: string
  fontSize?: number
  fontWeight?: number
  fontFamily?: string
  lineHeight?: number
  maxLines?: number
  textPaddingX?: number
  textMaxWidth?: number
  rotation?: number
}

export interface ProfileSubTemplate {
  id: GraphProfileSubTemplateId
  name: string
  parentTemplateId: string
  previewImage?: string
  headerImage?: string
  headerImageScale?: number
  headerImageOffsetX?: number
  headerImageOffsetY?: number
  globalRotation?: number
  avatarFrameMale: string
  avatarFrameFemale: string
  avatarFrameNone?: string
  avatarX?: number
  avatarY?: number
  zeroLabelAvatarX?: number
  zeroLabelAvatarY?: number
  avatarSize?: number
  avatarFrameOffsetX?: number
  avatarFrameOffsetY?: number
  avatarFrameScale?: number
  avatarFrameDrawOrder?: 'above' | 'below'
  avatarShape?: 'circle' | 'square'
  genderIconMale?: string
  genderIconFemale?: string
  genderIconX?: number
  genderIconY?: number
  genderIconSize?: number
  genderIconFollows?: string
  commonLabelStyle?: ProfileCommonLabelStyle
  labelSlots: ProfileLabelSlot[]
  textSlots: ProfileTextSlot[]
}

interface ProfileTemplateConfigFile {
  templates: ProfileSubTemplate[]
}

const cuteConfig = cuteConfigJson as unknown as ProfileTemplateConfigFile
const endfieldConfig =
  endfieldConfigJson as unknown as ProfileTemplateConfigFile

const previewUrls: Record<GraphProfileSubTemplateId, string> = {
  cute_pink_1: cutePreview1,
  cute_pink_2: cutePreview2,
  cute_pink_3: cutePreview3,
  endfield_1: endfieldPreview1,
  endfield_2: endfieldPreview2,
}

const assetUrls: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  cute_pink: {
    'avatar_frame_female.png': cuteAvatarFemale,
    'avatar_frame_male.png': cuteAvatarMale,
    'avatar_frame_none.png': cuteAvatarNone,
    'header_title.png': cuteHeader,
    'label_bg.png': cuteLabelBackground,
    'nickname_deco.png': cuteNicknameDecoration,
    'text_bg.png': cuteTextBackground,
  },
  Endfield: {
    'name.png': endfieldNicknameBackground,
    'textbg.png': endfieldTextBackground,
    '头像.png': endfieldAvatarFrame,
    '男.png': endfieldGenderMale,
    '女.png': endfieldGenderFemale,
    '标签.png': endfieldLabelBackground,
  },
}

export const PROFILE_SUB_TEMPLATES: readonly ProfileSubTemplate[] = [
  ...cuteConfig.templates,
  ...endfieldConfig.templates,
]

export function getProfileSubTemplates(
  templateId: GraphTemplateId,
): readonly ProfileSubTemplate[] {
  const parentId = templateId === 'cute-pink' ? 'cute_pink' : 'Endfield'
  if (templateId === 'custom') return []
  return PROFILE_SUB_TEMPLATES.filter(
    (template) => template.parentTemplateId === parentId,
  )
}

export function getProfileSubTemplate(
  subTemplateId: string,
): ProfileSubTemplate | undefined {
  return PROFILE_SUB_TEMPLATES.find((template) => template.id === subTemplateId)
}

export function getDefaultProfileSubTemplateId(
  templateId: GraphTemplateId,
): GraphProfileSubTemplateId | null {
  if (templateId === 'cute-pink') return 'cute_pink_2'
  if (templateId === 'endfield') return 'endfield_2'
  return null
}

export function getProfileTemplatePreviewUrl(
  subTemplateId: GraphProfileSubTemplateId,
): string {
  return previewUrls[subTemplateId]
}

export function getProfileTemplateAssetUrl(
  template: ProfileSubTemplate,
  assetName: string | undefined,
): string | undefined {
  if (!assetName) return undefined
  return assetUrls[template.parentTemplateId]?.[assetName]
}

export function isNicknameProfileSlot(type: string): boolean {
  return ['nickname', 'name', '昵称'].includes(type.toLowerCase())
}

export function resolveProfileLabelSlot(
  template: ProfileSubTemplate,
  slot: ProfileLabelSlot,
): ProfileLabelSlot {
  if (!slot.useCommonStyle || !template.commonLabelStyle) return slot
  return {
    ...template.commonLabelStyle,
    ...slot,
    backgroundImage:
      slot.backgroundImage ?? template.commonLabelStyle.backgroundImage,
  }
}

export function maxProfileLabelCount(template: ProfileSubTemplate): number {
  return template.labelSlots.filter((slot) => !isNicknameProfileSlot(slot.type))
    .length
}
