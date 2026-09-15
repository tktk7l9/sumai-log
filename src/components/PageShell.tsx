import { Container, Stack, Text, Title } from '@mantine/core'

export function PageShell({
  title,
  description,
  actions,
  children,
}: {
  title: string
  description?: React.ReactNode
  /** 見出しの右に置く操作（デスクトップ用。スマホは FAB を使う） */
  actions?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <Container size="sm" px={0}>
      <Stack gap="lg">
        <Stack gap={4}>
          <Title order={1}>{title}</Title>
          {description ? (
            <Text c="dimmed" size="sm">
              {description}
            </Text>
          ) : null}
          {actions}
        </Stack>
        {children}
      </Stack>
    </Container>
  )
}
