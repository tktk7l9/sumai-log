import { Avatar, Button, FileButton, Group, Stack, Text, TextInput } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'

import { extractErrorMessage } from '../../lib/formError'
import { fitWithin } from '../../lib/imageResize'
import { photoUrl, representativeThumbKeyFromDisplayKey } from '../../lib/photos'
import {
  deleteRepresentativePhoto,
  importRepresentativePhotoFromUrl,
} from '../../server/vendorImages'

/**
 * JPEGs of 800px for display and 240px for the thumbnail. Same style as
 * src/components/visits/PhotoUploader.tsx
 */
async function toJpeg(
  bitmap: ImageBitmap,
  maxEdge: number,
  quality: number,
): Promise<{ blob: Blob; width: number; height: number }> {
  const { width, height } = fitWithin(bitmap.width, bitmap.height, maxEdge)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas')
  ctx.drawImage(bitmap, 0, 0, width, height)
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', quality),
  )
  if (!blob) throw new Error('toBlob')
  return { blob, width, height }
}

async function uploadFile(vendorId: string, file: File): Promise<void> {
  const bitmap = await createImageBitmap(file)
  try {
    const display = await toJpeg(bitmap, 800, 0.85)
    const thumb = await toJpeg(bitmap, 240, 0.85)
    const form = new FormData()
    form.set('display', display.blob, 'display.jpg')
    form.set('thumb', thumb.blob, 'thumb.jpg')
    form.set('width', String(display.width))
    form.set('height', String(display.height))
    const res = await fetch(`/api/vendor-photos/${vendorId}`, { method: 'POST', body: form })
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      throw new Error(body.error ?? `HTTP ${res.status}`)
    }
  } finally {
    bitmap.close()
  }
}

/**
 * The "代表者の写真" (Representative's photo) field of the vendor form. 3 operations:
 * choose a file (downscaled to 800px/240px JPEGs by Canvas on the device, then POSTed to
 * /api/vendor-photos/<vendorId>), import from a URL (the server side has no Canvas, so it
 * is saved at the original size. A known limitation of the design), and delete.
 * When there is no vendorId (= a new vendor not saved yet), it only shows that the
 * operations are unavailable.
 *
 * Showing the thumbnail needs `representativePhotoKey` (the actual value of
 * vendors.representative_photo_key): the key now includes a stamp (a measure against
 * immutable caching), so the current key cannot be built from vendorId alone. The thumb
 * key is derived by replacing the tail of the saved display key.
 */
export function RepresentativePhotoField({
  vendorId,
  representativePhotoKey,
}: {
  vendorId: string | null
  representativePhotoKey: string | null
}) {
  const hasPhoto = representativePhotoKey != null
  const router = useRouter()
  const importFromUrl = useServerFn(importRepresentativePhotoFromUrl)
  const removePhoto = useServerFn(deleteRepresentativePhoto)
  const [uploading, setUploading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [url, setUrl] = useState('')

  async function handleFile(file: File | null) {
    if (!file || !vendorId) return
    setUploading(true)
    try {
      await uploadFile(vendorId, file)
      await router.invalidate()
      notifications.show({ message: '代表者の写真を更新しました' })
    } catch (error) {
      notifications.show({
        message: error instanceof Error ? error.message : 'アップロードできませんでした',
        color: 'red',
      })
    } finally {
      setUploading(false)
    }
  }

  async function handleImport() {
    if (!vendorId || !url.trim()) return
    setImporting(true)
    try {
      const result = await importFromUrl({ data: { vendorId, url: url.trim() } })
      if (!result.ok) {
        notifications.show({ message: result.error, color: 'red' })
        return
      }
      setUrl('')
      await router.invalidate()
      notifications.show({ message: '代表者の写真を取り込みました' })
    } catch (error) {
      notifications.show({ message: extractErrorMessage(error), color: 'red' })
    } finally {
      setImporting(false)
    }
  }

  async function handleDelete() {
    if (!vendorId) return
    setDeleting(true)
    try {
      const result = await removePhoto({ data: { vendorId } })
      if (!result.ok) {
        notifications.show({ message: result.error, color: 'red' })
        return
      }
      await router.invalidate()
      notifications.show({ message: '代表者の写真を削除しました' })
    } catch (error) {
      notifications.show({ message: extractErrorMessage(error), color: 'red' })
    } finally {
      setDeleting(false)
    }
  }

  if (!vendorId) {
    return (
      <Stack gap={4}>
        <Text size="sm" fw={500}>
          代表者の写真
        </Text>
        <Text size="xs" c="dimmed">
          保存すると写真を追加できます
        </Text>
      </Stack>
    )
  }

  return (
    <Stack gap="xs">
      <Text size="sm" fw={500}>
        代表者の写真
      </Text>
      <Group gap="sm" align="center" wrap="nowrap">
        <Avatar
          src={
            representativePhotoKey
              ? photoUrl(representativeThumbKeyFromDisplayKey(representativePhotoKey))
              : null
          }
          size={64}
          radius="50%"
          color="gray"
          alt=""
        />
        <Stack gap={4}>
          <FileButton onChange={handleFile} accept="image/*">
            {(props) => (
              <Button {...props} variant="default" size="xs" loading={uploading}>
                写真を選ぶ
              </Button>
            )}
          </FileButton>
          {hasPhoto ? (
            <Button
              variant="subtle"
              color="red"
              size="xs"
              onClick={handleDelete}
              loading={deleting}
            >
              削除
            </Button>
          ) : null}
        </Stack>
      </Group>
      <Group gap="xs" wrap="nowrap" align="flex-end">
        <TextInput
          label="URL から取り込む"
          placeholder="https://example.com/staff/president.jpg"
          value={url}
          onChange={(e) => setUrl(e.currentTarget.value)}
          style={{ flex: 1 }}
        />
        <Button variant="default" onClick={handleImport} loading={importing} disabled={!url.trim()}>
          取り込む
        </Button>
      </Group>
    </Stack>
  )
}
