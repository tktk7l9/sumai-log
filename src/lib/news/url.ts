/**
 * サーバーから実際に fetch してよい URL かを判定する（SSRF 対策の多層防御の一つ）。
 * 元は業者のお知らせ URL 専用だったが、代表者写真の URL 取り込み・ファビコン取得
 * （src/server/vendorImages.ts）でも同じ判定を使うため `isAllowedRemoteUrl` に改名した。
 * `isAllowedNewsUrl` は既存の呼び出し元（zod.ts の optionalHttpsUrl・newsFetcher.ts・
 * VendorForm.tsx）をそのまま動かすための別名（下の export const）。
 *
 * Cloudflare Workers の fetch はそもそもプライベートネットワーク（10.0.0.0/8 等）への
 * 経路を持たず、DNS 解決結果を覗く API も無い。したがってこのホスト名の拒否リストは
 * 「念のため」の多層防御であり、本体の防御は Workers のネットワーク境界そのもの。
 *
 * リダイレクトは newsFetcher.ts / vendorImages.ts 側で `redirect: 'manual'` にしたうえで、
 * `Location` を解決するたびにこの関数を再度通す（最大 3 ホップ）。この関数自体はどの
 * URL に対して呼ばれても同じ判定をするだけで、それが最初の URL かリダイレクト先かは
 * 意識しない。
 */

const DENYLISTED_EXACT_HOSTS = new Set([
  'localhost',
  // このアプリ自身のカスタムドメイン。お知らせの取得元がリダイレクトでここに
  // 誘導されると、Worker が自分自身（や別の Worker）に対してリクエストする形になる。
  'sumai-log.app',
])

const DENYLISTED_SUFFIXES = [
  '.localhost',
  '.local',
  '.internal',
  '.home.arpa',
  '.workers.dev',
  '.cloudflareaccess.com',
  '.sumai-log.app',
]

/** 末尾の '.'（FQDN 表記）を落としてから小文字化する。先に落とさないと workers.dev の
 * ような拒否リストの suffix チェックを末尾ドットで回避されうる。 */
function normalizeHostname(hostname: string): string {
  const lower = hostname.toLowerCase()
  return lower.endsWith('.') ? lower.slice(0, -1) : lower
}

/** `new URL()` は 16進・8進・10進などの IPv4 の別表記も正規の 'a.b.c.d' に直すので、
 * ここでは正規化後の形だけを見れば別表記による回避も一緒に弾ける。 */
function isIpv4Literal(hostname: string): boolean {
  return /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)
}

export function isAllowedRemoteUrl(url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }

  if (parsed.protocol !== 'https:') return false
  if (parsed.username !== '' || parsed.password !== '') return false
  if (parsed.port !== '') return false // 既定ポート（443）以外は拒否

  const hostname = normalizeHostname(parsed.hostname)
  if (hostname.startsWith('[')) return false // ブラケット付き IPv6 リテラル
  if (isIpv4Literal(hostname)) return false
  // 完全一致の拒否判定は、この下のドット必須チェックより先に行う（'localhost' は
  // ドットを含まないため、順序を逆にするとドット判定だけで弾かれてしまい、
  // ここの分岐がテストで踏めなくなる）。
  if (DENYLISTED_EXACT_HOSTS.has(hostname)) return false
  if (!hostname.includes('.')) return false
  if (DENYLISTED_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) return false

  return true
}

/** `isAllowedRemoteUrl` の旧名。既存の呼び出し元はこちらを import したままでよい */
export const isAllowedNewsUrl = isAllowedRemoteUrl
