import { Accordion, Button, Chip, Stack, Text, Title } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { z } from 'zod'

import { ChipRow } from '../components/ChipRow'
import { DeleteSection } from '../components/DetailActions'
import { EmptyState } from '../components/EmptyState'
import { Fab } from '../components/Fab'
import { FormDrawer } from '../components/FormDrawer'
import { PageShell } from '../components/PageShell'
import { TodoForm } from '../components/todos/TodoForm'
import { TodoRow } from '../components/todos/TodoRow'
import { deleteWithUndo, usePendingDeletes } from '../components/undoableDelete'
import { TODO_LISTS, TODO_LIST_LABEL, type Todo } from '../db/schema'
import { UUID_SHAPE } from '../lib/ids'
import {
  TODO_SECTIONS,
  TODO_SECTION_LABEL,
  WHO_FILTERS,
  WHO_FILTER_LABEL,
  filterTodos,
  groupTodos,
} from '../lib/todos'
import { getMembers } from '../server/settings'
import { deleteTodo, listTodos, setTodoDone } from '../server/todos'

const search = z.object({
  // Narrow by list and by who. An unknown value counts as "not set"
  l: z.enum(TODO_LISTS).optional().catch(undefined),
  a: z.enum(WHO_FILTERS).optional().catch(undefined),
  // Open this item's form (from the home block)
  edit: z.string().regex(UUID_SHAPE).optional().catch(undefined),
})

/** Chip value for "no filter" */
const ALL = 'all'

export const Route = createFileRoute('/todos')({
  component: Page,
  validateSearch: (s) => search.parse(s),
  loader: async () => {
    const [{ todos, todayKey, viewer }, { members }] = await Promise.all([
      listTodos(),
      getMembers(),
    ])
    return { todos, todayKey, viewer, members }
  },
})

function Page() {
  const { todos: loaded, todayKey, viewer, members } = Route.useLoaderData()
  const { l, a, edit } = Route.useSearch()
  const navigate = useNavigate({ from: '/todos' })
  const router = useRouter()
  const tick = useServerFn(setTodoDone)
  const remove = useServerFn(deleteTodo)
  const pendingDeletes = usePendingDeletes()
  // Ticks applied on the device before the server answers, so the row moves at once
  const [optimistic, setOptimistic] = useState<Record<string, string | null>>({})
  const [opened, setOpened] = useState(edit !== undefined)
  const [editing, setEditing] = useState<Todo | null>(
    () => loaded.find((t) => t.id === edit) ?? null,
  )

  const todos = loaded
    .filter((t) => !pendingDeletes.has(t.id))
    .map((t) => (t.id in optimistic ? { ...t, doneAt: optimistic[t.id] } : t))
  const visible = filterTodos(todos, { list: l, who: a }, viewer)
  const groups = groupTodos(visible, todayKey)
  const openSections = TODO_SECTIONS.filter((s) => s !== 'done' && groups[s].length > 0)
  const nothingOpen = openSections.length === 0

  function openNew() {
    setEditing(null)
    setOpened(true)
  }
  function openEdit(todo: Todo) {
    setEditing(todo)
    setOpened(true)
  }
  function close() {
    setOpened(false)
    if (edit) navigate({ search: (s) => ({ ...s, edit: undefined }), replace: true })
  }

  async function toggle(todo: Todo, done: boolean) {
    setOptimistic((o) => ({ ...o, [todo.id]: done ? new Date().toISOString() : null }))
    try {
      const res = await tick({ data: { id: todo.id, done } })
      if (!res.ok)
        notifications.show({ message: 'そのやることは相手が消していました', color: 'orange' })
      await router.invalidate()
    } catch {
      notifications.show({ message: '保存できませんでした', color: 'red' })
    } finally {
      setOptimistic((o) => {
        const { [todo.id]: _dropped, ...rest } = o
        return rest
      })
    }
  }

  function del(todo: Todo) {
    close()
    deleteWithUndo({
      id: todo.id,
      message: `「${todo.title}」を削除しました`,
      commit: async (fetch) => {
        await remove({ data: { id: todo.id }, fetch })
        await router.invalidate()
      },
    })
  }

  const chips = (
    <Stack gap="xs">
      <Chip.Group
        value={l ?? ALL}
        onChange={(v) =>
          navigate({ search: (s) => ({ ...s, l: v === ALL ? undefined : (v as typeof l) }) })
        }
      >
        <ChipRow label="分類">
          <Chip value={ALL} size="sm">
            すべて
          </Chip>
          {TODO_LISTS.map((list) => (
            <Chip key={list} value={list} size="sm">
              {TODO_LIST_LABEL[list]}
            </Chip>
          ))}
        </ChipRow>
      </Chip.Group>
      <Chip.Group
        value={a ?? ALL}
        onChange={(v) =>
          navigate({ search: (s) => ({ ...s, a: v === ALL ? undefined : (v as typeof a) }) })
        }
      >
        <ChipRow label="担当">
          <Chip value={ALL} size="sm" variant="outline">
            すべて
          </Chip>
          {WHO_FILTERS.map((who) => (
            <Chip key={who} value={who} size="sm" variant="outline">
              {WHO_FILTER_LABEL[who]}
            </Chip>
          ))}
        </ChipRow>
      </Chip.Group>
    </Stack>
  )

  return (
    <PageShell
      title="やること"
      description="引越し・アカウント・お金の、ふたりでやること"
      actions={
        <Button onClick={openNew} visibleFrom="md" style={{ alignSelf: 'flex-start' }}>
          やることを追加
        </Button>
      }
      fab
    >
      {chips}
      {nothingOpen ? (
        <EmptyState
          emoji="✅"
          title={l || a ? 'この条件のやることはありません' : 'やることはありません'}
          description={l || a ? undefined : '右下の「やることを追加」から入れられます'}
        />
      ) : (
        openSections.map((s) => (
          <Stack key={s} gap="xs">
            <Title order={2} size="h4">
              {TODO_SECTION_LABEL[s]}{' '}
              <Text component="span" c="dimmed" fw={400} size="sm">
                {groups[s].length}
              </Text>
            </Title>
            <Stack gap="sm">
              {groups[s].map((t) => (
                <TodoRow
                  key={t.id}
                  todo={t}
                  members={members}
                  todayKey={todayKey}
                  onToggle={(done) => toggle(t, done)}
                  onOpen={() => openEdit(t)}
                />
              ))}
            </Stack>
          </Stack>
        ))
      )}
      {groups.done.length > 0 ? (
        <Accordion variant="separated" chevronPosition="left">
          <Accordion.Item value="done">
            <Accordion.Control>
              {TODO_SECTION_LABEL.done}{' '}
              <Text component="span" c="dimmed" size="sm">
                {groups.done.length}
              </Text>
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="sm">
                {groups.done.map((t) => (
                  <TodoRow
                    key={t.id}
                    todo={t}
                    members={members}
                    todayKey={todayKey}
                    onToggle={(done) => toggle(t, done)}
                    onOpen={() => openEdit(t)}
                  />
                ))}
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
      ) : null}
      <Fab label="やることを追加" onClick={openNew} />
      <FormDrawer
        opened={opened}
        onClose={close}
        title={editing ? 'やることを編集' : 'やることを追加'}
      >
        <TodoForm
          key={editing?.id ?? 'new'}
          todo={editing}
          members={members}
          defaults={{ list: l }}
          onSaved={close}
        />
        {editing ? (
          <DeleteSection label="このやることを削除" onDelete={() => del(editing)} />
        ) : null}
      </FormDrawer>
    </PageShell>
  )
}
