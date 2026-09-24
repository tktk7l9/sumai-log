import { ActionIcon, Checkbox, Group, Stack, Text, TextInput, Title } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { Plus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { appendAction, parseActions, toggleAction } from '../../lib/nextActions'
import { saveVisitNextActions } from '../../server/visits'

/**
 * 見学記録の「次にやること」をチェックリストで扱う。タップで済／未済を切り替えてその場で
 * 保存し（編集画面を開かない）、下の欄から Enter で続けて足せる。保存は 1 件ずつ順番に
 * 送り、返ってきた更新日時を次の保存の基準にする（続けて押しても相手の更新と取り違えない）。
 * 相手が先に書き換えていたら上書きせず、読み直す
 */
export function NextActionsChecklist({
  visitId,
  nextActions,
  updatedAt,
}: {
  visitId: string
  nextActions: string | null
  updatedAt: string
}) {
  const router = useRouter()
  const save = useServerFn(saveVisitNextActions)
  const [text, setText] = useState(nextActions ?? '')
  const [adding, setAdding] = useState('')
  const base = useRef(updatedAt)
  const queue = useRef<Promise<void>>(Promise.resolve())
  const pending = useRef(0)
  // 競合で読み直したら、それより前に積んだ保存は捨てる
  const generation = useRef(0)

  // 読み直しなどで外から新しい値が来たら合わせる（自分の保存待ちが無いときだけ）
  useEffect(() => {
    if (pending.current === 0) {
      setText(nextActions ?? '')
      base.current = updatedAt
    }
  }, [nextActions, updatedAt])

  function persist(next: string) {
    setText(next)
    pending.current += 1
    const gen = generation.current
    queue.current = queue.current.then(async () => {
      if (gen !== generation.current) {
        pending.current = Math.max(0, pending.current - 1)
        return
      }
      try {
        const res = await save({
          data: { id: visitId, nextActions: next || null, expectedUpdatedAt: base.current },
        })
        if (res.conflict) {
          notifications.show({
            message: '相手が先にこの記録を保存していたので、最新の内容を読み直しました。',
            color: 'orange',
          })
          generation.current += 1
          pending.current = 0
          await router.invalidate()
          return
        }
        base.current = res.updatedAt
      } catch {
        notifications.show({ message: '保存できませんでした', color: 'red' })
      } finally {
        pending.current = Math.max(0, pending.current - 1)
        if (pending.current === 0) void router.invalidate()
      }
    })
  }

  function add() {
    const next = appendAction(text, adding)
    if (next === text) return
    setAdding('')
    persist(next)
  }

  const items = parseActions(text)
  const open = items.filter((a) => !a.done).length

  return (
    <Stack gap={6}>
      <Group gap="xs" align="baseline">
        <Title order={2} size="h3">
          次にやること
        </Title>
        {items.length > 0 ? (
          <Text size="sm" c="dimmed">
            残り {open} / {items.length}
          </Text>
        ) : null}
      </Group>
      {items.length === 0 ? (
        <Text size="sm" c="dimmed">
          まだありません。下の欄に入れて Enter で足せます。
        </Text>
      ) : (
        <Stack gap={8}>
          {items.map((a) => (
            <Checkbox
              key={`${a.line}-${a.text}`}
              checked={a.done}
              onChange={() => persist(toggleAction(text, a.line))}
              label={
                <Text
                  span
                  className="breakable"
                  c={a.done ? 'dimmed' : undefined}
                  td={a.done ? 'line-through' : undefined}
                >
                  {a.text}
                </Text>
              }
              styles={{ body: { alignItems: 'flex-start' }, label: { cursor: 'pointer' } }}
            />
          ))}
        </Stack>
      )}
      <TextInput
        placeholder="やることを足す（Enter で追加）"
        value={adding}
        onChange={(e) => setAdding(e.currentTarget.value)}
        maxLength={200}
        enterKeyHint="enter"
        onKeyDown={(e) => {
          // 日本語入力の変換を確定する Enter では足さない
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
            e.preventDefault()
            add()
          }
        }}
        rightSection={
          <ActionIcon
            variant="subtle"
            aria-label="やることを追加"
            disabled={adding.trim() === ''}
            onClick={add}
          >
            <Plus size={16} />
          </ActionIcon>
        }
      />
    </Stack>
  )
}
