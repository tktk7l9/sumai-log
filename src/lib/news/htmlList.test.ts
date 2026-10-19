import { describe, expect, it } from 'vitest'

import { parseHtmlList } from './htmlList'

const BASE_URL = 'https://www.example-koumuten.co.jp/'

describe('parseHtmlList', () => {
  it('turns li with 3 kinds of date notation and relative / absolute / root-relative href into candidates', () => {
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

  it('drops a li without a date', () => {
    const html = `<ul><li><a href="./news/4.php">日付の無いお知らせ</a></li></ul>`
    expect(parseHtmlList(html, BASE_URL)).toEqual([])
  })

  it('drops a li without href (an <a> tag)', () => {
    const html = `<ul><li>2026年9月25日 お知らせのみ（リンク無し）</li></ul>`
    expect(parseHtmlList(html, BASE_URL)).toEqual([])
  })

  it('drops a li that resolves to a scheme other than http(s)', () => {
    const html = `
      <ul>
        <li>2026年10月1日 <a href="javascript:void(0)">JSリンク</a></li>
        <li>2026年10月2日 <a href="mailto:info@example.com">メール</a></li>
      </ul>
    `
    expect(parseHtmlList(html, BASE_URL)).toEqual([])
  })

  it('drops a li whose href fails to resolve at all (does not throw)', () => {
    const html = `<ul><li>2026年10月3日 <a href="./kengaku/5.php">壊れたベースURL</a></li></ul>`
    expect(parseHtmlList(html, '')).toEqual([])
  })

  it('resolves the entity (&amp;) in the query string of href before building the URL', () => {
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

  it('includes the text before and after the date token in the title', () => {
    const html = `<ul><li><span>2026年10月5日</span> <a href="./x.php">タイトル</a>（詳細はこちら）</li></ul>`
    const result = parseHtmlList(html, BASE_URL)
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('タイトル （詳細はこちら）')
    expect(result[0].publishedOn).toBe('2026-10-05')
  })

  it('truncates the title to 200 chars', () => {
    const longTitle = 'あ'.repeat(210)
    const html = `<ul><li>2026年10月6日 <a href="./x.php">${longTitle}</a></li></ul>`
    const result = parseHtmlList(html, BASE_URL)
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('あ'.repeat(200))
    expect(result[0].title.length).toBe(200)
  })

  it('gives an empty array when there is no li', () => {
    expect(parseHtmlList('<ul></ul>', BASE_URL)).toEqual([])
    expect(parseHtmlList('not html at all', BASE_URL)).toEqual([])
    expect(parseHtmlList('', BASE_URL)).toEqual([])
  })

  it('gives an empty array for input longer than MAX_INPUT_LENGTH', () => {
    expect(parseHtmlList('a'.repeat(2_000_001), BASE_URL)).toEqual([])
  })

  it('finishes in linear time on a page full of unclosed <li> (hostile or broken source)', () => {
    const start = performance.now()
    expect(parseHtmlList('<li>'.repeat(200_000), BASE_URL)).toEqual([])
    expect(performance.now() - start).toBeLessThan(2000)
  })

  it('takes the date from the link when the text has none, and keeps the whole text as the title', () => {
    const html = `
      <ul>
        <li><h3><span>11</span>月開催</h3><a href="index_20261114.php">完成見学会(11/14-23) 架空の家 テスト市 甲様邸</a></li>
        <li><a href="20261212/">完成見学会(12/12-20) 仮名の家 テスト市 乙様邸</a></li>
        <li><a href="/2026/9/5/open-house/">構造見学会のご案内</a></li>
        <li><a href="/news/?d=2026-10-03&amp;p=2">秋のセミナー</a></li>
      </ul>
    `
    expect(parseHtmlList(html, `${BASE_URL}kengaku/`)).toEqual([
      {
        url: 'https://www.example-koumuten.co.jp/kengaku/index_20261114.php',
        title: '11 月開催 完成見学会(11/14-23) 架空の家 テスト市 甲様邸',
        summary: null,
        publishedOn: '2026-11-14',
      },
      {
        url: 'https://www.example-koumuten.co.jp/kengaku/20261212/',
        title: '完成見学会(12/12-20) 仮名の家 テスト市 乙様邸',
        summary: null,
        publishedOn: '2026-12-12',
      },
      {
        url: 'https://www.example-koumuten.co.jp/2026/9/5/open-house/',
        title: '構造見学会のご案内',
        summary: null,
        publishedOn: '2026-09-05',
      },
      {
        url: 'https://www.example-koumuten.co.jp/news/?d=2026-10-03&p=2',
        title: '秋のセミナー',
        summary: null,
        publishedOn: '2026-10-03',
      },
    ])
  })

  it('prefers the date written in the text over the one in the link', () => {
    const html = `<ul><li>2026年9月10日 <a href="./kengaku/20261114/">完成見学会のお知らせ</a></li></ul>`
    expect(parseHtmlList(html, BASE_URL)).toEqual([
      {
        url: 'https://www.example-koumuten.co.jp/kengaku/20261114/',
        title: '完成見学会のお知らせ',
        summary: null,
        publishedOn: '2026-09-10',
      },
    ])
  })

  it('does not take digits of the link that are not a calendar day of a 20xx year for a date', () => {
    const html = `
      <ul>
        <li><a href="/items/?id=20261399">13月</a></li>
        <li><a href="/items/20260230/">2月30日</a></li>
        <li><a href="/items/12345678/">8桁の番号</a></li>
        <li><a href="/items/19991231/">1999年</a></li>
        <li><a href="/2026/13/01/">13月の固定リンク</a></li>
        <li><a href="/2026/11/1400/">日に続く数字</a></li>
        <li><a href="tel:0120202611140">電話</a></li>
      </ul>
    `
    expect(parseHtmlList(html, BASE_URL)).toEqual([])
  })

  it('reads past a number that is not a date to one that is', () => {
    const html = `<ul><li><a href="/items/20261399/20261114/">予約番号付き</a></li></ul>`
    expect(parseHtmlList(html, BASE_URL)).toEqual([
      {
        url: 'https://www.example-koumuten.co.jp/items/20261399/20261114/',
        title: '予約番号付き',
        summary: null,
        publishedOn: '2026-11-14',
      },
    ])
  })

  it('does not read li inside an HTML comment or a script', () => {
    const html = `
      <ul>
        <!--<li><a href="old_20251213.php">去年の見学会</a></li>-->
        <li><a href="now_20261114.php">今年の見学会</a></li>
        <script>var t = '<li><a href="t_20261212.php">テンプレート</a></li>'</script>
        <!-- <li>2026年9月10日 <a href="./draft.php">下書き</a></li>
      </ul>
    `
    expect(parseHtmlList(html, BASE_URL)).toEqual([
      {
        url: 'https://www.example-koumuten.co.jp/now_20261114.php',
        title: '今年の見学会',
        summary: null,
        publishedOn: '2026-11-14',
      },
    ])
  })

  it('keeps one candidate per link, the one with the most text, in the place of the first', () => {
    const html = `
      <nav><ul>
        <li><a href="index_20261114.php">見学会</a></li>
        <li><a href="../">HOME</a></li>
      </ul></nav>
      <ul>
        <li><a href="index_20261114.php">完成見学会(11/14-23) 架空の家 テスト市 甲様邸</a></li>
        <li><a href="20261212/">完成見学会(12/12-20) 仮名の家</a></li>
      </ul>
      <footer><ul>
        <li><a href="index_20261114.php">見学会 【11/14～23】</a></li>
      </ul></footer>
    `
    expect(parseHtmlList(html, `${BASE_URL}kengaku/`)).toEqual([
      {
        url: 'https://www.example-koumuten.co.jp/kengaku/index_20261114.php',
        title: '完成見学会(11/14-23) 架空の家 テスト市 甲様邸',
        summary: null,
        publishedOn: '2026-11-14',
      },
      {
        url: 'https://www.example-koumuten.co.jp/kengaku/20261212/',
        title: '完成見学会(12/12-20) 仮名の家',
        summary: null,
        publishedOn: '2026-12-12',
      },
    ])
  })
})
