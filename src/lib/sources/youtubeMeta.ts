/**
 * YouTube チャンネルページの HTML から og:title / og:description / og:image と、
 * ページ内に埋め込まれた channelId（`"channelId":"UC…"`）を線形の正規表現で抜き出す。
 * design.md の方針どおり外部 HTML パーサは入れない（src/lib/favicon.ts の
 * pickFaviconCandidates と同じ流儀: `<meta>` タグをまるごとマッチさせてから属性を読む）。
 *
 * 実際に fetch するのは src/server/sourcesFetcher.ts。ここは
 * 「HTML 文字列 → メタ情報」だけを担う。
 */

import { decodeEntities, MAX_INPUT_LENGTH, truncate } from '../news/text'

/** description の表示上限。db/schema.ts の sources.description 列のコメントと揃える */
export const DESCRIPTION_MAX = 200

const META_TAG = /<meta\b[^>]*>/gi
const CHANNEL_ID_PATTERN = /"channelId":"(UC[\w-]{10,32})"/

/** `name="value"` / `name='value'` / `name=value` のいずれの書式でも読む（favicon.ts の getAttr と同じ） */
function getAttr(tag: string, name: string): string | null {
  const re = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i')
  const m = re.exec(tag)
  if (!m) return null
  return decodeEntities((m[1] ?? m[2] ?? m[3]) as string)
}

/** `<meta property="og:xxx" content="...">`（`name=` 属性の場合も含む）の content を探す。
 * property/name と content の属性順は問わない。同名タグが複数あれば最初の 1 件を使う。 */
function metaContent(html: string, key: string): string | null {
  for (const match of html.matchAll(META_TAG)) {
    const tag = match[0]
    const tagKey = (getAttr(tag, 'property') ?? getAttr(tag, 'name'))?.toLowerCase()
    if (tagKey !== key) continue
    const content = getAttr(tag, 'content')
    if (content !== null) return content
  }
  return null
}

function trimmedOrNull(value: string | null): string | null {
  if (value === null) return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

export type YoutubeMeta = {
  title: string | null
  description: string | null
  imageUrl: string | null
  channelId: string | null
}

/**
 * html が MAX_INPUT_LENGTH（news/text.ts と同じ上限）を超える場合はすべて null にする
 * （巨大な HTML を舐めない。sourcesFetcher.ts 側の 1MB キャップとは別の、この関数単体の防御）。
 */
export function extractYoutubeMeta(html: string): YoutubeMeta {
  if (html.length > MAX_INPUT_LENGTH) {
    return { title: null, description: null, imageUrl: null, channelId: null }
  }

  const title = trimmedOrNull(metaContent(html, 'og:title'))
  const rawDescription = trimmedOrNull(metaContent(html, 'og:description'))
  const imageUrl = trimmedOrNull(metaContent(html, 'og:image'))
  const channelId = CHANNEL_ID_PATTERN.exec(html)?.[1] ?? null

  return {
    title,
    description: rawDescription === null ? null : truncate(rawDescription, DESCRIPTION_MAX),
    imageUrl,
    channelId,
  }
}
