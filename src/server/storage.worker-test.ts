import { describe, expect, it, vi } from 'vitest'

import { cleanupFailedUpload } from './storage'

/**
 * `/api/photos` の POST ハンドラ（src/routes/api.photos.$.tsx）は、R2 への put や
 * insertPhoto が失敗した catch の中で「途中まで置いた R2 オブジェクトの片付け」を
 * 行い、片付け後に元のエラーを投げ直す。ルートハンドラ自体はサーバーランタイムが
 * 無いと呼べないため、その片付けロジックを storage.ts の cleanupFailedUpload に
 * 切り出してここで直接検証する（振る舞いは元のまま: 片付けが成功しても失敗しても、
 * 呼び出し元に見えるのは常にアップロード失敗の「元のエラー」）。
 */
function fakeBucket(deleteImpl: (keys: string | string[]) => Promise<void>) {
  const del = vi.fn(deleteImpl)
  return { bucket: { delete: del } as unknown as R2Bucket, del }
}

describe('cleanupFailedUpload', () => {
  it('片付けが成功しても、投げ直されるのは元のエラー', async () => {
    const originalError = new Error('put に失敗')
    const { bucket, del } = fakeBucket(async () => {})
    await expect(
      cleanupFailedUpload(
        ['photos/a/x-display.jpg', 'photos/a/x-thumb.jpg'],
        originalError,
        bucket,
      ),
    ).rejects.toBe(originalError)
    expect(del).toHaveBeenCalledWith(['photos/a/x-display.jpg', 'photos/a/x-thumb.jpg'])
  })

  it('片付け自体が失敗しても、片付けの失敗は握りつぶして元のエラーを投げ直す', async () => {
    const originalError = new Error('put に失敗')
    const { bucket, del } = fakeBucket(async () => {
      throw new Error('R2 delete も失敗')
    })
    await expect(
      cleanupFailedUpload(
        ['photos/a/x-display.jpg', 'photos/a/x-thumb.jpg'],
        originalError,
        bucket,
      ),
    ).rejects.toBe(originalError)
    // 片付けは呼ばれている（＝キーは渡っている）。失敗したのはその中身だけ
    expect(del).toHaveBeenCalledWith(['photos/a/x-display.jpg', 'photos/a/x-thumb.jpg'])
  })
})
