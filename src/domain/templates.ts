import cutePinkBackground from '../assets/templates/cute-pink.webp'
import endfieldBackground from '../assets/templates/endfield.png'
import {
  DEFAULT_CONTENT_BOUNDS,
  type GraphContentBounds,
  type GraphTemplateId,
} from './graph'

export const GRAPH_TEMPLATE_VERSION = 1 as const

export interface GraphTemplateDefinition {
  version: typeof GRAPH_TEMPLATE_VERSION
  id: GraphTemplateId
  name: string
  description: string
  backgroundColor: string
  backgroundImageUrl?: string
  width: number
  height: number
  contentBounds: GraphContentBounds
  showCanvasText: boolean
}

export const GRAPH_TEMPLATES: readonly GraphTemplateDefinition[] = [
  {
    version: GRAPH_TEMPLATE_VERSION,
    id: 'custom',
    name: '自定义',
    description: '标签范围覆盖整张画布的纯色基础版式',
    backgroundColor: '#F6F2EC',
    width: 1380,
    height: 2000,
    contentBounds: { ...DEFAULT_CONTENT_BOUNDS },
    showCanvasText: true,
  },
  {
    version: GRAPH_TEMPLATE_VERSION,
    id: 'cute-pink',
    name: '可爱日记',
    description: '粉色手账背景，标签集中在下方纸张区域',
    backgroundColor: '#FFEBEE',
    backgroundImageUrl: cutePinkBackground,
    width: 1280,
    height: 1847,
    contentBounds: {
      left: 0.074,
      top: 0.253,
      right: 0.944,
      bottom: 0.943,
      rotation: -2,
    },
    showCanvasText: false,
  },
  {
    version: GRAPH_TEMPLATE_VERSION,
    id: 'endfield',
    name: '工业风',
    description: '灰黄工业面板，标签位于主数据显示区域',
    backgroundColor: '#FFF8E1',
    backgroundImageUrl: endfieldBackground,
    width: 1280,
    height: 1847,
    contentBounds: {
      left: 0.062,
      top: 0.19,
      right: 0.937,
      bottom: 0.912,
      rotation: 0,
    },
    showCanvasText: false,
  },
]

export function getGraphTemplate(
  templateId: GraphTemplateId,
): GraphTemplateDefinition {
  return (
    GRAPH_TEMPLATES.find((template) => template.id === templateId) ??
    GRAPH_TEMPLATES[0]!
  )
}
