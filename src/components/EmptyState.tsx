import { Card, Stack, Text } from '@mantine/core'

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <Card withBorder padding="lg" bg="var(--mantine-color-default-hover)">
      <Stack align="center" gap="xs" ta="center">
        <Text fw={600}>{title}</Text>
        {description ? (
          <Text size="sm" c="dimmed">
            {description}
          </Text>
        ) : null}
        {action}
      </Stack>
    </Card>
  )
}
