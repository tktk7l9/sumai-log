import { Drawer } from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { useEffect } from 'react'

/**
 * While the soft keyboard is shown on a phone, keep the Drawer above the keyboard.
 *
 * iOS Safari does not shrink the layout viewport (100% / 100dvh) when the keyboard
 * appears; only the visible area (visualViewport) gets smaller. A position: fixed Drawer
 * stays full screen, so the inputs in the lower half were hidden under the keyboard and
 * could not be typed into (reported by the owner, 2026-09-19). The height and top offset
 * of visualViewport are fed into CSS variables, and the outer frame of the Drawer is
 * fitted to that area. The focused field is scrolled into a visible position after the
 * size change.
 */
function useKeyboardSafeViewport(active: boolean) {
  useEffect(() => {
    if (!active) return
    const vv = window.visualViewport
    if (!vv) return
    const root = document.documentElement
    let raf = 0
    const update = () => {
      root.style.setProperty('--form-drawer-height', `${Math.round(vv.height)}px`)
      root.style.setProperty('--form-drawer-top', `${Math.round(vv.offsetTop)}px`)
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const el = document.activeElement
        if (el instanceof HTMLElement && el.matches('input, textarea, select, [contenteditable]')) {
          el.scrollIntoView({ block: 'center', behavior: 'smooth' })
        }
      })
    }
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      cancelAnimationFrame(raf)
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
      root.style.removeProperty('--form-drawer-height')
      root.style.removeProperty('--form-drawer-top')
    }
  }, [active])
}

/**
 * A Drawer that is full screen from the bottom on phones, and 480 wide from the right on desktop
 */
export function FormDrawer({
  opened,
  onClose,
  title,
  children,
  zIndex,
}: {
  opened: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  /** Defaults to Mantine's modal default (200). On the map tab, the controls overlaid on
   * the map are drawn at z-index: 1000, so pages that want to appear above them pass it
   * explicitly */
  zIndex?: number
}) {
  const isMobile = useMediaQuery('(max-width: 48em)', true)
  useKeyboardSafeViewport(opened && isMobile)
  return (
    // Composed from the parts so that the header can be a plain <div>: Mantine renders it
    // as <header>, which inside a dialog counts as a second "banner" landmark next to the
    // app header
    <Drawer.Root
      opened={opened}
      onClose={onClose}
      position={isMobile ? 'bottom' : 'right'}
      size={isMobile ? '100%' : 480}
      padding="md"
      zIndex={zIndex}
      styles={{
        title: { fontWeight: 700, fontSize: 'var(--mantine-font-size-lg)' },
        ...(isMobile
          ? {
              // inner is the outer frame with position: fixed; inset: 0. Shrink it by the
              // keyboard height and align the top edge
              inner: {
                top: 'var(--form-drawer-top, 0px)',
                bottom: 'auto',
                height: 'var(--form-drawer-height, 100%)',
              },
              // The form body scrolls inside the shrunken outer frame (content is overflow-y: auto)
              content: { height: '100%', maxHeight: '100%' },
            }
          : {}),
      }}
    >
      <Drawer.Overlay />
      <Drawer.Content>
        <Drawer.Header component="div">
          <Drawer.Title>{title}</Drawer.Title>
          <Drawer.CloseButton aria-label="閉じる" />
        </Drawer.Header>
        <Drawer.Body>{children}</Drawer.Body>
      </Drawer.Content>
    </Drawer.Root>
  )
}
