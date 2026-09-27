import { Card, Center, Group, Image, Stack, Text } from '@mantine/core'
import { Link } from '@tanstack/react-router'
import { Camera } from 'lucide-react'

import { formatDateSlash } from '../../lib/calendar'
import { photoUrl } from '../../lib/photos'
import type { VisitWithLinks } from '../../server/repository'

/** The thumbnail is 4:3. A size that leaves 200px or more for the text even at 390px width */
const THUMB_W = 104
const THUMB_H = 78

export function VisitCard({ visit }: { visit: VisitWithLinks }) {
  const label = visit.placeName ?? visit.vendorName ?? visit.propertyName ?? '場所未設定'
  return (
    <Link
      to="/records/visits/$id"
      params={{ id: visit.id }}
      style={{ textDecoration: 'none', color: 'inherit' }}
    >
      <Card withBorder padding="md">
        <Group wrap="nowrap" align="flex-start" gap="sm">
          {/* Visit photos are cropped to landscape 4:3 (room photos are mostly taken in
              landscape orientation) */}
          {visit.firstThumbKey ? (
            <Image
              src={photoUrl(visit.firstThumbKey)}
              alt=""
              w={THUMB_W}
              h={THUMB_H}
              radius="sm"
              fit="cover"
              style={{ flexShrink: 0 }}
            />
          ) : (
            <Center
              w={THUMB_W}
              h={THUMB_H}
              className="sunken"
              c="dimmed"
              style={{ borderRadius: 'var(--mantine-radius-sm)', flexShrink: 0 }}
            >
              <Camera size={22} aria-hidden />
            </Center>
          )}
          <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
            <Text size="xs" c="dimmed">
              {formatDateSlash(visit.visitedOn)}
            </Text>
            <Text fw={700} lineClamp={2} lh={1.4}>
              {label}
            </Text>
            {visit.photoCount > 0 ? (
              <Text size="xs" c="dimmed">
                {visit.photoCount} 枚
              </Text>
            ) : null}
          </Stack>
        </Group>
      </Card>
    </Link>
  )
}
