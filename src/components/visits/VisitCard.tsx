import { Card, Group, Image, Stack, Text } from '@mantine/core'
import { Link } from '@tanstack/react-router'

import { formatDateSlash } from '../../lib/calendar'
import { photoUrl } from '../../lib/photos'
import { visitSummary } from '../../lib/visitSummary'
import type { VisitWithLinks } from '../../server/repository'

/** The thumbnail is 4:3. A size that leaves 200px or more for the text even at 390px width */
const THUMB_W = 104
const THUMB_H = 78

export function VisitCard({ visit }: { visit: VisitWithLinks }) {
  const { title, subject, excerpt } = visitSummary(visit)
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
          {/* No grey camera placeholder when there is no photo: it read like an "add photo"
              button (SHIG 4), and the text gets the whole width instead */}
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
          ) : null}
          <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
            <Text size="xs" c="dimmed">
              {formatDateSlash(visit.visitedOn)}
            </Text>
            <Text fw={700} lineClamp={2} lh={1.4}>
              {title}
            </Text>
            {subject ? (
              <Text size="sm" c="dimmed" lineClamp={1}>
                {subject}
              </Text>
            ) : null}
            {excerpt ? (
              <Text size="sm" lineClamp={1}>
                {excerpt}
              </Text>
            ) : null}
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
