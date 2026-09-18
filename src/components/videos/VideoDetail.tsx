import {
  ActionIcon,
  Anchor,
  AspectRatio,
  Badge,
  Button,
  Card,
  Group,
  Image,
  Modal,
  Stack,
  Text,
  Title,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { Link, useNavigate } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { ExternalLink, Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'

import type { Comment, Video } from '../../db/schema'
import { formatDateSlash } from '../../lib/calendar'
import type { Member } from '../../lib/members'
import { deleteVideo } from '../../server/videos'
import { Row } from '../candidates/DetailRow'
import { CommentThread } from '../comments/CommentThread'
import { FormDrawer } from '../FormDrawer'
import { PageShell } from '../PageShell'
import { VideoForm } from './VideoForm'

export function VideoDetail({
  video,
  vendor,
  options,
  comments,
  me,
  members,
}: {
  video: Video
  vendor: { id: string; name: string } | null
  options: { tags: string[]; vendors: { id: string; name: string }[] }
  comments: Comment[]
  me: string
  members: Member[]
}) {
  const navigate = useNavigate()
  const remove = useServerFn(deleteVideo)
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    setDeleting(true)
    try {
      await remove({ data: { id: video.id } })
      notifications.show({ message: '動画メモを削除しました' })
      navigate({ to: '/records', search: { tab: 'videos' } })
    } catch {
      notifications.show({ message: '削除できませんでした', color: 'red' })
      setDeleting(false)
    }
  }

  return (
    <PageShell
      title={video.title}
      actions={
        <Group gap="xs">
          <ActionIcon variant="default" aria-label="編集" onClick={() => setEditing(true)}>
            <Pencil size={16} />
          </ActionIcon>
          <ActionIcon
            variant="default"
            color="red"
            aria-label="削除"
            onClick={() => setConfirming(true)}
          >
            <Trash2 size={16} />
          </ActionIcon>
        </Group>
      }
    >
      {video.thumbnailUrl ? (
        <AspectRatio ratio={16 / 9}>
          <Image src={video.thumbnailUrl} alt="" radius="sm" />
        </AspectRatio>
      ) : null}

      <Button
        component="a"
        href={video.url}
        target="_blank"
        rel="noopener noreferrer"
        variant="light"
        leftSection={<ExternalLink size={16} aria-hidden />}
        style={{ alignSelf: 'flex-start' }}
      >
        YouTube で開く
      </Button>

      <Card withBorder padding="md">
        <Stack gap="xs">
          {video.channel ? <Row label="チャンネル" value={video.channel} /> : null}
          {video.watchedOn ? <Row label="観た日" value={formatDateSlash(video.watchedOn)} /> : null}
          {vendor ? (
            <Row
              label="関連業者"
              value={
                <Link to="/candidates/vendors/$id" params={{ id: vendor.id }}>
                  <Anchor component="span">{vendor.name}</Anchor>
                </Link>
              }
            />
          ) : null}
        </Stack>
      </Card>

      {video.tags.length > 0 ? (
        <Group gap={4}>
          {video.tags.map((t) => (
            <Badge key={t} variant="light" size="sm">
              {t}
            </Badge>
          ))}
        </Group>
      ) : null}

      <Stack gap={4}>
        <Title order={2} size="h3">
          学び
        </Title>
        <Text className="breakable" style={{ whiteSpace: 'pre-wrap' }}>
          {video.takeaways || '—'}
        </Text>
      </Stack>

      <CommentThread
        targetType="video"
        targetId={video.id}
        comments={comments}
        me={me}
        members={members}
      />

      <FormDrawer opened={editing} onClose={() => setEditing(false)} title="動画メモを編集">
        <VideoForm
          initial={video}
          options={options}
          onSaved={() => setEditing(false)}
          onCancel={() => setEditing(false)}
        />
      </FormDrawer>

      <Modal opened={confirming} onClose={() => setConfirming(false)} title="削除の確認">
        <Stack gap="md">
          <Text size="sm">この動画メモとコメントを削除します。元に戻せません。</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setConfirming(false)}>
              キャンセル
            </Button>
            <Button color="red" loading={deleting} onClick={handleDelete}>
              削除する
            </Button>
          </Group>
        </Stack>
      </Modal>
    </PageShell>
  )
}
