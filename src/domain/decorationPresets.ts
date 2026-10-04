import diaryImageUrl from '../assets/decorations/diary.png'
import foxImageUrl from '../assets/decorations/fox.png'
import hosiImageUrl from '../assets/decorations/hosi.png'
import nyaShopImageUrl from '../assets/decorations/nya-shop.png'
import ppImageUrl from '../assets/decorations/pp.png'
import type { GraphDecorationPresetId } from './graph'

export interface DecorationPresetDefinition {
  id: GraphDecorationPresetId
  name: string
  category: 'element' | 'background'
  imageUrl: string
  placement: 'above-data' | 'below-data'
}

export const DECORATION_PRESETS: readonly DecorationPresetDefinition[] = [
  {
    id: 'diary',
    name: '日记装饰',
    category: 'element',
    imageUrl: diaryImageUrl,
    placement: 'above-data',
  },
  {
    id: 'fox',
    name: 'FOX',
    category: 'background',
    imageUrl: foxImageUrl,
    placement: 'above-data',
  },
  {
    id: 'hosi',
    name: 'hosi',
    category: 'background',
    imageUrl: hosiImageUrl,
    placement: 'above-data',
  },
  {
    id: 'nya-shop',
    name: '喵铺',
    category: 'background',
    imageUrl: nyaShopImageUrl,
    placement: 'below-data',
  },
  {
    id: 'pp',
    name: 'PP',
    category: 'background',
    imageUrl: ppImageUrl,
    placement: 'below-data',
  },
]

export function getDecorationPreset(
  id: GraphDecorationPresetId,
): DecorationPresetDefinition {
  return DECORATION_PRESETS.find((preset) => preset.id === id)!
}
