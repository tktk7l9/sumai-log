/**
 * 業者の SNS / 公式サイト URL からプラットフォームを判定する純粋関数群。
 */

export const SOCIAL_PLATFORMS = [
  'instagram',
  'x',
  'youtube',
  'facebook',
  'tiktok',
  'line',
  'threads',
  'note',
  'other',
] as const
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number]
export const PLATFORM_LABEL: Record<SocialPlatform, string> = {
  instagram: 'Instagram',
  x: 'X',
  youtube: 'YouTube',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  line: 'LINE',
  threads: 'Threads',
  note: 'note',
  other: 'リンク',
}
const HOSTS: [RegExp, SocialPlatform][] = [
  [/(^|\.)instagram\.com$/, 'instagram'],
  [/(^|\.)(x|twitter)\.com$/, 'x'],
  [/(^|\.)(youtube\.com|youtu\.be)$/, 'youtube'],
  [/(^|\.)(facebook|fb)\.com$/, 'facebook'],
  [/(^|\.)tiktok\.com$/, 'tiktok'],
  [/(^|\.)(line\.me|lin\.ee)$/, 'line'],
  [/(^|\.)threads\.net$/, 'threads'],
  [/(^|\.)note\.com$/, 'note'],
]
export function detectPlatform(url: string): SocialPlatform {
  let host: string
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return 'other'
  }
  for (const [re, platform] of HOSTS) if (re.test(host)) return platform
  return 'other'
}
export function normalizeSocialUrls(list: readonly string[]): string[] {
  const seen = new Set<string>()
  for (const raw of list) {
    const v = raw.trim()
    if (!/^https?:\/\//i.test(v)) continue
    if (!seen.has(v)) seen.add(v)
    if (seen.size >= 10) break
  }
  return [...seen]
}
