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

export async function deletePhotoObjects(keys: readonly string[]): Promise<void> {
  if (keys.length === 0) return
  const bucket = getPhotosBucket()
  for (let i = 0; i < keys.length; i += DELETE_CHUNK_SIZE) {
    await bucket.delete(keys.slice(i, i + DELETE_CHUNK_SIZE))
  }
}
