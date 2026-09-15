/**
 * seed.mjs から切り出した正規化関数（住所・SNS URL）。
 *
 * どちらも src/lib/ 側（geocode.ts の normalizeAddress・social.ts の
 * normalizeSocialUrls）と挙動を同一に保つ必要がある。片方だけ変えない
 * （seed 側は plain `.mjs` で TS を import できないため、あえて重複させている。
 * AGENTS.md「重複ロジックの同期」節と src/lib/normalize-parity.test.ts を参照）。
 */

/**
 * 住所を国土地理院 API に投げる前後で揺れが出ないように正規化する。
 * - NFKC で全角英数・全角記号を半角に寄せる
 * - 空白（全角含む）を削る
 * - ダッシュ類を半角ハイフンに揃える
 * - 「N丁目M番K号」→「N-M-K」、「N丁目M番地」→「N-M」
 *
 * geocode_cache.query のキーにもこの正規化後の文字列を使う。
 *
 * src/lib/geocode.ts の normalizeAddress と同一に保つ（geocode_cache のキーが一致しなくなる）。
 * null/undefined だけそのまま返す（アプリ側は呼び出し元の型で string を保証しているが、
 * こちらは JSON から読む値を渡すことがあるため防御的に扱う。実際の文字列変換ロジックは同じ）。
 */
export function normalizeAddress(address) {
  if (address === null || address === undefined) return address
  return address
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .replace(/[－ー―‐]/g, '-')
    .replace(/(\d+)丁目(\d+)番(\d+)号?/u, '$1-$2-$3')
    .replace(/(\d+)丁目(\d+)番地?(?!\d)/u, '$1-$2')
}

/**
 * 業者の SNS URL を正規化する。trim・空除去・重複除去・`http(s)://` 以外は除外・最大 10 件。
 *
 * src/lib/social.ts の normalizeSocialUrls と同一に保つ（plain .mjs から TS を import
 * できないためロジックを重複させている。変えるときは両方直す）。
 */
export function normalizeSocialUrls(list) {
  const seen = new Set()
  for (const raw of list ?? []) {
    const v = String(raw).trim()
    if (!/^https?:\/\//i.test(v)) continue
    if (!seen.has(v)) seen.add(v)
    if (seen.size >= 10) break
  }
  return [...seen]
}
