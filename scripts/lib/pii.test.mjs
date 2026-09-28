import assert from 'node:assert/strict'
import { test } from 'node:test'

import { ALLOWED_COORDINATES, findCoordinateLines } from './pii.mjs'

// Made-up values: inside the range the detector looks at, pointing at no place of interest.
// LNG is assembled from parts so that this file itself does not contain a pair.
const LAT = '34.111111'
const LNG = ['135', '222222'].join('.')

test('reports a decimal pair written on one line', () => {
  assert.deepEqual(findCoordinateLines(`// ${LAT}, ${LNG}`), [1])
})

test('reports the line where the pair starts', () => {
  assert.deepEqual(findCoordinateLines(`a\nb\nconst p = '${LAT},${LNG}'\n`), [3])
})

test('reports a pair written as object properties', () => {
  assert.deepEqual(findCoordinateLines(`{ lat: ${LAT}, lng: ${LNG} }`), [1])
})

test('reports a pair split over two lines', () => {
  assert.deepEqual(findCoordinateLines(`lat: ${LAT},\n  lng: ${LNG},`), [1])
})

test('reports every pair in the content', () => {
  assert.deepEqual(findCoordinateLines(`${LAT}, ${LNG}\n\n${LAT} ${LNG}`), [1, 3])
})

test('does not report the values on the allow list', () => {
  for (const allowed of ALLOWED_COORDINATES) {
    assert.deepEqual(findCoordinateLines(`// ${allowed}`), [])
    assert.deepEqual(findCoordinateLines(`// ${allowed.replace(',', ', ')}`), [])
  }
})

test('accepts a custom allow list', () => {
  assert.deepEqual(findCoordinateLines(`${LAT}, ${LNG}`, [`${LAT}, ${LNG}`]), [])
})

test('does not report coarse values with fewer than 5 decimals', () => {
  assert.deepEqual(findCoordinateLines('35.5, 139.7'), [])
  assert.deepEqual(findCoordinateLines('35.6812, 139.7671'), [])
})

test('does not report values outside Japan', () => {
  assert.deepEqual(findCoordinateLines('51.507351, -0.127758'), [])
  assert.deepEqual(findCoordinateLines('12.345678, 123.456789'), [])
})

test('does not report a latitude alone or a longitude alone', () => {
  assert.deepEqual(findCoordinateLines(`${LAT}`), [])
  assert.deepEqual(findCoordinateLines(`${LNG}`), [])
})

test('does not report two numbers with another number between them', () => {
  assert.deepEqual(findCoordinateLines(`${LAT}, 7, ${LNG}`), [])
})

test('does not report numbers that are part of a longer number', () => {
  assert.deepEqual(findCoordinateLines(`1${LAT}, ${LNG}`), [])
  assert.deepEqual(findCoordinateLines(`0.${LAT}, ${LNG}`), [])
})

test('does not report SVG path data', () => {
  assert.deepEqual(findCoordinateLines('M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63'), [])
})
