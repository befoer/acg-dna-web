export function normalizeHexColor(value: string): string | null {
  const match = value.trim().match(/^#?([\da-f]{3}|[\da-f]{6})$/i)
  if (!match) return null

  const hexadecimal = match[1]!
  const expanded =
    hexadecimal.length === 3
      ? hexadecimal
          .split('')
          .map((character) => character + character)
          .join('')
      : hexadecimal
  return '#' + expanded.toLowerCase()
}
