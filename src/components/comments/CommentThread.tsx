import { ActionIcon, Button, Card, Group, Stack, Text, Textarea, Title } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'

import type { COMMENT_TARGETS, Comment } from '../../db/schema'
import { draftKey, parseDraft, serializeDraft } from '../../lib/drafts'
import { formatJst } from '../../lib/jst'
import type { Member } from '../../lib/members'
import { addComment, deleteComment } from '../../server/comments'
import { MemberChip, authorBandColor } from '../MemberChip'
import { deleteWithUndo, usePendingDeletes } from '../undoableDelete'

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
  // An unfinished comment is kept on the device per record (it survives leaving the page)
  const key = draftKey('comment', targetId, targetType)
  useEffect(() => {
    try {
      setBody(parseDraft<string>(window.localStorage.getItem(key), Date.now()) ?? '')
    } catch {
      // Input still works even if it cannot be read
    }
  }, [key])
  function changeBody(next: string) {
    setBody(next)
    try {
      if (next.trim() === '') window.localStorage.removeItem(key)
      else window.localStorage.setItem(key, serializeDraft(next, Date.now()))
    } catch {
      // Input still works even if it cannot be written
    }
  }

  async function submit() {
    if (!body.trim()) return
    setSaving(true)
    try {
      await add({ data: { targetType, targetId, body } })
      changeBody('')
      await router.invalidate()
    } catch {
      notifications.show({ message: '送信できませんでした', color: 'red' })
    } finally {
      setSaving(false)
    }
  }

  const pendingDeletes = usePendingDeletes()
  const visible = comments.filter((c) => !pendingDeletes.has(c.id))

  function handleDelete(c: Comment) {
    deleteWithUndo({
      id: c.id,
      message: 'コメントを削除しました',
      failureMessage: '自分のコメントだけ削除できます',
      commit: async () => {
        const { ok } = await remove({ data: { id: c.id } })
        await router.invalidate()
        return ok
      },
    })
  }

  return (
    <Stack gap="sm">
      <Title order={2}>コメント</Title>
      {visible.length === 0 ? (
        <Text size="sm" c="dimmed">
          まだコメントはありません。
        </Text>
      ) : (
        visible.map((c) => (
          <Card
            key={c.id}
            withBorder
            padding="sm"
            className="author-band"
            style={
              { '--author-color': authorBandColor(members, c.createdBy) } as React.CSSProperties
            }
          >
            <Group justify="space-between" wrap="nowrap" align="flex-start">
              <Stack gap={4} style={{ minWidth: 0 }}>
                <Group gap="xs">
                  <MemberChip email={c.createdBy} members={members} />
                  {/* createdAt is D1's datetime('now') (UTC, 'YYYY-MM-DD HH:MM:SS').
                      formatJst reads it as UTC and displays it converted to JST. */}
                  <Text size="xs" c="dimmed">
                    {formatJst(c.createdAt)}
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
        onChange={(e) => changeBody(e.currentTarget.value)}
        onKeyDown={(e) => {
          // ⌘/Ctrl + Enter submits (not during Japanese IME composition). Enter alone is a newline
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) {
            e.preventDefault()
            void submit()
          }
        }}
        maxLength={2000}
      />
      <Button onClick={submit} loading={saving} disabled={!body.trim()} fullWidth>
        送信
      </Button>
    </Stack>
  )
}
