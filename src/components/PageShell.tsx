import { Container, Group, Stack, Text, Title, VisuallyHidden } from '@mantine/core'

export function PageShell({
  title,
  description,
  actions,
  fab = false,
  inlineDescription = false,
  titleHidden = false,
  children,
}: {
  /** 省略すると見出しブロックを出さない（ホームのように節見出しから始めるページ用）。
   * 文字列以外（業者詳細のファビコン + 名前など）も渡せる */
  title?: React.ReactNode
  description?: React.ReactNode
  /** 見出しの右に置く操作（デスクトップ用。スマホは FAB を使う） */
  actions?: React.ReactNode
  /** このページが <Fab> を出すか。true なら最後のカードが隠れないよう下に余白を足す */
  fab?: boolean
  /** true なら見出しと説明文を縦積みではなく 1 行（折り返しあり）で並べる */
  inlineDescription?: boolean
  /** true なら h1 を支援技術にだけ伝えて画面には出さない（下タブのラベルと同じ文言で
   * 冗長になるページ用。見出し階層は保つ）。description と actions も出さない */
  titleHidden?: boolean
  children?: React.ReactNode
}) {
  return (
    <Container size="sm" px={0} className={fab ? 'fab-clearance' : undefined}>
      {/* 見出しと中身の間は 24px（セクション間と同じ）。見出しの中は 4px で束ねる */}
      <Stack gap="lg">
        {titleHidden ? (
          <VisuallyHidden>
            <Title order={1}>{title}</Title>
          </VisuallyHidden>
        ) : title === undefined ? (
          actions ? (
            <Stack pt={4}>{actions}</Stack>
          ) : null
        ) : (
          <Stack gap={4}>
            {inlineDescription && description ? (
              <Group gap="sm" align="baseline" wrap="wrap">
                <Title order={1}>{title}</Title>
                <Text c="dimmed" size="sm">
                  {description}
                </Text>
              </Group>
            ) : (
              <>
                <Title order={1}>{title}</Title>
                {description ? (
                  <Text c="dimmed" size="sm">
                    {description}
                  </Text>
                ) : null}
              </>
            )}
            {actions ? <Stack pt={4}>{actions}</Stack> : null}
          </Stack>
        )}
        {children}
      </Stack>
    </Container>
  )
}
