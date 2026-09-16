import {
  ActionIcon,
  Button,
  Group,
  Image,
  Modal,
  SimpleGrid,
  Stack,
  Text,
  UnstyledButton,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { ArrowLeftRight, ChevronLeft, ChevronRight, Trash2, X } from 'lucide-react'
import { useEffect, useState, type TouchEvent } from 'react'

import type { Photo } from '../../db/schema'
import { photoUrl } from '../../lib/photos'

/** スワイプと判定する最小の横移動量（px）。これ未満はタップ・縦スクロールとして無視する */
const SWIPE_THRESHOLD_PX = 40

export function PhotoGrid({
  photos,
  onDelete,
  onReorder,
}: {
  photos: Photo[]
  onDelete: (p: Photo) => void
  onReorder: (photoIds: string[]) => Promise<void>
}) {
  const [open, setOpen] = useState<Photo | null>(null)
  const [reordering, setReordering] = useState(false)
  const [order, setOrder] = useState<Photo[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [touchStartX, setTouchStartX] = useState<number | null>(null)

  // 写真が消えた等で並びが変わったら、並び替え中でなければ表示は常に最新の photos に従う
  const displayed = reordering && order ? order : photos

  const openIndex = open ? photos.findIndex((p) => p.id === open.id) : -1

  // ビューアを開いている間だけキーボードの ← → で前後に移動する
  useEffect(() => {
    if (open === null || photos.length <= 1) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft') showRelative(-1)
      else if (e.key === 'ArrowRight') showRelative(1)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, photos])

  if (photos.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        写真はまだありません。
      </Text>
    )
  }

  function showRelative(delta: number) {
    if (openIndex < 0 || photos.length === 0) return
    const len = photos.length
    // 負数を含む % は JS では負のまま返るので、+ len してから再度 % len で
    // 0〜len-1 に丸める（端で ← / → を繰り返すと両端をループする）
    const next = ((openIndex + delta) % len) + len
    setOpen(photos[next % len])
  }

  function startReordering() {
    setOrder([...photos])
    setReordering(true)
  }

  function moveLeft(index: number) {
    if (!order || index <= 0) return
    const next = [...order]
    ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
    setOrder(next)
  }

  function moveRight(index: number) {
    if (!order || index >= order.length - 1) return
    const next = [...order]
    ;[next[index], next[index + 1]] = [next[index + 1], next[index]]
    setOrder(next)
  }

  async function finishReordering() {
    if (!order) return
    setSaving(true)
    try {
      await onReorder(order.map((p) => p.id))
      setReordering(false)
      setOrder(null)
    } catch {
      notifications.show({ message: '並び替えを保存できませんでした', color: 'red' })
    } finally {
      setSaving(false)
    }
  }

  function handleTouchStart(e: TouchEvent) {
    setTouchStartX(e.touches[0]?.clientX ?? null)
  }

  function handleTouchEnd(e: TouchEvent) {
    if (touchStartX === null) return
    const endX = e.changedTouches[0]?.clientX ?? touchStartX
    const diff = touchStartX - endX
    setTouchStartX(null)
    if (Math.abs(diff) < SWIPE_THRESHOLD_PX) return
    // 左スワイプ（指が左へ）= 次の写真、右スワイプ = 前の写真
    showRelative(diff > 0 ? 1 : -1)
  }

  return (
    <>
      {photos.length >= 2 ? (
        <Group justify="flex-end">
          {reordering ? (
            <Button size="xs" onClick={finishReordering} loading={saving}>
              完了
            </Button>
          ) : (
            <ActionIcon
              variant="default"
              aria-label="並び替え"
              onClick={startReordering}
              disabled={saving}
            >
              <ArrowLeftRight size={16} />
            </ActionIcon>
          )}
        </Group>
      ) : null}
      <SimpleGrid cols={{ base: 3, sm: 4 }} spacing="xs">
        {displayed.map((p, index) =>
          reordering ? (
            <Stack key={p.id} gap={4}>
              <Image
                src={photoUrl(p.thumbKey)}
                alt={p.caption ?? '見学の写真'}
                radius="sm"
                fit="cover"
                h={110}
              />
              <Group gap={4} justify="center">
                <ActionIcon
                  variant="default"
                  size="sm"
                  aria-label="前へ"
                  disabled={index === 0}
                  onClick={() => moveLeft(index)}
                >
                  <ChevronLeft size={14} />
                </ActionIcon>
                <ActionIcon
                  variant="default"
                  size="sm"
                  aria-label="後ろへ"
                  disabled={index === displayed.length - 1}
                  onClick={() => moveRight(index)}
                >
                  <ChevronRight size={14} />
                </ActionIcon>
              </Group>
            </Stack>
          ) : (
            <UnstyledButton
              key={p.id}
              type="button"
              aria-label="写真を大きく表示"
              onClick={() => setOpen(p)}
              style={{ display: 'block', width: '100%' }}
            >
              <Image
                src={photoUrl(p.thumbKey)}
                alt={p.caption ?? '見学の写真'}
                radius="sm"
                fit="cover"
                h={110}
                loading="lazy"
              />
            </UnstyledButton>
          ),
        )}
      </SimpleGrid>
      <Modal
        opened={open !== null}
        onClose={() => setOpen(null)}
        fullScreen
        withCloseButton={false}
        padding={0}
      >
        {open ? (
          <Stack
            gap={0}
            h="100dvh"
            justify="center"
            bg="black"
            pos="relative"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <ActionIcon
              variant="filled"
              color="dark"
              aria-label="閉じる"
              pos="absolute"
              top={12}
              right={12}
              onClick={() => setOpen(null)}
              style={{ zIndex: 1 }}
            >
              <X size={18} />
            </ActionIcon>
            <ActionIcon
              variant="filled"
              color="red"
              aria-label="この写真を削除"
              pos="absolute"
              top={12}
              left={12}
              onClick={() => {
                onDelete(open)
                setOpen(null)
              }}
              style={{ zIndex: 1 }}
            >
              <Trash2 size={18} />
            </ActionIcon>
            {photos.length > 1 ? (
              <ActionIcon
                variant="filled"
                color="dark"
                aria-label="前の写真"
                pos="absolute"
                top="50%"
                left={12}
                style={{ transform: 'translateY(-50%)', zIndex: 1 }}
                onClick={() => showRelative(-1)}
              >
                <ChevronLeft size={20} />
              </ActionIcon>
            ) : null}
            {photos.length > 1 ? (
              <ActionIcon
                variant="filled"
                color="dark"
                aria-label="次の写真"
                pos="absolute"
                top="50%"
                right={12}
                style={{ transform: 'translateY(-50%)', zIndex: 1 }}
                onClick={() => showRelative(1)}
              >
                <ChevronRight size={20} />
              </ActionIcon>
            ) : null}
            <Image
              src={photoUrl(open.displayKey)}
              alt={open.caption ?? '見学の写真'}
              fit="contain"
              mah="100dvh"
            />
            <Stack gap={4} pos="absolute" bottom={12} left={0} right={0} align="center">
              {photos.length > 1 ? (
                <Text size="xs" c="white">
                  {openIndex + 1} / {photos.length}
                </Text>
              ) : null}
              {open.caption ? (
                <Text size="sm" c="white" ta="center" px="md">
                  {open.caption}
                </Text>
              ) : null}
            </Stack>
          </Stack>
        ) : null}
      </Modal>
    </>
  )
}
