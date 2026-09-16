import { Avatar, Button, FileButton, Group, Stack, Text } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'

import { extractErrorMessage } from '../../lib/formError'
import { photoUrl } from '../../lib/photos'
import { deleteVendorFavicon } from '../../server/vendorImages'

// SVG は含めない（sniffFaviconType が判定しない・stored XSS 対策。src/lib/favicon.ts 参照）
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
 * 業者フォームの「サイトのアイコン」欄。一部の業者サイトは Cloudflare からのアクセスを
 * 一律拒否し（README「取得を拒否するサイトへの対応」参照）、公式サイトから自動取得できない。
 * この欄はその代替: ファイルを選んでアップロード・削除の 2 操作。
 *
 * アップロードすると favicon_source が 'manual' になり、以後の自動取得（設定画面の
 * 「アイコンを取得」・保存時のインライン取得）では上書きされない（「取り直す」= force は例外）。
 * 端末側の Canvas 縮小はしない: ICO はそもそも Canvas で扱えず、小さなアイコン画像を
 * 再エンコードする利点も薄いため、選んだファイルをそのまま送る（サーバー側で 512KB 上限・
 * マジックバイト判定。RepresentativePhotoField.tsx と違うのはこの点だけ）。
 * vendorId が無い（＝まだ保存していない新規業者）ときは操作できない旨だけ出す。
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
