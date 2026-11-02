import { ActionIcon, Badge, Checkbox, Group, Text, UnstyledButton } from '@mantine/core'
import { ExternalLink } from 'lucide-react'

import { TODO_LIST_LABEL, type Todo } from '../../db/schema'
import type { Member } from '../../lib/members'
import { dueLabel } from '../../lib/todos'
import { MemberChip } from '../MemberChip'

/**
 * One to-do. The checkbox ticks it (no confirm; unticking is the undo), the title opens the
 * edit form. The countdown is text, not only colour (SHIG 96)
 */
export function TodoRow({
  todo,
  members,
  todayKey,
  onToggle,
  onOpen,
}: {
  todo: Todo
  members: readonly Member[]
  todayKey: string
  onToggle: (done: boolean) => void
  onOpen: () => void
}) {
  const done = todo.doneAt !== null
  const due = done ? null : dueLabel(todo.dueOn, todayKey)
  const overdue = due !== null && due.endsWith('過ぎ')
  return (
    <Group
      gap="sm"
      wrap="nowrap"
      align="flex-start"
      className="todo-row"
      data-done={done || undefined}
    >
      <Checkbox
        checked={done}
        onChange={(e) => onToggle(e.currentTarget.checked)}
        aria-label={`${todo.title} を${done ? '未完了に戻す' : '完了にする'}`}
        size="md"
        mt={2}
      />
      <UnstyledButton
        onClick={onOpen}
        className="todo-row-main"
        aria-label={`${todo.title} を編集`}
      >
        <Text fw={500} td={done ? 'line-through' : undefined} c={done ? 'dimmed' : undefined}>
          {todo.title}
        </Text>
        <Group gap={6} mt={4} wrap="wrap">
          <Badge variant="light" color="gray" size="sm">
            {TODO_LIST_LABEL[todo.list]}
          </Badge>
          {due ? (
            <Badge variant="light" color={overdue ? 'red' : 'clay'} size="sm">
              {overdue ? `期限 ${due}` : due}
            </Badge>
          ) : null}
          {todo.assignee ? <MemberChip email={todo.assignee} members={members} /> : null}
          {todo.note ? (
            <Text size="xs" c="dimmed" lineClamp={1} style={{ flexBasis: '100%' }}>
              {todo.note}
            </Text>
          ) : null}
        </Group>
      </UnstyledButton>
      {todo.url ? (
        <ActionIcon
          component="a"
          href={todo.url}
          target="_blank"
          rel="noreferrer"
          variant="subtle"
          color="gray"
          size="lg"
          aria-label={`${todo.title} のリンクを開く`}
        >
          <ExternalLink size={18} aria-hidden />
        </ActionIcon>
      ) : null}
    </Group>
  )
}
