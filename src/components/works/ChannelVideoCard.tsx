import { Badge, Button, Card, Group, Image, Stack, Text, UnstyledButton } from '@mantine/core'
import { Check, Play } from 'lucide-react'

import { CHANNEL_VIDEO_KIND_LABEL } from '../../db/schema'
import { formatDuration, formatViews } from '../../lib/channelVideos/format'
import { toJstDateKey } from '../../lib/jst'
import { youtubeThumbnailUrl } from '../../lib/youtube'
import type { ChannelVideoRow } from '../../server/repository/channelVideos'

/** Channel, kind, length, views and the published date (JST) on one line; only what YouTube gave */
function metaOf(video: ChannelVideoRow): string {
  return [
    video.channel,
    CHANNEL_VIDEO_KIND_LABEL[video.kind],
    video.durationSec === null ? null : formatDuration(video.durationSec),
    video.viewCount === null ? null : formatViews(video.viewCount),
    video.publishedAt === null
      ? null
      : `${toJstDateKey(video.publishedAt).replaceAll('-', '/')} 公開`,
  ]
    .filter(Boolean)
    .join('・')
}

export function ChannelVideoCard({
  video,
  onPlay,
  onToggleWatched,
}: {
  video: ChannelVideoRow
  onPlay: () => void
  onToggleWatched: () => void
}) {
  const watched = video.watchedAt !== null
  return (
    <Card withBorder padding="sm" component="article" aria-label={video.title}>
      <Group align="flex-start" wrap="nowrap" gap="sm">
        <UnstyledButton
          onClick={onPlay}
          aria-label={`${video.title} を見る`}
          style={{ flex: 'none' }}
        >
          <Image
            src={youtubeThumbnailUrl(video.videoId)}
            alt=""
            radius="sm"
            w={128}
            h={72}
            fit="cover"
            loading="lazy"
          />
        </UnstyledButton>
        <Stack gap={6} style={{ flex: 1, minWidth: 0 }}>
          <Text size="sm" fw={600} lineClamp={2}>
            {video.title}
          </Text>
          <Group gap={6}>
            <Text size="xs" c="dimmed">
              {metaOf(video)}
            </Text>
            {/* Not colour alone: an icon and the word (SHIG 96, 70) */}
            {watched ? (
              <Badge
                size="sm"
                color="teal"
                variant="light"
                leftSection={<Check size={12} aria-hidden />}
              >
                視聴済み
              </Badge>
            ) : null}
          </Group>
          <Group gap="xs">
            <Button
              size="sm"
              mih={44}
              leftSection={<Play size={16} aria-hidden />}
              onClick={onPlay}
            >
              見る
            </Button>
            <Button size="sm" mih={44} variant="default" onClick={onToggleWatched}>
              {watched ? '視聴済みを取り消す' : '視聴済みにする'}
            </Button>
          </Group>
        </Stack>
      </Group>
    </Card>
  )
}
