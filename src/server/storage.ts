import { env } from 'cloudflare:workers'

/**
 * 写真の保管先（R2, バインディング PHOTOS）。公開バケットにはしない。
 * 読み書きするキーは src/lib/photos.ts の isManagedPhotoKey を通ったものだけ。
 */
export function getPhotosBucket(): R2Bucket {
  return env.PHOTOS
}

/** R2 の bucket.delete は 1 回に渡せるキー数の上限があるので 1000 件ずつに分ける */
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
 * アップロード（src/routes/api.photos.$.tsx の POST）が途中で失敗したときの
 * 後片付け。既に R2 へ置いたオブジェクトを消してから、常に originalError を
 * 投げ直す。片付け自体が失敗しても（bucket.delete が例外を投げても）それを
 * 呼び出し元に見せない: 片付け失敗はアップロード失敗という本来の理由を
 * 覆い隠してしまうので握りつぶす。
 */
export async function cleanupFailedUpload(
  keys: readonly string[],
  originalError: unknown,
  bucket: R2Bucket = getPhotosBucket(),
): Promise<never> {
  try {
    await deletePhotoObjects(keys, bucket)
  } catch {
    // 片付け失敗は無視: 呼び出し元には元のエラーを伝える
  }
  throw originalError
}
