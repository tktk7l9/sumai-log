import { Avatar, Group, Text } from '@mantine/core'

import { findMember, type Member } from '../lib/members'

export function MemberChip({ email, members }: { email: string; members: readonly Member[] }) {
  const m = findMember(members, email)
  return (
    <Group gap={6} wrap="nowrap">
      <Avatar size={22} radius="xl" color={m.color}>
        {m.displayName.slice(0, 1)}
      </Avatar>
      <Text size="xs" c="dimmed">
        {m.displayName}
      </Text>
    </Group>
  )
}
