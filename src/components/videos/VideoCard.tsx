import { Badge, Card, Center, Group, Image, Stack, Text } from '@mantine/core'
import { Link } from '@tanstack/react-router'
import { Film } from 'lucide-react'

import { formatDateSlash } from '../../lib/calendar'
import type { listVideos } from '../../server/videos'

export type VideoRow = Awaited<ReturnType<typeof listVideos>>[number]

/**
 * One memo in the list: a small thumbnail beside the title, the channel and the day, and the
 * tags. Three fit on a phone screen (the full-width picture card before 2026-10-06 fitted two,
 * and 72 memos ran 25,000px long)
 */
export function VideoCard({ video }: { video: VideoRow }) {
  return (
    <Link
      to="/records/videos/$id"
      params={{ id: video.id }}
      style={{ textDecoration: 'none', color: 'inherit' }}
    >
      <Card withBorder padding="sm" component="article" aria-label={video.title}>
        <Group gap="sm" wrap="nowrap" align="flex-start">
          {/* YouTube's 4:3 picture, cropped to the 16:9 of the video */}
          {video.thumbnailUrl ? (
            <Image
              src={video.thumbnailUrl}
              alt=""
              radius="sm"
              w={112}
              h={63}
              fit="cover"
              loading="lazy"
              style={{ flex: 'none' }}
            />
          ) : (
            <Center
              className="sunken"
              c="dimmed"
              w={112}
              h={63}
              style={{ flex: 'none', borderRadius: 'var(--mantine-radius-sm)' }}
            >
              <Film size={24} aria-hidden />
            </Center>
          )}
          <Stack gap={4} style={{ minWidth: 0, flex: 1 }}>
            <Text size="sm" fw={600} lineClamp={2} lh={1.35}>
              {video.title}
            </Text>
            <Text size="xs" c="dimmed" lineClamp={1}>
              {[video.channel, video.watchedOn ? formatDateSlash(video.watchedOn) : null]
                .filter(Boolean)
                .join('・')}
            </Text>
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
        </Group>
      </Card>
    </Link>
  )
}
