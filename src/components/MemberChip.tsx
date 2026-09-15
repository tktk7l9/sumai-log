import { Avatar, Group, Text } from '@mantine/core'

import { findMember, type Member } from '../lib/members'

/**
 * カードの左端に引く「誰が書いたか」の帯の色。MemberChip の丸と同じ色を使う。
 * 設定の色名（`src/lib/members.ts` の MEMBER_COLORS）から Mantine の変数を組み立てる。
 */
export function authorBandColor(members: readonly Member[], email: string): string {
  return `var(--mantine-color-${findMember(members, email).color}-6)`
}

/** 丸いイニシャルと表示名。一覧では丸と左端の帯で「誰が」を追える */
export function MemberChip({ email, members }: { email: string; members: readonly Member[] }) {
  const m = findMember(members, email)
  return (
    <Group gap={6} wrap="nowrap">
      {/* 既定の light バリアント＝淡い地に濃い字。塗りつぶすと白字のコントラストが落ちる */}
      <Avatar size={22} radius="xl" color={m.color} fz={11} fw={700}>
        {m.displayName.slice(0, 1)}
      </Avatar>
      <Text size="xs" c="dimmed">
        {m.displayName}
      </Text>
    </Group>
  )
}
