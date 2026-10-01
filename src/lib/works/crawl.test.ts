import { describe, expect, it } from 'vitest'

import { crawlSite, MAX_LIST_PAGES } from './crawl'
import type { SiteParser } from './types'

const site = {
  key: 'siteA',
  parser: 'siteA' as const,
  listUrl: 'https://example.com/works/',
  vendorId: '00000000-0000-4000-8000-000000000001',
}

/** Fake pages: "list:<detail urls>|<page urls>" and "detail:<layout>" */
const parser: SiteParser = {
  parseList(html) {
    const [details = '', pages = ''] = html.replace('list:', '').split('|')
    return {
      entries: details
        .split(',')
        .filter(Boolean)
        .map((url) => ({ url, title: `T ${url}`, category: '新築' })),
      pageUrls: pages.split(',').filter(Boolean),
    }
  },
  parseDetail(html) {
    return { layout: html.replace('detail:', ''), category: null }
  },
}

function loader(pages: Record<string, string>) {
  const calls: string[] = []
  return {
    calls,
    load: async (url: string) => {
      calls.push(url)
      const body = pages[url]
      if (body === undefined) throw new Error(`fetch failed: ${url}`)
      return body
    },
  }
}

describe('crawlSite', () => {
  it('walks every list page once and merges list and detail fields', async () => {
    const { load, calls } = loader({
      'https://example.com/works/': 'list:d1,d2|https://example.com/works/page/2/',
      'https://example.com/works/page/2/': 'list:d2,d3|https://example.com/works/',
      d1: 'detail:1LDK',
      d2: 'detail:2LDK',
      d3: 'detail:3LDK',
    })
    const result = await crawlSite(site, parser, load)
    expect(result.failed).toEqual([])
    expect(result.works.map((w) => [w.sourceUrl, w.sortOrder, w.layout])).toEqual([
      ['d1', 0, '1LDK'],
      ['d2', 1, '2LDK'],
      ['d3', 2, '3LDK'],
    ])
    expect(calls.filter((u) => u === 'd2')).toHaveLength(1)
    expect(calls.filter((u) => u === 'https://example.com/works/')).toHaveLength(1)
  })

  it('fills the site, the vendor and empty defaults, and a null detail value does not erase the list value', async () => {
    const { load } = loader({ 'https://example.com/works/': 'list:d1|', d1: 'detail:1LDK' })
    const [work] = (await crawlSite(site, parser, load)).works
    expect(work).toMatchObject({
      site: 'siteA',
      vendorId: site.vendorId,
      title: 'T d1',
      category: '新築',
      points: [],
      uaValue: null,
    })
  })

  it('leaves out a work whose detail page failed, so the import cannot blank it', async () => {
    const { load } = loader({ 'https://example.com/works/': 'list:d1,d2|', d2: 'detail:2LDK' })
    const result = await crawlSite(site, parser, load)
    expect(result.works.map((w) => w.sourceUrl)).toEqual(['d2'])
    expect(result.failed).toEqual(['d1'])
  })

  it('reports a failed list page and keeps going', async () => {
    const { load } = loader({
      'https://example.com/works/': 'list:d1|https://example.com/works/page/2/',
      d1: 'detail:1LDK',
    })
    const result = await crawlSite(site, parser, load)
    expect(result.works).toHaveLength(1)
    expect(result.failed).toEqual(['https://example.com/works/page/2/'])
  })

  it('stops after MAX_LIST_PAGES even when every page links to a new one', async () => {
    let n = 0
    const endless: SiteParser = {
      parseList: () => ({ entries: [], pageUrls: [`https://example.com/works/page/${++n}/`] }),
      parseDetail: () => ({}),
    }
    const calls: string[] = []
    await crawlSite(site, endless, async (url) => {
      calls.push(url)
      return ''
    })
    expect(calls).toHaveLength(MAX_LIST_PAGES)
  })

  it('falls back to the url when neither page gives a title', async () => {
    const untitled: SiteParser = {
      parseList: () => ({ entries: [{ url: 'd1' }], pageUrls: [] }),
      parseDetail: () => ({ points: [] }),
    }
    const result = await crawlSite(site, untitled, async () => '')
    expect(result.works[0]?.title).toBe('d1')
  })
})
