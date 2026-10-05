import { describe, expect, it, vi } from 'vitest'

import { cleanupFailedUpload } from './storage'

/**
 * The POST handler of `/api/photos` (src/routes/api.photos.$.tsx) does "cleanup of the
 * R2 objects put so far" inside the catch for a failed put to R2 or insertPhoto, and
 * rethrows the original error after the cleanup. The route handler itself cannot be called
 * without the server runtime, so that cleanup logic is extracted into cleanupFailedUpload
 * in storage.ts and verified directly here (behavior is unchanged: whether the cleanup
 * succeeds or fails, what the caller sees is always "the original error" of the upload failure).
 */
function fakeBucket(deleteImpl: (keys: string | string[]) => Promise<void>) {
  const del = vi.fn(deleteImpl)
  return { bucket: { delete: del } as unknown as R2Bucket, del }
}

describe('cleanupFailedUpload', () => {
  it('even when the cleanup succeeds, what is rethrown is the original error', async () => {
    const originalError = new Error('put failed')
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

  it('even when the cleanup itself fails, swallows the cleanup failure and rethrows the original error', async () => {
    const originalError = new Error('put failed')
    const { bucket, del } = fakeBucket(async () => {
      throw new Error('R2 delete failed too')
    })
    await expect(
      cleanupFailedUpload(
        ['photos/a/x-display.jpg', 'photos/a/x-thumb.jpg'],
        originalError,
        bucket,
      ),
    ).rejects.toBe(originalError)
    // The cleanup was called (= the keys were passed). Only its inside failed
    expect(del).toHaveBeenCalledWith(['photos/a/x-display.jpg', 'photos/a/x-thumb.jpg'])
  })
})
