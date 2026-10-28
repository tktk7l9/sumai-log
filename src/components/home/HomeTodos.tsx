import { Anchor, Card, Group, Stack, Text, Title } from '@mantine/core'
import { Link } from '@tanstack/react-router'

import type { Todo } from '../../db/schema'
import type { Member } from '../../lib/members'
import { dueLabel } from '../../lib/todos'
import { MemberChip } from '../MemberChip'

/**
 * The to-dos that need attention: overdue, today and this week (already picked and ordered
 * by the server through src/lib/todos.ts homeTodos). Hidden when there is nothing, so the
 * home page does not carry an empty box
 */
export function HomeTodos({
  todos,
  members,
  todayKey,
}: {
  todos: readonly Todo[]
  members: readonly Member[]
  todayKey: string
}) {
  if (todos.length === 0) return null
  return (
    <Stack gap="xs">
      <Group justify="space-between" align="baseline">
        <Title order={2}>やること</Title>
        <Anchor component={Link} to="/todos" size="sm">
          すべて見る
        </Anchor>
      </Group>
      <Card withBorder padding="sm">
        <Stack gap="xs">
          {todos.map((t) => {
            const due = dueLabel(t.dueOn, todayKey)
            const overdue = due !== null && due.endsWith('過ぎ')
            return (
              <Group key={t.id} gap="sm" wrap="nowrap" justify="space-between">
                <Anchor
                  renderRoot={(props) => <Link to="/todos" search={{ edit: t.id }} {...props} />}
                  fw={500}
                  c="inherit"
                >
                  {t.title}
                </Anchor>
                <Group gap="xs" wrap="nowrap">
                  {t.assignee ? <MemberChip email={t.assignee} members={members} iconOnly /> : null}
                  {due ? (
                    <Text size="sm" c={overdue ? 'red' : 'dimmed'} style={{ whiteSpace: 'nowrap' }}>
                      {overdue ? `期限 ${due}` : due}
                    </Text>
                  ) : null}
                </Group>
              </Group>
            )
          })}
        </Stack>
      </Card>
    </Stack>
  )
}
