import { Avatar, Button, FileButton, Group, Stack, Text } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'

import { extractErrorMessage } from '../../lib/formError'
import { photoUrl } from '../../lib/photos'
import { deleteVendorFavicon } from '../../server/vendorImages'

// SVG is not included (sniffFaviconType does not detect it; a measure against stored XSS.
// See src/lib/favicon.ts)
const ACCEPT = 'image/png,image/jpeg,image/webp,image/x-icon,image/vnd.microsoft.icon,.ico'

async function uploadFile(vendorId: string, file: File): Promise<void> {
  const form = new FormData()
  form.set('file', file)
  const res = await fetch(`/api/vendor-favicon/${vendorId}`, { method: 'POST', body: form })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `HTTP ${res.status}`)
  }
}

/**
 * The "サイトのアイコン" (Site icon) field of the vendor form. Some vendor sites reject
 * all access from Cloudflare (see the README section on handling sites that refuse
 * fetching), so the icon cannot be fetched automatically from the official site.
 * This field is the alternative: 2 operations, choose a file to upload, and delete.
 *
 * Uploading sets favicon_source to 'manual', and later automatic fetches ("アイコンを取得"
 * (Fetch icons) on the settings screen, and the inline fetch on save) do not overwrite it
 * ("取り直す" (Refetch) = force is the exception).
 * No Canvas downscaling on the device: ICO cannot be handled by Canvas in the first place,
 * and re-encoding a small icon image has little benefit, so the chosen file is sent as is
 * (the server side applies a 512KB limit and magic byte detection. This is the only
 * difference from RepresentativePhotoField.tsx).
 * When there is no vendorId (= a new vendor not saved yet), it only shows that the
 * operations are unavailable.
 */
export function FaviconField({
  vendorId,
  faviconKey,
}: {
  vendorId: string | null
  faviconKey: string | null
}) {
  const router = useRouter()
  const removeFavicon = useServerFn(deleteVendorFavicon)
  const [uploading, setUploading] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleFile(file: File | null) {
    if (!file || !vendorId) return
    setUploading(true)
    try {
      await uploadFile(vendorId, file)
      await router.invalidate()
      notifications.show({ message: 'サイトのアイコンを更新しました' })
    } catch (error) {
      notifications.show({
        message: error instanceof Error ? error.message : 'アップロードできませんでした',
        color: 'red',
      })
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete() {
    if (!vendorId) return
    setDeleting(true)
    try {
      const result = await removeFavicon({ data: { vendorId } })
      if (!result.ok) {
        notifications.show({ message: result.error, color: 'red' })
        return
      }
      await router.invalidate()
      notifications.show({ message: 'サイトのアイコンを削除しました' })
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
          サイトのアイコン
        </Text>
        <Text size="xs" c="dimmed">
          保存するとアイコンを手動アップロードできます
        </Text>
      </Stack>
    )
  }

  return (
    <Stack gap="xs">
      <Text size="sm" fw={500}>
        サイトのアイコン
      </Text>
      <Group gap="sm" align="center" wrap="nowrap">
        <Avatar
          src={faviconKey ? photoUrl(faviconKey) : null}
          size={32}
          radius="xs"
          color="gray"
          alt=""
        />
        <Stack gap={4}>
          <FileButton onChange={handleFile} accept={ACCEPT}>
            {(props) => (
              <Button {...props} variant="default" size="xs" loading={uploading}>
                画像を選ぶ
              </Button>
            )}
          </FileButton>
          {faviconKey ? (
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
      <Text size="xs" c="dimmed">
        自動取得できないサイト（Cloudflare
        からのアクセスを拒否するサーバー）用。PNG/JPEG/WebP/ICO・512 KB まで
      </Text>
    </Stack>
  )
}
