export interface BrowserStorageEstimate {
  usage: number
}

export async function readBrowserStorageEstimate(): Promise<BrowserStorageEstimate | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
    return null
  }
  const estimate = await navigator.storage.estimate()
  const usage = Math.max(0, estimate.usage ?? 0)
  return { usage }
}

export function formatStorageBytes(bytes: number): string {
  const value = Math.max(0, bytes)
  if (value < 1024) return Math.round(value) + ' B'
  const units = ['KB', 'MB', 'GB', 'TB']
  let size = value / 1024
  let unit = units[0]!
  for (let index = 1; index < units.length && size >= 1024; index += 1) {
    size /= 1024
    unit = units[index]!
  }
  const digits = size >= 100 ? 0 : size >= 10 ? 1 : 2
  return Number(size.toFixed(digits)).toString() + ' ' + unit
}
