import { Card, Stack, Text } from '@mantine/core'

/**
 * The frame for when there is nothing. It holds only one emoji, one sentence, and (if any)
 * a button for the next step.
 * The emoji is decoration, so it is excluded from screen reading.
 */
export function EmptyState({
  emoji = '🏠',
  title,
  description,
  action,
}: {
  emoji?: string
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <Card withBorder padding="lg" className="sunken">
      <Stack align="center" gap="xs" ta="center">
        <Text fz={32} lh={1} aria-hidden>
          {emoji}
        </Text>
        <Text fw={600}>{title}</Text>
        {/* On the sunken surface, dimmed (gray-6 / dark-2) only reaches 3.9:1 / 3.5:1, so
            the supporting sentence also stays in the body color. Hierarchy comes from size
            (14 and 16) and weight */}
        {description ? <Text size="sm">{description}</Text> : null}
        {action ? <Stack pt={4}>{action}</Stack> : null}
      </Stack>
    </Card>
  )
}
