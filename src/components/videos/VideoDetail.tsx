import {
  Anchor,
  AspectRatio,
  Badge,
  Button,
  Card,
  Group,
  Image,
  Stack,
  Text,
  Title,
} from '@mantine/core'
import { Link, useNavigate, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { ExternalLink } from 'lucide-react'
import { useState } from 'react'

import type { Comment, Video } from '../../db/schema'
import { formatDateSlash } from '../../lib/calendar'
import type { Member } from '../../lib/members'
import { deleteVideo } from '../../server/videos'
import { Row } from '../candidates/DetailRow'
import { CommentThread } from '../comments/CommentThread'
import { DeleteSection, EditButton } from '../DetailActions'
import { FormDrawer } from '../FormDrawer'
import { deleteWithUndo } from '../undoableDelete'
import { BackButton, PageShell } from '../PageShell'
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
  const router = useRouter()
  const remove = useServerFn(deleteVideo)
  const [editing, setEditing] = useState(false)

  function handleDelete() {
    deleteWithUndo({
      id: video.id,
      message: '動画メモを削除しました',
      commit: async (fetch) => {
        await remove({ data: { id: video.id }, fetch })
        await router.invalidate()
      },
    })
    navigate({ to: '/records', search: { tab: 'videos' } })
  }

  return (
    <PageShell
      back={
        <BackButton
          label="記録"
          renderLink={(p) => <Link {...p} to="/records" search={{ tab: 'videos' }} />}
        />
      }
      title={video.title}
      actions={
        <Group gap="xs">
          <EditButton onClick={() => setEditing(true)} />
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

      {video.takeaways?.trim() ? (
        <Stack gap={4}>
          <Title order={2} size="h3">
            学び
          </Title>
          <Text className="breakable" style={{ whiteSpace: 'pre-wrap' }}>
            {video.takeaways}
          </Text>
        </Stack>
      ) : null}

      <CommentThread
        targetType="video"
        targetId={video.id}
        comments={comments}
        me={me}
        members={members}
      />

      <DeleteSection label="この動画メモを削除" onDelete={handleDelete} />

      <FormDrawer opened={editing} onClose={() => setEditing(false)} title="動画メモを編集">
        <VideoForm
          initial={video}
          options={options}
          onSaved={() => setEditing(false)}
          onCancel={() => setEditing(false)}
        />
      </FormDrawer>
    </PageShell>
  )
}
