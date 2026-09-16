import { Avatar, Group, Text } from '@mantine/core'

import { findMember, type Member } from '../lib/members'

/**
 * カードの左端に引く「誰が書いたか」の帯の色。設定の色名（`src/lib/members.ts` の
 * MEMBER_COLORS）から Mantine の変数を組み立てる。
 *
 * 使うのは色名の 6 段目＝その色の芯。MemberChip の丸（Avatar の light バリアント）は
 * 同じ色名の淡い地に濃い字（light は 1 段目の地に 9 段目の字、ダークは逆）なので、
 * 帯と丸は「同じ色名」で揃うが、同じ段ではない。3px の帯は薄い段だと見えないため。
 */
export function authorBandColor(members: readonly Member[], email: string): string {
  return `var(--mantine-color-${findMember(members, email).color}-6)`
}

/**
 * 丸いイニシャルと表示名。一覧では丸と左端の帯で「誰が」を追える。
 * `iconOnly` を立てると丸だけにして名前のテキストを出さない（最近の更新の行など、
 * 誰が書いたかは左端の帯の色と合わせて既に分かる場面向け）。名前は丸の
 * `title`/`aria-label` として残すので、アクセシビリティ上は失われない。
 */
export function MemberChip({
  email,
  members,
  iconOnly = false,
}: {
  email: string
  members: readonly Member[]
  iconOnly?: boolean
}) {
  const m = findMember(members, email)
  const avatar = (
    // 既定の light バリアント＝淡い地に濃い字。塗りつぶすと白字のコントラストが落ちる
    <Avatar
      size={22}
      radius="xl"
      color={m.color}
      fz={11}
      fw={700}
      title={iconOnly ? m.displayName : undefined}
      aria-label={iconOnly ? m.displayName : undefined}
    >
      {m.displayName.slice(0, 1)}
    </Avatar>
  )
  if (iconOnly) return avatar
  return (
    <Group gap={6} wrap="nowrap">
      {avatar}
      <Text size="xs" c="dimmed">
        {m.displayName}
      </Text>
    </Group>
  )
}
