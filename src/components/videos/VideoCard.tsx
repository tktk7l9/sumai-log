import { AspectRatio, Badge, Card, Center, Group, Image, Stack, Text } from '@mantine/core'
import { Link } from '@tanstack/react-router'
import { Film } from 'lucide-react'

import { ATTENDEES_LABEL } from '../../db/schema'
import { formatJst } from '../../lib/jst'
import type { listVideos } from '../../server/videos'

export type VideoRow = Awaited<ReturnType<typeof listVideos>>[number]

export function VideoCard({ video }: { video: VideoRow }) {
  return (
    <Link
      to="/records/videos/$id"
      params={{ id: video.id }}
      style={{ textDecoration: 'none', color: 'inherit' }}
    >
      <Card withBorder padding="md">
        <Stack gap="xs">
          <AspectRatio ratio={16 / 9}>
            {video.thumbnailUrl ? (
              <Image src={video.thumbnailUrl} alt={video.title} radius="md" loading="lazy" />
            ) : (
              <Center
                bg="var(--mantine-color-default-hover)"
                style={{ borderRadius: 'var(--mantine-radius-md)' }}
              >
                <Film size={28} aria-hidden />
              </Center>
            )}
          </AspectRatio>
          <Text fw={700} lineClamp={2}>
            {video.title}
          </Text>
          {video.channel ? (
            <Text size="sm" c="dimmed" lineClamp={1}>
              {video.channel}
            </Text>
          ) : null}
          <Group gap="xs" wrap="wrap">
            {video.watchedOn ? (
              <Text size="xs" c="dimmed">
                {formatJst(video.watchedOn, { withTime: false })}
              </Text>
            ) : null}
            <Badge variant="default" size="xs">
              {ATTENDEES_LABEL[video.watchedBy]}
            </Badge>
          </Group>
          {video.tags.length > 0 ? (
            <Group gap={4}>
              {video.tags.map((t) => (
                <Badge key={t} variant="light" size="xs">
                  {t}
                </Badge>
              ))}
            </Group>
          ) : null}
        </Stack>
      </Card>
    </Link>
  )
}
