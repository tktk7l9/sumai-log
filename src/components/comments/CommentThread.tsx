import { ActionIcon, Button, Card, Group, Stack, Text, Textarea, Title } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'

import type { COMMENT_TARGETS, Comment } from '../../db/schema'
import type { Member } from '../../lib/members'
import { addComment, deleteComment } from '../../server/comments'
import { MemberChip } from '../MemberChip'

dayjs.extend(utc)

export function CommentThread({
  targetType,
  targetId,
  comments,
  me,
  members,
}: {
  targetType: (typeof COMMENT_TARGETS)[number]
  targetId: string
  comments: Comment[]
  me: string
  members: Member[]
}) {
  const router = useRouter()
  const add = useServerFn(addComment)
  const remove = useServerFn(deleteComment)
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit() {
    if (!body.trim()) return
    setSaving(true)
    try {
      await add({ data: { targetType, targetId, body } })
      setBody('')
      await router.invalidate()
    } catch {
      notifications.show({ message: '送信できませんでした', color: 'red' })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(c: Comment) {
    if (!window.confirm('このコメントを削除します。')) return
    try {
      const { ok } = await remove({ data: { id: c.id } })
      if (!ok) notifications.show({ message: '自分のコメントだけ削除できます', color: 'orange' })
      await router.invalidate()
    } catch {
      notifications.show({ message: '削除できませんでした', color: 'red' })
    }
  }

  return (
    <Stack gap="sm">
      <Title order={2}>コメント</Title>
      {comments.length === 0 ? (
        <Text size="sm" c="dimmed">
          まだコメントはありません。
        </Text>
      ) : (
        comments.map((c) => (
          <Card key={c.id} withBorder padding="sm">
            <Group justify="space-between" wrap="nowrap" align="flex-start">
              <Stack gap={4} style={{ minWidth: 0 }}>
                <Group gap="xs">
                  <MemberChip email={c.createdBy} members={members} />
                  {/* createdAt は D1 の datetime('now')（UTC, 'YYYY-MM-DD HH:MM:SS'）。
                      dayjs.utc で UTC として読み、+9h して JST で表示する。 */}
                  <Text size="xs" c="dimmed">
                    {dayjs.utc(c.createdAt).add(9, 'hour').format('YYYY-MM-DD HH:mm')}
                  </Text>
                </Group>
                <Text size="sm" className="breakable" style={{ whiteSpace: 'pre-wrap' }}>
                  {c.body}
                </Text>
              </Stack>
              {c.createdBy === me ? (
                <ActionIcon
                  variant="subtle"
                  color="red"
                  aria-label="コメントを削除"
                  onClick={() => handleDelete(c)}
                >
                  <Trash2 size={16} />
                </ActionIcon>
              ) : null}
            </Group>
          </Card>
        ))
      )}
      <Textarea
        placeholder="一言どうぞ"
        autosize
        minRows={2}
        value={body}
        onChange={(e) => setBody(e.currentTarget.value)}
        maxLength={2000}
      />
      <Button onClick={submit} loading={saving} disabled={!body.trim()} fullWidth>
        送信
      </Button>
    </Stack>
  )
}
