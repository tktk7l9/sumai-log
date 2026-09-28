import { ActionIcon, Checkbox, Group, Stack, Text, TextInput, Title } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { Plus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { appendAction, parseActions, toggleAction } from '../../lib/nextActions'
import { saveVisitNextActions } from '../../server/visits'

/**
 * Handles "次にやること" (Next actions) of a visit record as a checklist. A tap toggles
 * done / not done and saves on the spot (without opening the edit screen), and more items
 * can be added one after another with Enter from the field below. Saves are sent one at a
 * time in order, and the returned update time becomes the base of the next save (pressing
 * in succession is not mistaken for the other person's update).
 * When the other person has rewritten it first, it does not overwrite; it reloads
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
  // After reloading because of a conflict, drop the saves queued before it
  const generation = useRef(0)

  // When a new value arrives from outside, e.g. after a reload, follow it (only when none
  // of our own saves are pending)
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
          // Do not add on the Enter that confirms a Japanese IME conversion
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
