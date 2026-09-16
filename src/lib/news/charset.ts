/**
 * 業者のお知らせ本文の文字コードを判定する。design.md は明示していないが、
 * html-list（RSS が無い古めの会社サイト）は Shift_JIS / EUC-JP を返すことがある。
 * それを常に UTF-8 として読むと本文が文字化けし、`url` が新着判定のキーで
 * タイトルの更新を追わない設計（一度保存したら直せない）ため、文字化けが恒久化する。
 *
 * 優先順位: HTTP の `Content-Type` ヘッダの `charset` → 本文先頭 2KB の
 * `<meta charset="…">` / `<meta http-equiv="Content-Type" content="…charset=…">`
 * の素朴な sniff → どちらも無ければ `'utf-8'`。
 *
 * sniff は Latin-1（1 バイト = 1 コードポイント。どのエンコーディングでも
 * ASCII 範囲のバイト列はそのままの並びなので、実際の charset が判明していない
 * 時点でも `<meta>` タグの中身だけは安全に読める）で覗く。外部 HTML パーサは
 * 使わず正規表現だけで `<meta …>` タグを探す（design.md §1 の方針どおり）。
 */

const CONTENT_TYPE_CHARSET = /charset\s*=\s*["']?([\w-]+)/i
const META_TAG = /<meta\b[^>]*>/gi
const CHARSET_IN_ATTR = /charset\s*=\s*["']?([\w-]+)/i

export const DEFAULT_CHARSET = 'utf-8'

/** sniff する本文の先頭バイト数。ほとんどの `<meta charset>` はここに収まる。 */
const HEAD_SNIFF_BYTES = 2048

function sniffMetaCharset(headBytes: Uint8Array): string | null {
  const head = headBytes.subarray(0, HEAD_SNIFF_BYTES)
  const text = new TextDecoder('iso-8859-1').decode(head)
  for (const tag of text.matchAll(META_TAG)) {
    const found = CHARSET_IN_ATTR.exec(tag[0])?.[1]
    if (found) return found
  }
  return null
}

/**
 * `contentType` は `response.headers.get('content-type')` の値（無ければ null）。
 * `headBytes` は本文のバイト列（先頭だけ渡しても全体を渡してもよい。内部で
 * 先頭 HEAD_SNIFF_BYTES だけを見る）。戻り値は `TextDecoder` にそのまま渡せる
 * ラベル文字列（呼び出し側で未知のラベルなら utf-8 にフォールバックすること）。
 */
export function detectCharset(contentType: string | null, headBytes: Uint8Array): string {
  const fromHeader = contentType ? CONTENT_TYPE_CHARSET.exec(contentType)?.[1] : null
  if (fromHeader) return fromHeader

  const fromMeta = sniffMetaCharset(headBytes)
  if (fromMeta) return fromMeta

  return DEFAULT_CHARSET
}
