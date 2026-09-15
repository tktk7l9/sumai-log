import { Badge, Card, Center, Group, Image, Stack, Text } from '@mantine/core'
import { Link } from '@tanstack/react-router'
import { Camera } from 'lucide-react'

import { ATTENDEES_LABEL } from '../../db/schema'
import { photoUrl } from '../../lib/photos'
import type { VisitWithLinks } from '../../server/repository'

export function VisitCard({ visit }: { visit: VisitWithLinks }) {
  const label = visit.placeName ?? visit.vendorName ?? visit.propertyName ?? '場所未設定'
  return (
    <Link
      to="/records/visits/$id"
      params={{ id: visit.id }}
      style={{ textDecoration: 'none', color: 'inherit' }}
    >
      <Card withBorder padding="md">
        <Group wrap="nowrap" align="flex-start">
          {visit.firstThumbKey ? (
            <Image
              src={photoUrl(visit.firstThumbKey)}
              alt=""
              w={80}
              h={80}
              radius="md"
              fit="cover"
              style={{ flexShrink: 0 }}
            />
          ) : (
            <Center
              w={80}
              h={80}
              bg="var(--mantine-color-default-hover)"
              style={{ borderRadius: 'var(--mantine-radius-md)', flexShrink: 0 }}
            >
              <Camera size={24} aria-hidden />
            </Center>
          )}
          <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
            <Text size="sm" c="dimmed">
              {visit.visitedOn}
            </Text>
            <Text fw={700} lineClamp={1}>
              {label}
            </Text>
            <Group gap="xs">
              <Badge variant="default" size="xs">
                {ATTENDEES_LABEL[visit.attendees]}
              </Badge>
              {visit.photoCount > 0 ? (
                <Text size="xs" c="dimmed">
                  {visit.photoCount} 枚
                </Text>
              ) : null}
            </Group>
          </Stack>
        </Group>
      </Card>
    </Link>
  )
}
