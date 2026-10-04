import type { GraphTemplateId } from '../domain/graph'
import { getGraphTemplate } from '../domain/templates'

const imageCache = new Map<string, Promise<HTMLImageElement>>()

function loadImage(url: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(url)
  if (cached) return cached
  const pending = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('模板背景加载失败'))
    image.src = url
  })
  imageCache.set(url, pending)
  void pending.catch(() => imageCache.delete(url))
  return pending
}

export async function loadTemplateBackground(
  templateId: GraphTemplateId,
): Promise<HTMLImageElement | null> {
  const backgroundUrl = getGraphTemplate(templateId).backgroundImageUrl
  return backgroundUrl ? loadImage(backgroundUrl) : null
}
