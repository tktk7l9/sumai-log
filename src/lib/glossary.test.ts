import { describe, expect, it } from 'vitest'

import {
  DIAGRAM_IDS,
  GLOSSARY,
  GLOSSARY_CATEGORIES,
  type CategoryId,
  type GlossaryTerm,
} from '../content/glossary'
import {
  findTerm,
  groupByCategory,
  relatedTerms,
  searchGlossary,
  termIdForMetric,
} from './glossary'

/** 純粋関数の検証はこの架空の用語だけで行う（本物のデータに依存させない） */
const fixtures: GlossaryTerm[] = [
  {
    id: 'alpha',
    term: 'アルファ値',
    reading: 'あるふぁち',
    category: 'performance',
    summary: '架空の性能指標。小さいほど良いことにしておく。',
    body: ['一段落目。', '二段落目。'],
    related: ['beta', 'unknown-id'],
    aliases: ['Alpha', 'α値'],
  },
  {
    id: 'beta',
    term: 'ベータ',
    reading: 'べーた',
    category: 'money',
    summary: '架空のお金の用語。',
    body: ['本文。'],
  },
  {
    id: 'gamma',
    term: 'ガンマ',
    category: 'performance',
    summary: '架空の用語その三。',
    body: ['サッシの話は本文にだけ書いてある。'],
    related: [],
  },
]

describe('searchGlossary', () => {
  it('空のクエリ・空白だけのクエリは全件を返す', () => {
    expect(searchGlossary(fixtures, '')).toEqual(fixtures)
    expect(searchGlossary(fixtures, '  　')).toEqual(fixtures)
  })

  it('用語名・読み・別名・一言定義の部分一致で絞る', () => {
    expect(searchGlossary(fixtures, 'アルファ').map((t) => t.id)).toEqual(['alpha'])
    expect(searchGlossary(fixtures, 'べーた').map((t) => t.id)).toEqual(['beta'])
    expect(searchGlossary(fixtures, 'α値').map((t) => t.id)).toEqual(['alpha'])
    expect(searchGlossary(fixtures, '架空のお金').map((t) => t.id)).toEqual(['beta'])
  })

  it('大文字小文字・全角半角（NFKC）・かなカナを同一視し、クエリ中の空白は無視する', () => {
    expect(searchGlossary(fixtures, 'alpha').map((t) => t.id)).toEqual(['alpha'])
    expect(searchGlossary(fixtures, 'ＡＬＰＨＡ').map((t) => t.id)).toEqual(['alpha'])
    expect(searchGlossary(fixtures, 'あるふぁ値').map((t) => t.id)).toEqual(['alpha'])
    expect(searchGlossary(fixtures, 'ｱﾙﾌｧ').map((t) => t.id)).toEqual(['alpha'])
    expect(searchGlossary(fixtures, 'ア ル ファ').map((t) => t.id)).toEqual(['alpha'])
  })

  it('本文（body）は検索対象にしない。一致が無ければ空配列', () => {
    expect(searchGlossary(fixtures, 'サッシ')).toEqual([])
    expect(searchGlossary(fixtures, '存在しない語')).toEqual([])
  })

  it('本物のデータでも引ける（UA → UA値）', () => {
    expect(searchGlossary(GLOSSARY, 'UA').map((t) => t.id)).toContain('ua-value')
    expect(searchGlossary(GLOSSARY, '').length).toBe(GLOSSARY.length)
  })
})

describe('groupByCategory', () => {
  it('分類は GLOSSARY_CATEGORIES の順、用語は元の順を保つ', () => {
    expect(groupByCategory(fixtures)).toEqual([
      { category: GLOSSARY_CATEGORIES[0], terms: [fixtures[0], fixtures[2]] },
      { category: GLOSSARY_CATEGORIES[3], terms: [fixtures[1]] },
    ])
  })

  it('該当が無い分類は落とす。空の入力は空の結果', () => {
    expect(groupByCategory([fixtures[1]]).map((g) => g.category.id)).toEqual(['money'])
    expect(groupByCategory([])).toEqual([])
  })
})

describe('findTerm', () => {
  it('id で引ける。知らない id は null', () => {
    expect(findTerm(fixtures, 'beta')?.term).toBe('ベータ')
    expect(findTerm(fixtures, 'nope')).toBeNull()
  })
})

describe('relatedTerms', () => {
  it('related の id を解決し、知らない id は落とす', () => {
    expect(relatedTerms(fixtures, fixtures[0]).map((t) => t.id)).toEqual(['beta'])
  })

  it('related が無い・空なら空配列', () => {
    expect(relatedTerms(fixtures, fixtures[1])).toEqual([])
    expect(relatedTerms(fixtures, fixtures[2])).toEqual([])
  })
})

describe('termIdForMetric', () => {
  it('候補カードの指標を用語 id に対応させる', () => {
    expect(termIdForMetric('ua')).toBe('ua-value')
    expect(termIdForMetric('c')).toBe('c-value')
    expect(termIdForMetric('seismic')).toBe('seismic-grade')
    expect(termIdForMetric('longTerm')).toBe('long-term-housing')
  })

  it('対応先の用語が実在する', () => {
    for (const metric of ['ua', 'c', 'seismic', 'longTerm'] as const) {
      expect(findTerm(GLOSSARY, termIdForMetric(metric))).not.toBeNull()
    }
  })
})

describe('GLOSSARY（データの体裁）', () => {
  const ids = new Set(GLOSSARY.map((t) => t.id))
  const categoryIds = new Set<CategoryId>(GLOSSARY_CATEGORIES.map((c) => c.id))

  it('id は重複しない', () => {
    expect(ids.size).toBe(GLOSSARY.length)
  })

  it('全分類に用語がある', () => {
    expect(groupByCategory(GLOSSARY).length).toBe(GLOSSARY_CATEGORIES.length)
  })

  it('一言定義は 60 字以内、本文は 2〜4 段落、分類は既知のもの', () => {
    for (const term of GLOSSARY) {
      expect({ id: term.id, ok: term.summary.length <= 60 }).toEqual({ id: term.id, ok: true })
      expect({ id: term.id, ok: term.body.length >= 2 && term.body.length <= 4 }).toEqual({
        id: term.id,
        ok: true,
      })
      expect(categoryIds.has(term.category)).toBe(true)
    }
  })

  it('関連語は 2〜4 件で、実在する別の用語を指す', () => {
    for (const term of GLOSSARY) {
      const related = term.related ?? []
      expect({ id: term.id, ok: related.length >= 2 && related.length <= 4 }).toEqual({
        id: term.id,
        ok: true,
      })
      for (const id of related) {
        expect({ from: term.id, to: id, ok: ids.has(id) && id !== term.id }).toEqual({
          from: term.id,
          to: id,
          ok: true,
        })
      }
    }
  })

  it('図解 id は用意された 14 種のどれか', () => {
    for (const term of GLOSSARY) {
      if (!term.diagram) continue
      expect({
        id: term.id,
        ok: (DIAGRAM_IDS as readonly string[]).includes(term.diagram),
      }).toEqual({ id: term.id, ok: true })
    }
  })

  it('読みと検索用の別名がある', () => {
    for (const term of GLOSSARY) {
      expect({ id: term.id, ok: Boolean(term.reading) }).toEqual({ id: term.id, ok: true })
      expect({ id: term.id, ok: (term.aliases ?? []).length > 0 }).toEqual({
        id: term.id,
        ok: true,
      })
    }
  })

  it('我が家への効き方が全語にある', () => {
    for (const term of GLOSSARY) {
      expect({ id: term.id, ok: Boolean(term.forUs) }).toEqual({ id: term.id, ok: true })
    }
  })

  it('本文の各段落は空でない', () => {
    for (const term of GLOSSARY) {
      const ok = term.body.every((paragraph) => paragraph.trim().length > 0)
      expect({ id: term.id, ok }).toEqual({ id: term.id, ok: true })
    }
  })

  it('numbers の label と value は空でない', () => {
    for (const term of GLOSSARY) {
      const ok = (term.numbers ?? []).every(
        (n) => n.label.trim().length > 0 && n.value.trim().length > 0,
      )
      expect({ id: term.id, ok }).toEqual({ id: term.id, ok: true })
    }
  })
})
