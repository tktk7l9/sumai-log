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

import { formatTsubo } from '../../lib/works/filter'
import { youtubeThumbnailUrl } from '../../lib/youtube'
import type { WorkRow } from '../../server/repository/works'
import { WorkSpecs } from './WorkSpecs'

/** Vendor, category, city and completion on one line; only what the site gave */
function metaOf(work: WorkRow): string {
  return [work.vendorName, work.category, work.location, work.completedOn?.replace('-', '/')]
    .filter(Boolean)
    .join('・')
}

/** The three numbers worth comparing at a glance in the plain list */
function headlineOf(work: WorkRow): string {
  return [
    work.floorAreaTsubo === null ? null : `延床 ${formatTsubo(work.floorAreaTsubo)}`,
    work.uaValue === null ? null : `UA値 ${work.uaValue}`,
    work.cValue === null ? null : `C値 ${work.cValue}`,
  ]
    .filter(Boolean)
    .join('　')
}

export function WorkCard({
  work,
  showSpecs,
  onPlay,
  onToggleWatched,
  onEditVideo,
}: {
  work: WorkRow
  /** true in the aligned view: the full Data block instead of the three headline numbers */
  showSpecs: boolean
  onPlay: () => void
  onToggleWatched: () => void
  onEditVideo: () => void
}) {
  const watched = work.watchedAt !== null
  const meta = metaOf(work)
  const headline = headlineOf(work)
  return (
    <Card withBorder padding="md" component="article" aria-label={work.title}>
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start" wrap="nowrap" gap="sm">
          <Stack gap={2}>
            <Anchor
              href={work.sourceUrl}
              target="_blank"
              rel="noreferrer"
              fw={700}
              aria-label={`${work.title} を元のページで開く`}
            >
              {work.title} <ExternalLink size={14} aria-hidden />
            </Anchor>
            {meta ? (
              <Text size="xs" c="dimmed">
                {meta}
              </Text>
            ) : null}
          </Stack>
          {/* Not colour alone: an icon and the word (SHIG 96, 70) */}
          {watched ? (
            <Badge color="teal" variant="light" leftSection={<Check size={12} aria-hidden />}>
              視聴済み
            </Badge>
          ) : null}
        </Group>

        {work.youtubeVideoId ? (
          // People tap the picture, not only the button below it
          <UnstyledButton onClick={onPlay} aria-label={`${work.title} の動画を見る`}>
            <Image
              src={youtubeThumbnailUrl(work.youtubeVideoId)}
              alt=""
              radius="sm"
              h={160}
              fit="cover"
              loading="lazy"
            />
          </UnstyledButton>
        ) : null}

        {showSpecs ? (
          <WorkSpecs work={work} />
        ) : headline ? (
          <Text size="sm">{headline}</Text>
        ) : null}

        <Group gap="xs">
          {work.youtubeVideoId ? (
            <Button
              size="sm"
              mih={44}
              leftSection={<Play size={16} aria-hidden />}
              onClick={onPlay}
            >
              動画を見る
            </Button>
          ) : null}
          <Button size="sm" mih={44} variant="default" onClick={onToggleWatched}>
            {watched ? '視聴済みを取り消す' : '視聴済みにする'}
          </Button>
          {!work.youtubeVideoId ? (
            <Button size="sm" mih={44} variant="subtle" onClick={onEditVideo}>
              動画の URL を貼る
            </Button>
          ) : work.videoSource === 'manual' ? (
            <Button size="sm" mih={44} variant="subtle" onClick={onEditVideo}>
              動画を変える
            </Button>
          ) : null}
        </Group>
      </Stack>
    </Card>
  )
}
