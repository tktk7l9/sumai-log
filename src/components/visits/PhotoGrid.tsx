import { ActionIcon, Image, Modal, SimpleGrid, Stack, Text } from '@mantine/core'
import { Trash2, X } from 'lucide-react'
import { useState } from 'react'

import type { Photo } from '../../db/schema'
import { photoUrl } from '../../lib/photos'

export function PhotoGrid({ photos, onDelete }: { photos: Photo[]; onDelete: (p: Photo) => void }) {
  const [open, setOpen] = useState<Photo | null>(null)
  if (photos.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        写真はまだありません。
      </Text>
    )
  }
  return (
    <>
      <SimpleGrid cols={{ base: 3, sm: 4 }} spacing="xs">
        {photos.map((p) => (
          <Image
            key={p.id}
            src={photoUrl(p.thumbKey)}
            alt={p.caption ?? '見学の写真'}
            radius="md"
            fit="cover"
            h={110}
            loading="lazy"
            style={{ cursor: 'zoom-in' }}
            onClick={() => setOpen(p)}
          />
        ))}
      </SimpleGrid>
      <Modal
        opened={open !== null}
        onClose={() => setOpen(null)}
        fullScreen
        withCloseButton={false}
        padding={0}
      >
        {open ? (
          <Stack gap={0} h="100dvh" justify="center" bg="black" pos="relative">
            <ActionIcon
              variant="filled"
              color="dark"
              aria-label="閉じる"
              pos="absolute"
              top={12}
              right={12}
              onClick={() => setOpen(null)}
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
            >
              <Trash2 size={18} />
            </ActionIcon>
            <Image
              src={photoUrl(open.displayKey)}
              alt={open.caption ?? '見学の写真'}
              fit="contain"
              mah="100dvh"
            />
          </Stack>
        ) : null}
      </Modal>
    </>
  )
}
