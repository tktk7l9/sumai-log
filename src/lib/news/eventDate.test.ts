import { describe, expect, it } from 'vitest'

import { extractEvent, inferYear } from './eventDate'

describe('inferYear', () => {
  it('投稿月より2か月以上前の月は翌年とみなす', () => {
    // 投稿が12月で「1月」は11か月前＝2か月以上前 → 翌年
    expect(inferYear(1, '2026-12-20')).toBe(2027)
  })

  it('投稿月の1か月前ちょうどは同年（2か月以上前ではない）', () => {
    expect(inferYear(11, '2026-12-20')).toBe(2026)
    expect(inferYear(1, '2026-02-01')).toBe(2026)
  })

  it('投稿月と同じ、または後の月は同年', () => {
    expect(inferYear(8, '2026-08-01')).toBe(2026)
    expect(inferYear(9, '2026-08-01')).toBe(2026)
  })
})

describe('extractEvent', () => {
  it('仕様の例1: 《9月12日(土)開催》は見学会・単日', () => {
    const text = '【お住まい見学会】Clam Chowder House《9月12日(土)開催》'
    expect(extractEvent(text, '2026-08-20')).toEqual({
      kind: '見学会',
      start: '2026-09-12',
      end: '2026-09-12',
    })
  })

  it('仕様の例2: 7/6-/7 は同月終端の完成見学会', () => {
    const text = '7/6-/7『開拓者の家Ⅱ』完成見学会のおしらせ'
    expect(extractEvent(text, '2026-06-01')).toEqual({
      kind: '完成見学会',
      start: '2026-07-06',
      end: '2026-07-07',
    })
  })

  it('仕様の例3: 列挙（D日・D日）は構造見学会・範囲', () => {
    const text = '"均悉想和" 構造見学会 11月17日(土)・18日(日)'
    expect(extractEvent(text, '2026-10-01')).toEqual({
      kind: '構造見学会',
      start: '2026-11-17',
      end: '2026-11-18',
    })
  })

  it('M/D-M/D（月をまたぐ範囲。14日以内なのでそのまま範囲になる）', () => {
    const text = 'セミナー 9/25-10/3のご案内'
    expect(extractEvent(text, '2026-08-01')).toEqual({
      kind: 'セミナー',
      start: '2026-09-25',
      end: '2026-10-03',
    })
  })

  it('M/D〜M/D（波ダッシュ U+301C）', () => {
    const text = '相談会 9/12〜9/20'
    expect(extractEvent(text, '2026-08-01')).toEqual({
      kind: '相談会',
      start: '2026-09-12',
      end: '2026-09-20',
    })
  })

  it('M/D～D（全角チルダ U+FF5E・同月終端の日のみ）', () => {
    const text = 'イベント 9/12～15'
    expect(extractEvent(text, '2026-08-01')).toEqual({
      kind: 'イベント',
      start: '2026-09-12',
      end: '2026-09-15',
    })
  })

  it('M/D 単独（範囲なし）', () => {
    const text = '見学会 9/12開催'
    expect(extractEvent(text, '2026-08-01')).toEqual({
      kind: '見学会',
      start: '2026-09-12',
      end: '2026-09-12',
    })
  })

  it('M/D.D（ピリオド区切りの日の列挙）は同月終端になる', () => {
    const text = '完成見学会 8/22.23開催'
    expect(extractEvent(text, '2026-08-01')).toEqual({
      kind: '完成見学会',
      start: '2026-08-22',
      end: '2026-08-23',
    })
  })

  it('M/D・D（中黒区切りの日の列挙）は同月終端になる', () => {
    const text = '見学会 7/22・23開催'
    expect(extractEvent(text, '2026-07-01')).toEqual({
      kind: '見学会',
      start: '2026-07-22',
      end: '2026-07-23',
    })
  })

  it('M/D,D,D（カンマ区切り・3つ以上の繰り返し）は最後に列挙された日が終端になる', () => {
    const text = 'イベント 8/22,23,24開催'
    expect(extractEvent(text, '2026-08-01')).toEqual({
      kind: 'イベント',
      start: '2026-08-22',
      end: '2026-08-24',
    })
  })

  it('M/D、D（読点区切り）も日の列挙として拾う', () => {
    const text = 'セミナー 9/5、6開催'
    expect(extractEvent(text, '2026-08-20')).toEqual({
      kind: 'セミナー',
      start: '2026-09-05',
      end: '2026-09-06',
    })
  })

  it('列挙の要素が直前の日以下なら、そこで列挙の読み取りを止める（小数表記との混同回避）', () => {
    // 「7/22.5割」の 5 は 22 より小さいので列挙にならず、単独の 7/22 のまま残る
    const text = '見学会 7/22.5割引でご案内'
    expect(extractEvent(text, '2026-07-01')).toEqual({
      kind: '見学会',
      start: '2026-07-22',
      end: '2026-07-22',
    })
  })

  it('列挙の要素が実在しない日（32日等）なら、そこで列挙の読み取りを止める', () => {
    const text = '見学会 8/1.32開催'
    expect(extractEvent(text, '2026-08-01')).toEqual({
      kind: '見学会',
      start: '2026-08-01',
      end: '2026-08-01',
    })
  })

  it('列挙の3桁目（4桁の日）は日として拾わない（1〜2桁のみ）', () => {
    // 「8/1.234」の「234」は1〜2桁ではないので列挙にならず、単独の 8/1 のまま残る
    const text = '見学会 8/1.234開催'
    expect(extractEvent(text, '2026-08-01')).toEqual({
      kind: '見学会',
      start: '2026-08-01',
      end: '2026-08-01',
    })
  })

  it('M/D 単独に曜日注記が続く場合は分数判定の対象にせず日付として扱う', () => {
    const text = '見学会 9/12(土)開催'
    expect(extractEvent(text, '2026-08-01')).toEqual({
      kind: '見学会',
      start: '2026-09-12',
      end: '2026-09-12',
    })
  })

  it('分数表記（直前が「の」）は M/D の誤検出として日付にしない', () => {
    // 「参加費は通常の1/2です」相当（種別語を足して意味のある回帰テストにする）
    const text = '見学会 参加費は通常の1/2です'
    expect(extractEvent(text, '2026-08-01')).toBeNull()
  })

  it('分数表記（直前が「先着」・直後が「程度」）は M/D の誤検出として日付にしない', () => {
    const text = 'セミナー 先着1/2程度'
    expect(extractEvent(text, '2026-08-01')).toBeNull()
  })

  it('YYYY年M月D日（明示年は投稿日の年より優先）', () => {
    const text = '完成見学会 2026年9月12日開催'
    // 投稿日を全く違う年にしても、本文の明示年が使われる
    expect(extractEvent(text, '2020-01-01')).toEqual({
      kind: '完成見学会',
      start: '2026-09-12',
      end: '2026-09-12',
    })
  })

  it('年またぎ: 投稿12月で「1月10日」は翌年', () => {
    const text = '見学会 1月10日開催'
    expect(extractEvent(text, '2026-12-20')).toEqual({
      kind: '見学会',
      start: '2027-01-10',
      end: '2027-01-10',
    })
  })

  it('独立した「D日」は2つの M月D日 の間にあっても直前の月に紐づく（後ろ向き走査の途中スキップ）', () => {
    // 「19日」は「11月17日」の直後・「12月1日」より前にある。直前の月（11月）に
    // 紐づくべきで、まだ出てきていない後方の「12月1日」に引きずられない
    // （11/17〜12/1 は 14 日ちょうどなのでクランプされず、期待どおりの範囲で確認できる）。
    const text = '見学会 11月17日・19日、12月1日にも開催'
    expect(extractEvent(text, '2026-10-01')).toEqual({
      kind: '見学会',
      start: '2026-11-17',
      end: '2026-12-01',
    })
  })

  it('列挙が降順でも min/max を正しく計算する', () => {
    const text = '見学会 11月17日(土)・15日(日)'
    expect(extractEvent(text, '2026-10-01')).toEqual({
      kind: '見学会',
      start: '2026-11-15',
      end: '2026-11-17',
    })
  })

  it('オープンハウスは「見学会」を含まなくても見学会になる', () => {
    const text = 'オープンハウス 9/12開催'
    expect(extractEvent(text, '2026-08-01')).toEqual({
      kind: '見学会',
      start: '2026-09-12',
      end: '2026-09-12',
    })
  })

  it('種別語が無ければ日付があっても null', () => {
    expect(extractEvent('9月12日に工事完了予定', '2026-08-01')).toBeNull()
  })

  it('日付がまったく無ければ null', () => {
    expect(extractEvent('セミナーのご案内', '2026-08-01')).toBeNull()
  })

  it('月の手がかりが無い「D日」だけの表記は無視してイベントにしない', () => {
    expect(extractEvent('見学会 15日から受付開始', '2026-08-01')).toBeNull()
  })

  it('13月のような実在しない月は捨てる（結果としてイベントにしない）', () => {
    expect(extractEvent('見学会 13月1日開催', '2026-08-01')).toBeNull()
  })

  it('1月32日のような実在しない日は捨てる（31日までの月）', () => {
    expect(extractEvent('見学会 1月32日開催', '2026-08-01')).toBeNull()
  })

  it('0月・0日のような1未満の月日も実在しないので捨てる', () => {
    expect(extractEvent('見学会 0月5日開催', '2026-08-01')).toBeNull()
    expect(extractEvent('見学会 9月0日開催', '2026-08-01')).toBeNull()
  })

  it('2月29日は、推定年がうるう年でなければ捨てる', () => {
    // 投稿が2026-01-15（1月）なので月は同年2026年のまま。2026年はうるう年ではない。
    expect(extractEvent('見学会 2月29日開催', '2026-01-15')).toBeNull()
  })

  it('2月29日は、推定年がうるう年（4で割り切れる非世紀年）なら受け付ける', () => {
    expect(extractEvent('見学会 2月29日開催', '2028-01-15')).toEqual({
      kind: '見学会',
      start: '2028-02-29',
      end: '2028-02-29',
    })
  })

  it('2月29日は、推定年が400で割り切れる世紀年（うるう年）なら受け付ける', () => {
    expect(extractEvent('見学会 2月29日開催', '2000-01-15')).toEqual({
      kind: '見学会',
      start: '2000-02-29',
      end: '2000-02-29',
    })
  })

  it('2月29日は、推定年が100で割り切れるが400では割り切れない世紀年なら捨てる', () => {
    expect(extractEvent('見学会 2月29日開催', '1900-01-15')).toBeNull()
  })

  describe('14日を超える範囲は開始日だけに揃える', () => {
    it('受付期間と開催日のように離れた日付が混ざると開始日だけになる（受付開始が本文の最初の日付）', () => {
      // 「8月1日より受付開始」の 8/1 と「見学会は9月12日」の 9/12 は 42 日離れている。
      // 開催日（9/12）ではなく本文中で最小の日付（受付開始日・8/1）が start に
      // 選ばれる点は、この単純な min/max ヒューリスティックの既知のトレードオフ
      // （実際に開催日を当てるには自然言語での意味理解が要る）。
      const text = '8月1日より受付開始。見学会は9月12日(土)開催'
      expect(extractEvent(text, '2026-08-01')).toEqual({
        kind: '見学会',
        start: '2026-08-01',
        end: '2026-08-01',
      })
    })

    it('範囲がちょうど14日なら（境界）クランプせず範囲のまま', () => {
      const text = '見学会 8/1〜8/15'
      expect(extractEvent(text, '2026-08-01')).toEqual({
        kind: '見学会',
        start: '2026-08-01',
        end: '2026-08-15',
      })
    })

    it('範囲が15日（14日を1日超える）になると開始日だけになる', () => {
      const text = '見学会 8/1〜8/16'
      expect(extractEvent(text, '2026-08-01')).toEqual({
        kind: '見学会',
        start: '2026-08-01',
        end: '2026-08-01',
      })
    })
  })
})
