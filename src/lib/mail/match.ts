/**
 * メール取込（設計 2026-09-19 §3-5）: 差出人ドメインと業者の照合。純粋関数だけ。
 * 業者の `news_email_domain` はカンマ区切り・小文字で保存する（normalizeDomains）。
 */

const ADDRESS_IN_BRACKETS = /<([^<>]+)>/

/** 'Name <x@y.com>' / 'x@y.com' からアドレス部分を取り出して小文字にする */
function extractAddress(raw: string): string {
  const m = ADDRESS_IN_BRACKETS.exec(raw)
  return (m ? m[1] : raw).trim().toLowerCase()
}

/** アドレスの '@' の右側。無ければ null */
export function domainOf(address: string): string | null {
  const addr = extractAddress(address)
  const at = addr.lastIndexOf('@')
  if (at < 0) return null
  const domain = addr.slice(at + 1)
  return domain.length > 0 ? domain : null
}

/** フォーム入力をカンマ区切り・小文字・重複なしに正規化する。空なら null */
export function normalizeDomains(input: string | null | undefined): string | null {
  if (!input) return null
  const seen = new Set<string>()
  for (const part of input.split(/[,\n]/)) {
    const raw = part.trim().toLowerCase()
    if (!raw) continue
    const at = raw.lastIndexOf('@')
    const domain = at >= 0 ? raw.slice(at + 1) : raw
    if (domain) seen.add(domain)
  }
  return seen.size > 0 ? [...seen].join(',') : null
}

export function splitDomains(stored: string | null | undefined): string[] {
  if (!stored) return []
  return stored.split(',').filter((d) => d.length > 0)
}

/** 完全一致またはサブドメイン（'mail.example.com' は 'example.com' に一致） */
export function domainMatches(domain: string, registered: string): boolean {
  return domain === registered || domain.endsWith(`.${registered}`)
}

/** 差出人ドメインが登録ドメインに一致する最初の業者。無ければ null */
export function matchVendorByDomain<T extends { newsEmailDomain: string | null }>(
  fromAddress: string,
  vendors: readonly T[],
): T | null {
  const domain = domainOf(fromAddress)
  if (!domain) return null
  for (const v of vendors) {
    if (splitDomains(v.newsEmailDomain).some((r) => domainMatches(domain, r))) return v
  }
  return null
}
