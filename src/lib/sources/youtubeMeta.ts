/**
 * Extracts og:title / og:description / og:image and the channel's own id from the HTML of a
 * YouTube channel page with linear-time regexes.
 * Following the policy in design.md, no external HTML parser is added (the same style as
 * pickFaviconCandidates in src/lib/favicon.ts: match the whole `<meta>` tag first, then
 * read its attributes).
 *
 * The actual fetch is done by src/server/sourcesFetcher.ts. This file is responsible only
 * for "HTML string -> meta information".
 */

import { decodeEntities, MAX_INPUT_LENGTH, truncate } from '../news/text'

/** Display limit of description. Kept in line with the comment on the sources.description
 * column in db/schema.ts */
export const DESCRIPTION_MAX = 200

const META_TAG = /<meta\b[^>]*>/gi
/**
 * Where the page names its own channel, in order of trust. The bare `"channelId":"UC…"` is not
 * one of them: a channel page also carries the ids of featured and related channels, and the
 * first of those is often not the page's own (a source was saved with another channel's id).
 */
const OWN_CHANNEL_ID_PATTERNS = [
  /<link\b[^>]*\bhref="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{10,32})"/,
  /"externalId":"(UC[\w-]{10,32})"/,
  /<meta\b[^>]*\bitemprop="identifier"[^>]*\bcontent="(UC[\w-]{10,32})"/,
]

function ownChannelId(html: string): string | null {
  for (const pattern of OWN_CHANNEL_ID_PATTERNS) {
    const id = pattern.exec(html)?.[1]
    if (id) return id
  }
  return null
}

/** Reads any of the forms `name="value"` / `name='value'` / `name=value` (the same as
 * getAttr in favicon.ts) */
function getAttr(tag: string, name: string): string | null {
  const re = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i')
  const m = re.exec(tag)
  if (!m) return null
  return decodeEntities((m[1] ?? m[2] ?? m[3]) as string)
}

/** Looks for the content of `<meta property="og:xxx" content="...">` (including the case of
 * a `name=` attribute). The attribute order of property/name and content does not matter.
 * When there are several tags of the same name, the first one is used. */
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
 * When html exceeds MAX_INPUT_LENGTH (the same limit as news/text.ts), everything becomes
 * null (does not scan a huge HTML. This is a defence of this function alone, separate from
 * the 1MB cap on the sourcesFetcher.ts side).
 */
export function extractYoutubeMeta(html: string): YoutubeMeta {
  if (html.length > MAX_INPUT_LENGTH) {
    return { title: null, description: null, imageUrl: null, channelId: null }
  }

  const title = trimmedOrNull(metaContent(html, 'og:title'))
  const rawDescription = trimmedOrNull(metaContent(html, 'og:description'))
  const imageUrl = trimmedOrNull(metaContent(html, 'og:image'))
  const channelId = ownChannelId(html)

  return {
    title,
    description: rawDescription === null ? null : truncate(rawDescription, DESCRIPTION_MAX),
    imageUrl,
    channelId,
  }
}
