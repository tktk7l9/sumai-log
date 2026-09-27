/**
 * Renders all 14 diagrams of DIAGRAMS with renderToStaticMarkup and checks the shape that
 * Figure.tsx must guarantee (role/aria-label/viewBox/width/currentColor), theme following
 * (no hex or rgb()), and the presence of Japanese labels. A pure SSR test that uses
 * neither a browser nor jsdom.
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
      expect(markup).toContain('viewBox="0 0 320 240"')
      expect(markup).toContain('width="100%"')
      expect(markup).toContain('stroke="currentColor"')
      expect(markup).not.toMatch(/#[0-9a-fA-F]{3,6}\b/)
      expect(markup).not.toContain('rgb(')
      expect(markup).toMatch(JAPANESE_TEXT)

      // The global constraint "text is font-size 12 to 14". Checks that every font-size
      // attribute is within the range.
      const sizes = [...markup.matchAll(/font-size="(\d+(?:\.\d+)?)"/g)].map((m) => Number(m[1]))
      expect(sizes.length, `${id}: font-size 属性が見つからない`).toBeGreaterThan(0)
      for (const size of sizes) {
        expect(size, `${id}: font-size=${size} が 12〜14 の範囲外`).toBeGreaterThanOrEqual(12)
        expect(size, `${id}: font-size=${size} が 12〜14 の範囲外`).toBeLessThanOrEqual(14)
      }
    })
  }
})
