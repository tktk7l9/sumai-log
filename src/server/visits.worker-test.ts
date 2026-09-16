import { describe, expect, it } from 'vitest'

import { reorderPhotosInput } from './visits.schema'

/**
 * saveVisit/reorderPhotos は createServerFn でラップされているため、素の vitest
 * workers テストから直接呼ぶと落ちる（詳細は events.worker-test.ts と同じ）。
 * 実質的な検証は validator である reorderPhotosInput 自体を見れば足りるので、
 * ここでは safeParse を直接確認する。「本当にその visit に属する写真か」の検証は
 * D1 が要るため src/server/repository/photos.worker-test.ts の reorderPhotoRows 側で見る。
 */
const visitId = '11111111-1111-4111-8111-111111111111'
const photoA = '22222222-2222-4222-8222-222222222222'
const photoB = '33333333-3333-4333-8333-333333333333'

describe('reorderPhotosInput', () => {
  it('visitId と重複の無い photoIds を通す', () => {
    const result = reorderPhotosInput.safeParse({ visitId, photoIds: [photoB, photoA] })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.photoIds).toEqual([photoB, photoA])
    }
  })

  it('photoIds が空だと拒否する（写真が指定されていません）', () => {
    const result = reorderPhotosInput.safeParse({ visitId, photoIds: [] })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('写真が指定されていません')
    }
  })

  it('photoIds に同じ id が重複していると拒否する（同じ写真が重複して指定されています）', () => {
    const result = reorderPhotosInput.safeParse({ visitId, photoIds: [photoA, photoA] })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('同じ写真が重複して指定されています')
    }
  })

  it('id の形が不正なら拒否する', () => {
    const result = reorderPhotosInput.safeParse({ visitId, photoIds: ['not-a-uuid'] })
    expect(result.success).toBe(false)
  })

  it('visitId が無ければ拒否する', () => {
    const result = reorderPhotosInput.safeParse({ photoIds: [photoA] })
    expect(result.success).toBe(false)
  })
})
