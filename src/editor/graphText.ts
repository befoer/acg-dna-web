import {
  createAttribute,
  createCategory,
  createSubAttribute,
  type GraphCategory,
  type GraphDocument,
} from '../domain/graph'

export class GraphTextError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GraphTextError'
  }
}

function labelWithValue(name: string, value: number): string {
  return name + '  ' + Math.round(value)
}

export function exportGraphStructureText(document: GraphDocument): string {
  const lines = [document.name.trim() || '未命名属性图']
  document.categories.forEach((category, categoryIndex) => {
    const lastCategory = categoryIndex === document.categories.length - 1
    lines.push(
      (lastCategory ? '└─' : '├─') +
        labelWithValue(category.name, category.value),
    )
    const attributes = [...category.attributes].sort(
      (left, right) => right.value - left.value,
    )
    attributes.forEach((attribute, attributeIndex) => {
      const lastAttribute = attributeIndex === attributes.length - 1
      const categoryPrefix = lastCategory ? '   ' : '│  '
      lines.push(
        categoryPrefix +
          (lastAttribute ? '└─ ' : '├─ ') +
          labelWithValue(attribute.name, attribute.value),
      )
      const children = [...attribute.children].sort(
        (left, right) => right.value - left.value,
      )
      children.forEach((child, childIndex) => {
        const attributePrefix = lastAttribute ? '   ' : '│  '
        lines.push(
          categoryPrefix +
            attributePrefix +
            (childIndex === children.length - 1 ? '└─ ' : '├─ ') +
            labelWithValue(child.name, child.value),
        )
      })
    })
  })
  return lines.join('\n')
}

export function exportGraphLabelText(document: GraphDocument): string {
  return document.categories
    .flatMap((category, categoryIndex) => {
      const lines = [...category.attributes]
        .sort((left, right) => right.value - left.value)
        .flatMap((attribute) => [
          attribute.name,
          ...[...attribute.children]
            .sort((left, right) => right.value - left.value)
            .map((child) => '  ' + child.name),
        ])
      return categoryIndex < document.categories.length - 1 && lines.length > 0
        ? [...lines, '']
        : lines
    })
    .join('\n')
    .trimEnd()
}

function parseNameAndValue(
  content: string,
  fallbackValue: number,
): { name: string; value: number } {
  const match = content.trim().match(/^(.*?)\s{2,}(\d{1,4})$/)
  const name = (match?.[1] ?? content).trim().slice(0, 40)
  if (!name) throw new GraphTextError('存在空名称，请检查输入内容')
  const parsedValue = match ? Number(match[2]) : fallbackValue
  return {
    name,
    value: Math.max(1, Math.min(100, parsedValue)),
  }
}

interface ParsedLine {
  level: 0 | 1 | 2
  content: string
}

function parseLine(line: string): ParsedLine | null {
  const tree = line.match(/^((?:│ {2}| {3})*)(?:├─|└─)\s*(.+)$/)
  if (tree) {
    const level = Math.min(2, Math.floor((tree[1]?.length ?? 0) / 3))
    return { level: level as 0 | 1 | 2, content: tree[2] ?? '' }
  }
  const named = line.match(/^(\s*)(分类|属性|子属性)\s*[：:]\s*(.+)$/)
  if (named) {
    const kindLevel = named[2] === '分类' ? 0 : named[2] === '属性' ? 1 : 2
    return { level: kindLevel, content: named[3] ?? '' }
  }
  const heading = line.match(/^\s*#{1,2}\s+(.+)$/)
  if (heading) return { level: 0, content: heading[1] ?? '' }
  const bullet = line.match(/^(\s*)[-*]\s+(.+)$/)
  if (bullet) {
    const spaces = (bullet[1] ?? '').replaceAll('\t', '  ').length
    return {
      level: Math.min(2, Math.floor(spaces / 2) + 1) as 0 | 1 | 2,
      content: bullet[2] ?? '',
    }
  }
  return null
}

export function parseGraphStructureText(text: string): GraphCategory[] {
  if (text.length > 1_000_000) {
    throw new GraphTextError('文本不能超过 1 MB')
  }
  const categories: GraphCategory[] = []
  let currentCategory: GraphCategory | undefined
  let currentAttribute: ReturnType<typeof createAttribute> | undefined
  let ignoredTitle = false

  for (const [index, rawLine] of text
    .replaceAll('\r\n', '\n')
    .split('\n')
    .entries()) {
    const line = rawLine.trimEnd()
    if (!line.trim()) continue
    const parsed = parseLine(line)
    if (!parsed) {
      if (!ignoredTitle && categories.length === 0) {
        ignoredTitle = true
        continue
      }
      throw new GraphTextError('第 ' + (index + 1) + ' 行无法识别：' + line)
    }
    if (parsed.level === 0) {
      const value = parseNameAndValue(parsed.content, 60)
      currentCategory = {
        ...createCategory(categories.length),
        ...value,
        attributes: [],
      }
      categories.push(currentCategory)
      currentAttribute = undefined
    } else if (parsed.level === 1) {
      if (!currentCategory) {
        throw new GraphTextError('第 ' + (index + 1) + ' 行属性缺少所属分类')
      }
      const value = parseNameAndValue(parsed.content, 60)
      currentAttribute = {
        ...createAttribute(),
        ...value,
        children: [],
      }
      currentCategory.attributes.push(currentAttribute)
    } else {
      if (!currentAttribute) {
        throw new GraphTextError('第 ' + (index + 1) + ' 行子属性缺少所属属性')
      }
      const value = parseNameAndValue(parsed.content, 50)
      currentAttribute.children.push({ ...createSubAttribute(), ...value })
    }
    if (categories.length > 100) {
      throw new GraphTextError('一次最多导入 100 个分类')
    }
    const nodeCount = categories.reduce(
      (count, category) =>
        count +
        1 +
        category.attributes.reduce(
          (inner, attribute) => inner + 1 + attribute.children.length,
          0,
        ),
      0,
    )
    if (nodeCount > 2000) {
      throw new GraphTextError('一次最多导入 2000 个节点')
    }
  }
  if (categories.length === 0) {
    throw new GraphTextError('没有识别到分类，请按示例输入三级结构')
  }
  return categories
}

export function summarizeGraphCategories(categories: GraphCategory[]): {
  categories: number
  attributes: number
  children: number
} {
  return {
    categories: categories.length,
    attributes: categories.reduce(
      (count, category) => count + category.attributes.length,
      0,
    ),
    children: categories.reduce(
      (count, category) =>
        count +
        category.attributes.reduce(
          (inner, attribute) => inner + attribute.children.length,
          0,
        ),
      0,
    ),
  }
}
