import { describe, expect, it } from 'vitest'

import { isAllowedNewsUrl } from './url'

describe('isAllowedNewsUrl', () => {
  it('https の公開ホスト名は許可する', () => {
    expect(isAllowedNewsUrl('https://news.example.com/feed/')).toBe(true)
  })

  it('末尾に . が付く FQDN 表記も正規化して許可する', () => {
    expect(isAllowedNewsUrl('https://news.example.com./feed/')).toBe(true)
  })

  it('大文字ホスト名も小文字化して判定する', () => {
    expect(isAllowedNewsUrl('https://NEWS.EXAMPLE.COM/feed/')).toBe(true)
  })

  it('http は拒否する', () => {
    expect(isAllowedNewsUrl('http://news.example.com/feed/')).toBe(false)
  })

  it('URL として読めない文字列は拒否する', () => {
    expect(isAllowedNewsUrl('not a url')).toBe(false)
  })

  it('userinfo（user:pass@）付きは拒否する', () => {
    expect(isAllowedNewsUrl('https://user:pass@news.example.com/feed/')).toBe(false)
  })

  it('既定以外のポートは拒否する', () => {
    expect(isAllowedNewsUrl('https://news.example.com:8443/feed/')).toBe(false)
  })

  it('既定ポート（443）を明示しても許可する', () => {
    expect(isAllowedNewsUrl('https://news.example.com:443/feed/')).toBe(true)
  })

  it('IPv4 リテラルは拒否する', () => {
    expect(isAllowedNewsUrl('https://192.168.1.1/feed/')).toBe(false)
  })

  it('16進数など別表記の IPv4 リテラルも（URL の正規化後に）拒否する', () => {
    expect(isAllowedNewsUrl('https://0x7f000001/feed/')).toBe(false)
  })

  it('IPv4 を含むがホスト名全体ではない場合は拒否しない', () => {
    expect(isAllowedNewsUrl('https://203.0.113.5.news.example.com/feed/')).toBe(true)
  })

  it('ブラケット付き IPv6 リテラルは拒否する', () => {
    expect(isAllowedNewsUrl('https://[::1]/feed/')).toBe(false)
    expect(isAllowedNewsUrl('https://[2001:db8::1]/feed/')).toBe(false)
  })

  it('localhost は拒否する', () => {
    expect(isAllowedNewsUrl('https://localhost/feed/')).toBe(false)
  })

  it('ドットを含まないホスト名は拒否する（localhost 以外の内部名も含めて）', () => {
    expect(isAllowedNewsUrl('https://intranet/feed/')).toBe(false)
  })

  it('.localhost / .local / .internal / .home.arpa で終わるホスト名は拒否する', () => {
    expect(isAllowedNewsUrl('https://foo.localhost/feed/')).toBe(false)
    expect(isAllowedNewsUrl('https://printer.local/feed/')).toBe(false)
    expect(isAllowedNewsUrl('https://service.internal/feed/')).toBe(false)
    expect(isAllowedNewsUrl('https://host.home.arpa/feed/')).toBe(false)
  })

  it('.workers.dev / .cloudflareaccess.com で終わるホスト名は拒否する', () => {
    expect(isAllowedNewsUrl('https://some-worker.workers.dev/feed/')).toBe(false)
    expect(isAllowedNewsUrl('https://team.cloudflareaccess.com/feed/')).toBe(false)
  })

  it('このアプリ自身のホスト（sumai-log.app・そのサブドメイン）は拒否する', () => {
    expect(isAllowedNewsUrl('https://sumai-log.app/feed/')).toBe(false)
    expect(isAllowedNewsUrl('https://www.sumai-log.app/feed/')).toBe(false)
  })

  it('末尾ドットで拒否リストの suffix チェックを回避できない', () => {
    expect(isAllowedNewsUrl('https://some-worker.workers.dev./feed/')).toBe(false)
  })
})
