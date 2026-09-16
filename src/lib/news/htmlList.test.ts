import { describe, expect, it } from 'vitest'

import { parseHtmlList } from './htmlList'

const BASE_URL = 'https://www.example-koumuten.co.jp/'

describe('parseHtmlList', () => {
  it('3種類の日付表記・相対/絶対/ルート相対 href を持つ li を候補にする', () => {
    const html = `
      <ul>
        <li>2026年9月10日 <a href="./kengaku/1.php">完成見学会のお知らせ</a></li>
        <li>2026.09.15 <a href="https://www.example-koumuten.co.jp/news/2.php">構造見学会について</a></li>
        <li>2026/9/20 <a href="/news/3.php">秋のセミナー開催</a></li>
      </ul>
    `
    expect(parseHtmlList(html, BASE_URL)).toEqual([
      {
        url: 'https://www.example-koumuten.co.jp/kengaku/1.php',
        title: '完成見学会のお知らせ',
        summary: null,
        publishedOn: '2026-09-10',
      },
      {
        url: 'https://www.example-koumuten.co.jp/news/2.php',
        title: '構造見学会について',
        summary: null,
        publishedOn: '2026-09-15',
      },
      {
        url: 'https://www.example-koumuten.co.jp/news/3.php',
        title: '秋のセミナー開催',
        summary: null,
        publishedOn: '2026-09-20',
      },
    ])
  })

  it('日付が無い li は捨てる', () => {
    const html = `<ul><li><a href="./news/4.php">日付の無いお知らせ</a></li></ul>`
    expect(parseHtmlList(html, BASE_URL)).toEqual([])
  })

  it('href（<a> タグ）が無い li は捨てる', () => {
    const html = `<ul><li>2026年9月25日 お知らせのみ（リンク無し）</li></ul>`
    expect(parseHtmlList(html, BASE_URL)).toEqual([])
  })

  it('http(s) 以外のスキームに解決される li は捨てる', () => {
    const html = `
      <ul>
        <li>2026年10月1日 <a href="javascript:void(0)">JSリンク</a></li>
        <li>2026年10月2日 <a href="mailto:info@example.com">メール</a></li>
      </ul>
    `
    expect(parseHtmlList(html, BASE_URL)).toEqual([])
  })

  it('href の解決自体に失敗する li は捨てる（例外を投げない）', () => {
    const html = `<ul><li>2026年10月3日 <a href="./kengaku/5.php">壊れたベースURL</a></li></ul>`
    expect(parseHtmlList(html, '')).toEqual([])
  })

  it('href のクエリ文字列にあるエンティティ（&amp;）を解決してから URL を組み立てる', () => {
    const html = `<ul><li>2026年10月4日 <a href="./x.php?id=1&amp;p=2">クエリ付き</a></li></ul>`
    expect(parseHtmlList(html, BASE_URL)).toEqual([
      {
        url: 'https://www.example-koumuten.co.jp/x.php?id=1&p=2',
        title: 'クエリ付き',
        summary: null,
        publishedOn: '2026-10-04',
      },
    ])
  })

  it('日付トークンの前後の文字も含めてタイトルにする', () => {
    const html = `<ul><li><span>2026年10月5日</span> <a href="./x.php">タイトル</a>（詳細はこちら）</li></ul>`
    const result = parseHtmlList(html, BASE_URL)
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('タイトル （詳細はこちら）')
    expect(result[0].publishedOn).toBe('2026-10-05')
  })

  it('タイトルは200字に切り詰める', () => {
    const longTitle = 'あ'.repeat(210)
    const html = `<ul><li>2026年10月6日 <a href="./x.php">${longTitle}</a></li></ul>`
    const result = parseHtmlList(html, BASE_URL)
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('あ'.repeat(200))
    expect(result[0].title.length).toBe(200)
  })

  it('li が無ければ空配列', () => {
    expect(parseHtmlList('<ul></ul>', BASE_URL)).toEqual([])
    expect(parseHtmlList('not html at all', BASE_URL)).toEqual([])
    expect(parseHtmlList('', BASE_URL)).toEqual([])
  })
})
