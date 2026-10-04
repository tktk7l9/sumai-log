import { describe, expect, it } from 'vitest'

import { formatDuration, formatViews } from './format'

describe('formatDuration', () => {
  it.each([
    [0, '0:00'],
    [5, '0:05'],
    [75, '1:15'],
    [599.6, '10:00'],
    [3725, '1:02:05'],
    [-3, '0:00'],
  ])('%s s -> %s', (seconds, text) => {
    expect(formatDuration(seconds)).toBe(text)
  })
})

describe('formatViews', () => {
  it.each([
    [0, '0回'],
    [9999, '9999回'],
    [10_000, '1万回'],
    [12_345, '1.2万回'],
    [1_234_567, '123.5万回'],
  ])('%s -> %s', (views, text) => {
    expect(formatViews(views)).toBe(text)
  })
})
