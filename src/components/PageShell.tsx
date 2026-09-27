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
  /** When omitted, the heading block is not rendered (for pages that start with section
   * headings, like home). Non-strings (such as favicon + name on the vendor detail) can
   * also be passed */
  title?: React.ReactNode
  description?: React.ReactNode
  /** Actions placed to the right of the heading (for desktop. Phones use the FAB) */
  actions?: React.ReactNode
  /** Link back to the parent page (for detail pages. Pass <BackButton>). Placed above the
   * heading so that, on phones too, the list can be reached without relying on the
   * browser's back (SHIG 59 wayfinding, 60 escape hatch) */
  back?: React.ReactNode
  /**
   * Whether this page renders <Fab>. If true, bottom spacing is added so the last card is not
   * hidden
   */
  fab?: boolean
  /**
   * If true, the heading and description are laid out in 1 row (with wrapping) instead of stacked
   */
  inlineDescription?: boolean
  /** If true, the h1 is exposed only to assistive technology and not shown on screen (for
   * pages where it would be redundant with the same wording as the bottom tab label. The
   * heading hierarchy is kept). description and actions are not rendered either */
  titleHidden?: boolean
  children?: React.ReactNode
}) {
  return (
    <Container size="sm" px={0} className={fab ? 'fab-clearance' : undefined}>
      {/* 24px between the heading and the content (same as between sections). Inside the
          heading, 4px groups the items */}
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
 * The "<- list" link of detail pages. Pass a Link (to / search / params) through renderLink.
 * The wording is unified to the parent page's name (a noun): "候補" (candidates),
 * "記録" (records), "地図" (map), "用語集" (glossary)
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
