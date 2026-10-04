import {
  Anchor,
  Badge,
  Button,
  Card,
  Group,
  Image,
  Stack,
  Text,
  UnstyledButton,
} from '@mantine/core'
import { Check, ExternalLink, Play } from 'lucide-react'

import { CHANNEL_VIDEO_KIND_LABEL } from '../../db/schema'
import { formatDuration, formatViews } from '../../lib/channelVideos/format'
import { toJstDateKey } from '../../lib/jst'
import { youtubeThumbnailUrl } from '../../lib/youtube'
import type { ChannelVideoRow, ChannelVideoWork } from '../../server/repository/channelVideos'
import { NewBadge } from '../FreshBadge'
import { WorkSpecs } from './WorkSpecs'

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

/** Category, completion and the two performance numbers of the work, as on its own card */
function workMetaOf(work: ChannelVideoWork): string {
  return [
    work.category,
    work.completedOn === null ? null : `${work.completedOn.replace('-', '/')} 完成`,
    work.uaValue === null ? null : `UA値 ${work.uaValue}`,
    work.cValue === null ? null : `C値 ${work.cValue}`,
  ]
    .filter(Boolean)
    .join('・')
}

export function ChannelVideoCard({
  video,
  fresh = false,
  onPlay,
  onToggleWatched,
}: {
  video: ChannelVideoRow
  /** Published in the last 7 days: the "New" tag */
  fresh?: boolean
  onPlay: () => void
  onToggleWatched: () => void
}) {
  const watched = video.watchedAt !== null
  return (
    <Card withBorder padding="md" component="article" aria-label={video.title}>
      <Stack gap="sm">
        {/* Picture, text and buttons on a grid: the buttons sit beside the picture on a wide
            screen and take their own row on a phone (styles.css .channel-video-head) */}
        <div className="channel-video-head">
          <UnstyledButton
            onClick={onPlay}
            aria-label={`${video.title} を見る`}
            className="channel-video-thumb"
          >
            <Image
              src={youtubeThumbnailUrl(video.videoId)}
              alt=""
              radius="sm"
              w={{ base: 128, sm: 160 }}
              h={{ base: 72, sm: 90 }}
              fit="cover"
              loading="lazy"
            />
          </UnstyledButton>
          <Stack gap={4} className="channel-video-text">
            <Text size="sm" fw={600} lineClamp={2}>
              {video.title}
            </Text>
            <Group gap={6}>
              <Text size="xs" c="dimmed">
                {metaOf(video)}
              </Text>
              {fresh ? <NewBadge /> : null}
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
          </Stack>
          <Group gap="xs" className="channel-video-actions">
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
        </div>
        {/* The work gets the full width under a rule, not the narrow column beside the picture */}
        {video.work ? (
          <Stack gap={6} className="channel-video-work">
            <Anchor
              href={video.work.sourceUrl}
              target="_blank"
              rel="noreferrer"
              size="sm"
              fw={600}
              aria-label={`施工例「${video.work.title}」を会社のページで開く`}
            >
              施工例: {video.work.title} <ExternalLink size={12} aria-hidden />
            </Anchor>
            {workMetaOf(video.work) ? <Text size="xs">{workMetaOf(video.work)}</Text> : null}
            <WorkSpecs work={video.work} />
          </Stack>
        ) : null}
      </Stack>
    </Card>
  )
}
