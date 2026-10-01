import { describe, expect, it } from 'vitest'

import { absoluteUrl, findYouTubeId, pageLinks, textOf } from './html'

describe('textOf', () => {
  it('drops tags, decodes entities and collapses whitespace', () => {
    expect(
      textOf('<p> A&amp;B&nbsp;<strong>C</strong>\n &lt;D&gt; &quot;E&quot; &#39;F&#39; </p>'),
    ).toBe('A&B C <D> "E" \'F\'')
  })

  it('turns line breaks and list items into spaces so neighbours do not glue together', () => {
    expect(textOf('敷地面積 80坪<br>延床面積 30坪<ul><li>一</li><li>二</li></ul>')).toBe(
      '敷地面積 80坪 延床面積 30坪 一 二',
    )
  })

  it('drops script and style bodies', () => {
    expect(textOf('<style>p{}</style>本文<script>var a = "<p>"</script>')).toBe('本文')
  })
})

describe('absoluteUrl', () => {
  it('resolves relative and absolute hrefs against the page', () => {
    expect(absoluteUrl('a_01.php', 'https://example.com/case/')).toBe(
      'https://example.com/case/a_01.php',
    )
    expect(absoluteUrl('https://example.com/works/p1/', 'https://example.com/works/')).toBe(
      'https://example.com/works/p1/',
    )
  })

  it('returns null for a broken base or a non-http target', () => {
    expect(absoluteUrl('a.php', 'not a url')).toBeNull()
    expect(absoluteUrl('javascript:void(0)', 'https://example.com/')).toBeNull()
  })
})

describe('findYouTubeId', () => {
  it('finds the id in a watch link, a short link and an embed (nocookie too)', () => {
    expect(findYouTubeId('<a href="https://www.youtube.com/watch?v=abcdefghijk">')).toBe(
      'abcdefghijk',
    )
    expect(findYouTubeId('<a href="https://youtu.be/ABCDEFGHIJK?si=x">')).toBe('ABCDEFGHIJK')
    expect(findYouTubeId('<iframe src="https://www.youtube.com/embed/a_c-efghijk?si=x">')).toBe(
      'a_c-efghijk',
    )
    expect(findYouTubeId('<iframe src="https://www.youtube-nocookie.com/embed/abcdefghijk">')).toBe(
      'abcdefghijk',
    )
  })

  it('returns null for a channel link or no link', () => {
    expect(findYouTubeId('<a href="https://www.youtube.com/@example">')).toBeNull()
    expect(findYouTubeId('<p>none</p>')).toBeNull()
  })
})

describe('pageLinks', () => {
  const html =
    '<a href="https://example.com/works/page/2/">2</a><a href="/works/page/3/">3</a>' +
    '<a href="https://example.com/works/page/2/">next</a><a href="https://example.com/blog/page/2/">x</a>' +
    '<a href="mailto:a@example.com/page/9/">mail</a>'

  it('returns the other pages of the same list, once each', () => {
    expect(pageLinks(html, 'https://example.com/works/')).toEqual([
      'https://example.com/works/page/2/',
      'https://example.com/works/page/3/',
    ])
  })

  it('works from a later page and leaves out the page itself', () => {
    expect(pageLinks(html, 'https://example.com/works/page/2/')).toEqual([
      'https://example.com/works/page/3/',
    ])
  })

  it('returns nothing when the page url is broken', () => {
    expect(pageLinks(html, 'not a url')).toEqual([])
  })
})
