import { Button, Container, Group, Stack, Text, Title, VisuallyHidden } from '@mantine/core'
import { ChevronLeft } from 'lucide-react'

export function PageShell({
  title,
  description,
  actions,
  back,
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
  /** 親ページへ戻るリンク（詳細ページ用。<BackButton> を渡す）。見出しの上に置き、スマホでも
   * ブラウザの戻るに頼らず一覧へ戻れるようにする（SHIG 59 ウェイファインディング・60 エスケープハッチ） */
  back?: React.ReactNode
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
            {back}
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

/**
 * 詳細ページの「← 一覧」。renderLink で Link（to / search / params）を渡す。
 * 文言は親ページの名前（名詞）で揃える: 候補・記録・地図・用語集
 */
export function BackButton({
  label,
  renderLink,
}: {
  label: string
  renderLink: (rootProps: Record<string, unknown>) => React.ReactElement
}) {
  return (
    <Button
      renderRoot={renderLink}
      variant="subtle"
      size="compact-sm"
      px={0}
      leftSection={<ChevronLeft size={16} aria-hidden />}
      style={{ alignSelf: 'flex-start' }}
    >
      {label}
    </Button>
  )
}
