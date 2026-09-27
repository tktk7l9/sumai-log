import { env } from 'cloudflare:workers'

/**
 * Where photos are stored (R2, binding PHOTOS). Never made a public bucket.
 * The only keys read or written are those that passed isManagedPhotoKey in src/lib/photos.ts.
 */
export function getPhotosBucket(): R2Bucket {
  return env.PHOTOS
}

/** R2 bucket.delete has a limit on the number of keys per call, so split into groups of 1000 */
const DELETE_CHUNK_SIZE = 1000

export async function deletePhotoObjects(
  keys: readonly string[],
  bucket: R2Bucket = getPhotosBucket(),
): Promise<void> {
  if (keys.length === 0) return
  for (let i = 0; i < keys.length; i += DELETE_CHUNK_SIZE) {
    await bucket.delete(keys.slice(i, i + DELETE_CHUNK_SIZE))
  }
}

/**
 * Cleanup for when an upload (POST of src/routes/api.photos.$.tsx) fails midway.
 * Deletes the objects already put in R2, then always rethrows originalError.
 * Even if the cleanup itself fails (even if bucket.delete throws), that is not shown to
 * the caller: a cleanup failure would mask the real reason, the upload failure, so it
 * is swallowed.
 */
export async function cleanupFailedUpload(
  keys: readonly string[],
  originalError: unknown,
  bucket: R2Bucket = getPhotosBucket(),
): Promise<never> {
  try {
    await deletePhotoObjects(keys, bucket)
  } catch {
    // Ignore a cleanup failure: the caller gets the original error
  }
  throw originalError
}
