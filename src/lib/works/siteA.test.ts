import { describe, expect, it } from 'vitest'

import { siteA } from './siteA'

const LIST = `
<ul>
  <li><a href="a_01.php">
    <span class="imgBox"><img src="a_01/main.jpg" alt="テストの家"></span>
    <dl>
      <dt>テストの家</dt>
      <dd class="details"><table><tr><th>面積</th><td><ul><li>延床面積 30.0坪</li></ul></td></tr></table></dd>
    </dl>
  </a>
  <!-- video -->
  <div class="aspectBox"><span class="videoIcon"><a href="https://www.youtube.com/watch?v=abcdefghijk" class="youtubeLink"><img src="m.png"></a></span></div>
  </li>
  <li><a href="b_02.php">
    <dl><dt>見本の&amp;家</dt></dl>
  </a></li>
  <li><a href="a_01.php"><dl><dt>テストの家</dt></dl></a></li>
  <li><a href="p012.php"><dl><dt>見本の家<span class="fCap">副題</span></dt></dl></a><div class="aspectBox"><a href="https://www.youtube.com/watch?v=bbbbbbbbbbb" class="youtubeLink"></a></div></li>
  <li><a href="c_03.php"><span>no title</span></a></li>
  <li><a href="../contact/">問い合わせ</a></li>
</ul>
<a href="https://www.youtube.com/watch?v=zzzzzzzzzzz">promo</a>`

const DETAIL = `
<h1>テストの家</h1>
<section id="caseData" class="secBox">
  <h2 class="secTitle">Data</h2>
  <div class="tags"><h3>ポイント</h3>
    <ul>
      <li><strong>断熱性能：UA値0.31</strong></li>
      <li><strong>気密性能：C値0.6</strong></li>
      <li><strong>耐震等級3</strong></li>
    </ul>
  </div>
  <table class="detail">
    <tr><th scope="row"><span class="text">家族構成</span></th><td>大人2人、子供1人</td></tr>
    <tr><th scope="row"><span class="text">面積</span></th><td>敷地面積 50.50坪<br>延床面積 30.20坪<br>総施工面積 33.15坪</td></tr>
    <tr><th scope="row"><span class="text">間取り</span></th><td>2LDK＋書斎</td></tr>
  </table>
</section>
<section id="caseSchedule"><table><tr><th>2020年</th><td>着工</td></tr></table></section>`

describe('siteA.parseList', () => {
  const page = siteA.parseList(LIST, 'https://example.com/case/')

  it('lists each example once with its title, in page order', () => {
    expect(page.entries.map((e) => [e.url, e.title])).toEqual([
      ['https://example.com/case/a_01.php', 'テストの家'],
      ['https://example.com/case/b_02.php', '見本の&家'],
      ['https://example.com/case/p012.php', '見本の家 副題'],
    ])
  })

  it('takes the video only from the same list item', () => {
    expect(page.entries[0]?.youtubeVideoId).toBe('abcdefghijk')
    expect(page.entries[1]?.youtubeVideoId).toBeNull()
    expect(page.entries[2]?.youtubeVideoId).toBe('bbbbbbbbbbb')
  })

  it('has no other pages', () => {
    expect(page.pageUrls).toEqual([])
  })

  it('returns nothing when the page url is broken', () => {
    expect(siteA.parseList(LIST, 'not a url').entries).toEqual([])
  })
})

describe('siteA.parseDetail', () => {
  it('reads the Data block', () => {
    expect(siteA.parseDetail(DETAIL)).toEqual({
      points: ['断熱性能：UA値0.31', '気密性能：C値0.6', '耐震等級3'],
      uaValue: 0.31,
      cValue: 0.6,
      family: '大人2人、子供1人',
      siteAreaTsubo: 50.5,
      floorAreaTsubo: 30.2,
      totalAreaTsubo: 33.15,
      layout: '2LDK＋書斎',
    })
  })

  it('leaves missing rows null and points empty', () => {
    const html =
      '<section id="caseData"><table><tr><th>面積</th><td>延床面積 31.5坪</td></tr></table></section>'
    expect(siteA.parseDetail(html)).toEqual({
      points: [],
      uaValue: null,
      cValue: null,
      family: null,
      siteAreaTsubo: null,
      floorAreaTsubo: 31.5,
      totalAreaTsubo: null,
      layout: null,
    })
  })

  it('reads no area when the table has no area row', () => {
    const html =
      '<section id="caseData"><table><tr><th>家族構成</th><td>大人2人</td></tr></table></section>'
    expect(siteA.parseDetail(html)).toMatchObject({ family: '大人2人', floorAreaTsubo: null })
  })

  it('returns nothing when the page has no Data block', () => {
    expect(siteA.parseDetail('<h1>404</h1>')).toEqual({})
  })
})
