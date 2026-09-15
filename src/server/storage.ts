import { env } from 'cloudflare:workers'

/**
 * 写真の保管先（R2, バインディング PHOTOS）。公開バケットにはしない。
 * 読み書きするキーは src/lib/photos.ts の isManagedPhotoKey を通ったものだけ。
 */
export function getPhotosBucket(): R2Bucket {
  return env.PHOTOS
}

export async function deletePhotoObjects(keys: readonly string[]): Promise<void> {
  if (keys.length === 0) return
  await getPhotosBucket().delete([...keys])
}
