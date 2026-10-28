import { Button, Select, SegmentedControl, Stack, TextInput, Textarea } from '@mantine/core'
import { DateInput } from '@mantine/dates'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import dayjs from 'dayjs'
import { useState } from 'react'

import { TODO_LISTS, TODO_LIST_LABEL, type Todo, type TodoList } from '../../db/schema'
import { draftKey } from '../../lib/drafts'
import type { Member } from '../../lib/members'
import { saveTodo } from '../../server/todos'
import { CONFLICT_MESSAGE, DraftNotice } from '../DraftNotice'
import { useFormDraft } from '../useFormDraft'

/** Select value for "both of them" (assignee NULL). Not an e-mail, so it cannot collide */
const BOTH = 'both'

type Values = {
  title: string
  list: TodoList
  assignee: string
  dueOn: string | null
  url: string
  note: string
}

export function TodoForm({
  todo,
  members,
  defaults,
  onSaved,
}: {
  todo: Todo | null
  members: readonly Member[]
  /** The list chip in force when 「やることを追加」 was pressed: the new item starts in it */
  defaults?: { list?: TodoList }
  onSaved: (id: string) => void
}) {
  const router = useRouter()
  const save = useServerFn(saveTodo)
  const [saving, setSaving] = useState(false)
  const initial: Values = todo
    ? {
        title: todo.title,
        list: todo.list,
        assignee: todo.assignee ?? BOTH,
        dueOn: todo.dueOn,
        url: todo.url ?? '',
        note: todo.note ?? '',
      }
    : { title: '', list: defaults?.list ?? 'other', assignee: BOTH, dueOn: null, url: '', note: '' }

  const form = useForm<Values>({
    initialValues: initial,
    validate: {
      title: (v) => (v.trim() ? null : 'やることを入れてください'),
      url: (v) =>
        !v.trim() || /^https?:\/\//.test(v.trim()) ? null : 'URL は http(s):// で始めてください',
    },
  })
  const draft = useFormDraft(form, draftKey('todo', todo?.id, todo?.updatedAt), initial)

  async function submit(values: Values) {
    setSaving(true)
    try {
      const res = await save({
        data: {
          ...(todo ? { id: todo.id, expectedUpdatedAt: todo.updatedAt } : {}),
          title: values.title,
          list: values.list,
          assignee: values.assignee === BOTH ? null : values.assignee,
          dueOn: values.dueOn || null,
          url: values.url,
          note: values.note,
        },
      })
      if (res.conflict) {
        notifications.show({ message: CONFLICT_MESSAGE, color: 'orange', autoClose: 12_000 })
        await router.invalidate()
        return
      }
      draft.clear()
      await router.invalidate()
      notifications.show({ message: todo ? 'やることを更新しました' : 'やることを追加しました' })
      onSaved(res.id)
    } catch {
      notifications.show({ message: '保存できませんでした', color: 'red' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={form.onSubmit(submit)}>
      <Stack gap="md">
        {draft.restored ? <DraftNotice onDiscard={draft.discard} /> : null}
        <TextInput
          label="やること"
          required
          data-autofocus
          placeholder="例：鍵の受け取りと立会い"
          {...form.getInputProps('title')}
        />
        <SegmentedControl
          aria-label="分類"
          fullWidth
          data={TODO_LISTS.map((l) => ({ value: l, label: TODO_LIST_LABEL[l] }))}
          {...form.getInputProps('list')}
        />
        <Select
          label="担当"
          allowDeselect={false}
          data={[
            { value: BOTH, label: 'ふたり' },
            ...members.map((m) => ({ value: m.email, label: m.displayName })),
          ]}
          {...form.getInputProps('assignee')}
        />
        <DateInput
          label="期限"
          clearable
          valueFormat="YYYY/MM/DD"
          value={form.values.dueOn ? new Date(`${form.values.dueOn}T00:00:00`) : null}
          onChange={(d) => form.setFieldValue('dueOn', d ? dayjs(d).format('YYYY-MM-DD') : null)}
        />
        <TextInput
          label="リンク"
          placeholder="https://"
          inputMode="url"
          {...form.getInputProps('url')}
        />
        <Textarea label="メモ" autosize minRows={2} {...form.getInputProps('note')} />
        <div className="form-actions">
          <Button type="submit" loading={saving} fullWidth>
            {todo ? '保存' : '追加'}
          </Button>
        </div>
      </Stack>
    </form>
  )
}
