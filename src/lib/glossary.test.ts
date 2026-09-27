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
  pickRandomTerm,
  termIdForMetric,
} from './glossary'

/**
 * The pure functions are verified only with these fictional terms (no dependency on the real
 * data)
 */
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
  it('returns everything for an empty query or a whitespace-only query', () => {
    expect(searchGlossary(fixtures, '')).toEqual(fixtures)
    expect(searchGlossary(fixtures, '  　')).toEqual(fixtures)
  })

  it('narrows by partial match on term name, reading, alias and one-line definition', () => {
    expect(searchGlossary(fixtures, 'アルファ').map((t) => t.id)).toEqual(['alpha'])
    expect(searchGlossary(fixtures, 'べーた').map((t) => t.id)).toEqual(['beta'])
    expect(searchGlossary(fixtures, 'α値').map((t) => t.id)).toEqual(['alpha'])
    expect(searchGlossary(fixtures, '架空のお金').map((t) => t.id)).toEqual(['beta'])
  })

  it('treats upper/lower case, full/half width (NFKC) and hiragana/katakana as equal, and ignores whitespace in the query', () => {
    expect(searchGlossary(fixtures, 'alpha').map((t) => t.id)).toEqual(['alpha'])
    expect(searchGlossary(fixtures, 'ＡＬＰＨＡ').map((t) => t.id)).toEqual(['alpha'])
    expect(searchGlossary(fixtures, 'あるふぁ値').map((t) => t.id)).toEqual(['alpha'])
    expect(searchGlossary(fixtures, 'ｱﾙﾌｧ').map((t) => t.id)).toEqual(['alpha'])
    expect(searchGlossary(fixtures, 'ア ル ファ').map((t) => t.id)).toEqual(['alpha'])
  })

  it('does not search the body. Returns an empty array when nothing matches', () => {
    expect(searchGlossary(fixtures, 'サッシ')).toEqual([])
    expect(searchGlossary(fixtures, '存在しない語')).toEqual([])
  })

  it('also finds terms in the real data (UA -> "UA値" (UA value))', () => {
    expect(searchGlossary(GLOSSARY, 'UA').map((t) => t.id)).toContain('ua-value')
    expect(searchGlossary(GLOSSARY, '').length).toBe(GLOSSARY.length)
  })
})

describe('groupByCategory', () => {
  it('orders categories by GLOSSARY_CATEGORIES and keeps the original order of terms', () => {
    expect(groupByCategory(fixtures)).toEqual([
      { category: GLOSSARY_CATEGORIES[0], terms: [fixtures[0], fixtures[2]] },
      { category: GLOSSARY_CATEGORIES[3], terms: [fixtures[1]] },
    ])
  })

  it('drops categories with no match. Empty input gives an empty result', () => {
    expect(groupByCategory([fixtures[1]]).map((g) => g.category.id)).toEqual(['money'])
    expect(groupByCategory([])).toEqual([])
  })
})

describe('findTerm', () => {
  it('looks up by id. An unknown id gives null', () => {
    expect(findTerm(fixtures, 'beta')?.term).toBe('ベータ')
    expect(findTerm(fixtures, 'nope')).toBeNull()
  })
})

describe('relatedTerms', () => {
  it('resolves the ids in related and drops unknown ids', () => {
    expect(relatedTerms(fixtures, fixtures[0]).map((t) => t.id)).toEqual(['beta'])
  })

  it('returns an empty array when related is missing or empty', () => {
    expect(relatedTerms(fixtures, fixtures[1])).toEqual([])
    expect(relatedTerms(fixtures, fixtures[2])).toEqual([])
  })
})

describe('termIdForMetric', () => {
  it('maps the metrics on a candidate card to term ids', () => {
    expect(termIdForMetric('ua')).toBe('ua-value')
    expect(termIdForMetric('c')).toBe('c-value')
    expect(termIdForMetric('seismic')).toBe('seismic-grade')
    expect(termIdForMetric('longTerm')).toBe('long-term-housing')
  })

  it('maps to terms that actually exist', () => {
    for (const metric of ['ua', 'c', 'seismic', 'longTerm'] as const) {
      expect(findTerm(GLOSSARY, termIdForMetric(metric))).not.toBeNull()
    }
  })
})

describe('GLOSSARY (shape of the data)', () => {
  const ids = new Set(GLOSSARY.map((t) => t.id))

  it('has 90 terms and 14 diagrams, and every diagram is used by at least 1 term', () => {
    expect(GLOSSARY).toHaveLength(90)
    expect(DIAGRAM_IDS).toHaveLength(14)
    const used = new Set(GLOSSARY.map((t) => t.diagram).filter(Boolean))
    expect([...DIAGRAM_IDS].filter((d) => !used.has(d))).toEqual([])
  })

  it('has no duplicate label among the reference numbers within a term (used as key)', () => {
    for (const term of GLOSSARY) {
      const labels = (term.numbers ?? []).map((n) => n.label)
      expect({ id: term.id, ok: new Set(labels).size === labels.length }).toEqual({
        id: term.id,
        ok: true,
      })
    }
  })
  const categoryIds = new Set<CategoryId>(GLOSSARY_CATEGORIES.map((c) => c.id))

  it('has no duplicate ids', () => {
    expect(ids.size).toBe(GLOSSARY.length)
  })

  it('has terms in every category', () => {
    expect(groupByCategory(GLOSSARY).length).toBe(GLOSSARY_CATEGORIES.length)
  })

  it('has a one-line definition within 60 characters, a body of 2-4 paragraphs and a known category', () => {
    for (const term of GLOSSARY) {
      expect({ id: term.id, ok: term.summary.length <= 60 }).toEqual({ id: term.id, ok: true })
      expect({ id: term.id, ok: term.body.length >= 2 && term.body.length <= 4 }).toEqual({
        id: term.id,
        ok: true,
      })
      expect(categoryIds.has(term.category)).toBe(true)
    }
  })

  it('has 2-4 related terms that point to other existing terms', () => {
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

  it('has a diagram id that is one of the 14 prepared kinds', () => {
    for (const term of GLOSSARY) {
      if (!term.diagram) continue
      expect({
        id: term.id,
        ok: (DIAGRAM_IDS as readonly string[]).includes(term.diagram),
      }).toEqual({ id: term.id, ok: true })
    }
  })

  it('has a reading and aliases for search', () => {
    for (const term of GLOSSARY) {
      expect({ id: term.id, ok: Boolean(term.reading) }).toEqual({ id: term.id, ok: true })
      expect({ id: term.id, ok: (term.aliases ?? []).length > 0 }).toEqual({
        id: term.id,
        ok: true,
      })
    }
  })

  it('has the effect on our home for every term', () => {
    for (const term of GLOSSARY) {
      expect({ id: term.id, ok: Boolean(term.forUs) }).toEqual({ id: term.id, ok: true })
    }
  })

  it('has no empty paragraph in the body', () => {
    for (const term of GLOSSARY) {
      const ok = term.body.every((paragraph) => paragraph.trim().length > 0)
      expect({ id: term.id, ok }).toEqual({ id: term.id, ok: true })
    }
  })

  it('has non-empty label and value in numbers', () => {
    for (const term of GLOSSARY) {
      const ok = (term.numbers ?? []).every(
        (n) => n.label.trim().length > 0 && n.value.trim().length > 0,
      )
      expect({ id: term.id, ok }).toEqual({ id: term.id, ok: true })
    }
  })
})

describe('pickRandomTerm', () => {
  it('picks the index with a random number. 0 gives the first, close to 1 gives the last, empty gives null', () => {
    expect(pickRandomTerm(fixtures, () => 0)).toBe(fixtures[0])
    expect(pickRandomTerm(fixtures, () => 0.999999)).toBe(fixtures[fixtures.length - 1])
    // Does not go out of range even when 1 arrives through rounding error
    expect(pickRandomTerm(fixtures, () => 1)).toBe(fixtures[fixtures.length - 1])
    expect(pickRandomTerm([], () => 0)).toBeNull()
  })
  it('returns 1 term from the real data with the default random too', () => {
    expect(GLOSSARY).toContain(pickRandomTerm(GLOSSARY))
  })
})
