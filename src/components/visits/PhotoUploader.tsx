import { Button, FileButton, Group, Progress, Stack, Text } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { Camera } from 'lucide-react'
import { useState } from 'react'

import { fitWithin } from '../../lib/imageResize'
import { MAX_PHOTOS_PER_UPLOAD } from '../../lib/photos'

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

/** 1 枚を 1600px と 400px に縮小して送る。EXIF の向きは createImageBitmap が既定で反映する */
async function uploadOne(visitId: string, file: File): Promise<void> {
  const bitmap = await createImageBitmap(file)
  try {
    const display = await toJpeg(bitmap, 1600, 0.8)
    const thumb = await toJpeg(bitmap, 400, 0.8)
    const form = new FormData()
    form.set('visitId', visitId)
    form.set('display', display.blob, 'display.jpg')
    form.set('thumb', thumb.blob, 'thumb.jpg')
    form.set('width', String(display.width))
    form.set('height', String(display.height))
    const res = await fetch('/api/photos', { method: 'POST', body: form })
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      throw new Error(body.error ?? `HTTP ${res.status}`)
    }
  } finally {
    bitmap.close()
  }
}

export function PhotoUploader({
  visitId,
  onUploaded,
}: {
  visitId: string
  onUploaded: () => void
}) {
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)

  async function handleFiles(files: File[]) {
    if (files.length === 0) return
    const batch = files.slice(0, MAX_PHOTOS_PER_UPLOAD)
    if (files.length > batch.length) {
      notifications.show({
        message: `1 回に上げられるのは ${MAX_PHOTOS_PER_UPLOAD} 枚までです。先頭 ${batch.length} 枚を送ります。`,
        color: 'orange',
      })
    }
    setProgress({ done: 0, total: batch.length })
    let failed = 0
    let firstError: string | undefined
    for (const [i, file] of batch.entries()) {
      try {
        await uploadOne(visitId, file)
      } catch (error) {
        failed += 1
        if (firstError === undefined) {
          firstError = error instanceof Error ? error.message : String(error)
        }
      }
      setProgress({ done: i + 1, total: batch.length })
    }
    setProgress(null)
    notifications.show({
      message:
        failed === 0
          ? `${batch.length} 枚を追加しました`
          : `${batch.length - failed} 枚を追加、${failed} 枚は失敗しました（${firstError}）`,
      color: failed === 0 ? undefined : 'red',
    })
    onUploaded()
  }

  return (
    <Stack gap="xs">
      <Group>
        <FileButton onChange={handleFiles} accept="image/*" multiple>
          {(props) => (
            <Button
              {...props}
              leftSection={<Camera size={18} aria-hidden />}
              loading={progress !== null}
            >
              写真を追加
            </Button>
          )}
        </FileButton>
      </Group>
      {progress ? (
        <Stack gap={4}>
          <Progress value={(progress.done / progress.total) * 100} />
          <Text size="xs" c="dimmed">
            {progress.done} / {progress.total} 枚
          </Text>
        </Stack>
      ) : null}
    </Stack>
  )
}
