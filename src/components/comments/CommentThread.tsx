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
  // 書きかけのコメントは記録ごとに端末へ残す（ページを離れても消えない）
  const key = draftKey('comment', targetId, targetType)
  useEffect(() => {
    try {
      setBody(parseDraft<string>(window.localStorage.getItem(key), Date.now()) ?? '')
    } catch {
      // 読めなくても入力はできる
    }
  }, [key])
  function changeBody(next: string) {
    setBody(next)
    try {
      if (next.trim() === '') window.localStorage.removeItem(key)
      else window.localStorage.setItem(key, serializeDraft(next, Date.now()))
    } catch {
      // 書けなくても入力はできる
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
                  {/* createdAt は D1 の datetime('now')（UTC, 'YYYY-MM-DD HH:MM:SS'）。
                      formatJst が UTC として読み、JST に直して表示する。 */}
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
          // ⌘/Ctrl + Enter で送信（日本語入力の変換中は送らない）。Enter だけなら改行
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
