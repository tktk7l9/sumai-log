import { describe, expect, it } from 'vitest'

import { fitWithin } from './imageResize'

describe('fitWithin', () => {
  it('長辺を上限に収め、縦横比を保ち、拡大しない', () => {
    expect(fitWithin(4032, 3024, 1600)).toEqual({ width: 1600, height: 1200 })
    expect(fitWithin(3024, 4032, 400)).toEqual({ width: 300, height: 400 })
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 })
    expect(fitWithin(1000, 333, 100)).toEqual({ width: 100, height: 33 })
  })
})
