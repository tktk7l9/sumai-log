import { Avatar, Group, Text } from '@mantine/core'

import { findMember, type Member } from '../lib/members'

/**
 * The color of the "who wrote it" band drawn on the left edge of a card. Builds the
 * Mantine variable from the configured color name (MEMBER_COLORS in `src/lib/members.ts`).
 *
 * It uses shade 6 of the color name = the core of that color. The circle of MemberChip
 * (the light variant of Avatar) is dark text on a pale ground of the same color name
 * (light is shade 9 text on a shade 1 ground, dark is the reverse), so the band and the
 * circle match by "the same color name" but not by the same shade. This is because a 3px
 * band is invisible in a pale shade.
 */
export function authorBandColor(members: readonly Member[], email: string): string {
  return `var(--mantine-color-${findMember(members, email).color}-6)`
}

/**
 * A round initial and the display name. In lists, "who" can be followed by the circle and
 * the left-edge band.
 * Setting `iconOnly` shows only the circle without the name text (for cases such as rows
 * of recent updates, where who wrote it is already clear together with the color of the
 * left-edge band). The name stays as `title`/`aria-label` of the circle, so it is not lost
 * for accessibility.
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
    // The default light variant = dark text on a pale ground. A filled one lowers the contrast of
    // white text
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
