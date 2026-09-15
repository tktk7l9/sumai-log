/**
 * DIAGRAMS の全 14 図を renderToStaticMarkup で描画し、Figure.tsx が保証すべき
 * 形（role/aria-label/viewBox/width/currentColor）とテーマ追従（hex・rgb() 不使用）、
 * 日本語ラベルの有無を確認する。ブラウザ・jsdom を使わない純粋な SSR テスト。
 */

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { DIAGRAM_IDS, type DiagramId } from '../../../content/glossary'
import { DIAGRAMS } from './index'

const JAPANESE_TEXT = /<text[^>]*>[^<]*[぀-ヿ一-鿿][^<]*<\/text>/

describe('DIAGRAMS', () => {
  it('has exactly the 14 ids from DIAGRAM_IDS, no more, no fewer', () => {
    const keys = Object.keys(DIAGRAMS) as DiagramId[]
    expect(keys).toHaveLength(DIAGRAM_IDS.length)
    expect(new Set(keys)).toEqual(new Set(DIAGRAM_IDS))
  })

  for (const id of DIAGRAM_IDS) {
    it(`${id}: renders a labelled, theme-following SVG figure`, () => {
      const Component = DIAGRAMS[id]
      expect(Component).toBeTypeOf('function')

      const markup = renderToStaticMarkup(<Component />)

      expect(markup).toContain('role="img"')
      expect(markup).toMatch(/aria-label="[^"]+"/)
      expect(markup).toContain('viewBox="0 0 320 200"')
      expect(markup).toContain('width="100%"')
      expect(markup).toContain('stroke="currentColor"')
      expect(markup).not.toMatch(/#[0-9a-fA-F]{3,6}\b/)
      expect(markup).not.toContain('rgb(')
      expect(markup).toMatch(JAPANESE_TEXT)
    })
  }
})
