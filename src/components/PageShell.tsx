import { Container, Stack, Text, Title } from '@mantine/core'

export function PageShell({
  title,
  description,
  actions,
  fab = false,
  children,
}: {
  title: string
  description?: React.ReactNode
  /** 見出しの右に置く操作（デスクトップ用。スマホは FAB を使う） */
  actions?: React.ReactNode
  /** このページが <Fab> を出すか。true なら最後のカードが隠れないよう下に余白を足す */
  fab?: boolean
  children?: React.ReactNode
}) {
  return (
    <Container size="sm" px={0} className={fab ? 'fab-clearance' : undefined}>
      {/* 見出しと中身の間は 24px（セクション間と同じ）。見出しの中は 4px で束ねる */}
      <Stack gap="lg">
        <Stack gap={4}>
          <Title order={1}>{title}</Title>
          {description ? (
            <Text c="dimmed" size="sm">
              {description}
            </Text>
          ) : null}
          {actions ? <Stack pt={4}>{actions}</Stack> : null}
        </Stack>
        {children}
      </Stack>
    </Container>
  )
}
