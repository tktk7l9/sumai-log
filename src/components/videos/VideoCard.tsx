import { AspectRatio, Badge, Card, Center, Group, Image, Stack, Text } from '@mantine/core'
import { Link } from '@tanstack/react-router'
import { Film } from 'lucide-react'

import { formatDateSlash } from '../../lib/calendar'
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
          {/* 動画のサムネは 16:9。YouTube が返す 4:3 の画像は上下を切って使う */}
          <AspectRatio ratio={16 / 9}>
            {video.thumbnailUrl ? (
              <Image
                src={video.thumbnailUrl}
                alt={video.title}
                radius="sm"
                fit="cover"
                loading="lazy"
              />
            ) : (
              <Center
                className="sunken"
                c="dimmed"
                style={{ borderRadius: 'var(--mantine-radius-sm)' }}
              >
                <Film size={28} aria-hidden />
              </Center>
            )}
          </AspectRatio>
          <Text fw={700} lineClamp={2} lh={1.4}>
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
                {formatDateSlash(video.watchedOn)}
              </Text>
            ) : null}
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
