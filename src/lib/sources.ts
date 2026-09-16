/**
 * 情報収集ページ（/sources）の純粋関数: ジャンル別のグルーピング、YouTube チャンネル
 * URL の解析、アバター URL の許可判定。実際の fetch は src/server/sourcesFetcher.ts。
 */

import { SOURCE_GENRES, type SourceGenre } from '../content/sourceGenres'

/** ジャンルごとに束ねる。SOURCE_GENRES の並び順のまま、0 件のジャンルは含めない。
 * 各ジャンル内は sortOrder 昇順（同じなら name の辞書順）に並べる。 */
export function groupSourcesByGenre<T extends { genre: string; sortOrder: number; name: string }>(
  sources: readonly T[],
): { genre: SourceGenre; items: T[] }[] {
  return SOURCE_GENRES.map((genre) => ({
    genre,
    items: sources
      .filter((s) => s.genre === genre.id)
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'ja')),
  })).filter((g) => g.items.length > 0)
}

/** チャンネル URL から取り出せる識別子。どちらか一方だけを持つ（両方は無い） */
export type YoutubeChannelRef = { handle: string } | { channelId: string }

/** チャンネル URL を受け付けるホスト。youtu.be は動画専用の短縮ドメインで
 * チャンネルを指せないため、意図的に含めない（src/lib/youtube.ts の YOUTUBE_HOSTS とは別物） */
const CHANNEL_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
])

/** 実際の YouTube チャンネル ID は 'UC' + 22 文字（計 24 文字）だが、多少緩めに受ける */
const CHANNEL_ID_PATTERN = /^UC[\w-]{10,32}$/

/**
 * YouTube チャンネルの URL からハンドル（'@…'）かチャンネル ID（'UC…'）を取り出す。
 * 対応する形: `/@handle`・`/channel/UC…`・`/c/カスタムURL`・`/user/レガシーユーザー名`。
 * `/c/`・`/user/` はチャンネル ID を持たないため、パスのその 1 セグメントをそのまま
 * handle として返す（実際の `@handle` と一致する保証は無いが、フォームの初期値・
 * resolveSource の対象判定としては十分）。対応外の形・URL として読めない・
 * youtu.be を含め対応外ホストは null。
 */
export function parseYoutubeChannelUrl(url: string): YoutubeChannelRef | null {
  let parsed: URL
  try {
    parsed = new URL(url.trim())
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null

  const host = parsed.hostname.toLowerCase()
  if (!CHANNEL_HOSTS.has(host)) return null

  const [first, second] = parsed.pathname.split('/').filter(Boolean)
  if (!first) return null

  if (first.startsWith('@') && first.length > 1) return { handle: first }
  if (first === 'channel' && second && CHANNEL_ID_PATTERN.test(second)) {
    return { channelId: second }
  }
  if ((first === 'c' || first === 'user') && second) return { handle: second }
  return null
}

/** チャンネルアバターとして表示してよい URL か（https + ホスト許可リスト）。
 * i.ytimg.com は動画サムネと共有だが、チャンネルアイコン（`/vi/.../hqdefault.jpg` 以外の
 * パス）を返すページもあるため許可リストに含める。 */
const AVATAR_HOSTS = new Set(['yt3.ggpht.com', 'yt3.googleusercontent.com', 'i.ytimg.com'])

export function isAllowedAvatarUrl(url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  return parsed.protocol === 'https:' && AVATAR_HOSTS.has(parsed.hostname.toLowerCase())
}
