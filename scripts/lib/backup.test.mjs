import assert from 'node:assert/strict'
import { test } from 'node:test'

import { r2KeysOf } from './backup.mjs'

const V = '11111111-1111-4111-8111-111111111111'
const P = '22222222-2222-4222-8222-222222222222'

test('collects photo keys, both representative keys and the favicon, once each', () => {
  const keys = r2KeysOf({
    photos: [
      { display_key: `photos/${V}/${P}-display.jpg`, thumb_key: `photos/${V}/${P}-thumb.jpg` },
      { display_key: `photos/${V}/${P}-display.jpg`, thumb_key: `photos/${V}/${P}-thumb.jpg` },
    ],
    vendors: [
      {
        representative_photo_key: `vendors/${V}/representative-1abc2d-display.jpg`,
        favicon_key: null,
      },
      { representative_photo_key: null, favicon_key: `vendors/${P}/favicon-2bcd3e.png` },
    ],
  })
  assert.deepEqual(keys, [
    `photos/${V}/${P}-display.jpg`,
    `photos/${V}/${P}-thumb.jpg`,
    `vendors/${V}/representative-1abc2d-display.jpg`,
    `vendors/${V}/representative-1abc2d-thumb.jpg`,
    `vendors/${P}/favicon-2bcd3e.png`,
  ])
})

test('is empty without rows', () => {
  assert.deepEqual(r2KeysOf({}), [])
})
