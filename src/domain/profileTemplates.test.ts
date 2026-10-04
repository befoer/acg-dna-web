import { describe, expect, it } from 'vitest'

import {
  getDefaultProfileSubTemplateId,
  getProfileSubTemplate,
  getProfileSubTemplates,
  getProfileTemplateAssetUrl,
  getProfileTemplatePreviewUrl,
  maxProfileLabelCount,
  resolveProfileLabelSlot,
} from './profileTemplates'

describe('APP profile sub-templates', () => {
  it('exposes all five author templates under their outer canvas template', () => {
    expect(getProfileSubTemplates('cute-pink').map((item) => item.id)).toEqual([
      'cute_pink_1',
      'cute_pink_2',
      'cute_pink_3',
    ])
    expect(getProfileSubTemplates('endfield').map((item) => item.id)).toEqual([
      'endfield_1',
      'endfield_2',
    ])
    expect(getProfileSubTemplates('custom')).toEqual([])
    expect(getDefaultProfileSubTemplateId('cute-pink')).toBe('cute_pink_2')
    expect(getDefaultProfileSubTemplateId('endfield')).toBe('endfield_2')
  })

  it('inherits the APP common label style and resolves bundled assets', () => {
    const template = getProfileSubTemplate('cute_pink_1')
    expect(template).toBeDefined()
    if (!template) return
    const label = resolveProfileLabelSlot(template, template.labelSlots[1]!)

    expect(label).toMatchObject({
      backgroundImage: 'label_bg.png',
      bgScale: 0.7,
      textColor: '#FFFFFF',
      fontFamily: '资源圆体 Bold',
    })
    expect(getProfileTemplateAssetUrl(template, label.backgroundImage)).toMatch(
      /label_bg/,
    )
    expect(getProfileTemplatePreviewUrl(template.id)).toMatch(
      /preview_cute_pink_1/,
    )
  })

  it('keeps the original per-template label capacities', () => {
    expect(maxProfileLabelCount(getProfileSubTemplate('cute_pink_1')!)).toBe(4)
    expect(maxProfileLabelCount(getProfileSubTemplate('cute_pink_3')!)).toBe(0)
    expect(maxProfileLabelCount(getProfileSubTemplate('endfield_2')!)).toBe(4)
  })
})
