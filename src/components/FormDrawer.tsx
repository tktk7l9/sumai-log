import { Drawer } from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { useEffect } from 'react'

/**
 * スマホでソフトキーボードが出ている間、Drawer をキーボードの上に収める。
 *
 * iOS Safari はキーボードが出てもレイアウトビューポート（100% / 100dvh）を縮めず、
 * 見えている範囲（visualViewport）だけが小さくなる。position: fixed の Drawer は
 * 画面いっぱいのままなので、下半分の入力欄がキーボードの下に隠れて打てなかった
 * （所有者の報告、2026-09-19）。visualViewport の高さと上端オフセットを CSS 変数に
 * 流し、Drawer の外枠をその範囲に合わせる。フォーカス中の欄はサイズ変更後に
 * 見える位置へスクロールする。
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

/** スマホでは下から全画面、デスクトップでは右から幅 480 の Drawer */
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
  /** 既定は Mantine の modal 既定値（200）。地図タブでは Leaflet の操作コントロールが
   * z-index: 1000 で描かれるため、その上に出したいページから明示的に渡す */
  zIndex?: number
}) {
  const isMobile = useMediaQuery('(max-width: 48em)', true)
  useKeyboardSafeViewport(opened && isMobile)
  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      title={title}
      position={isMobile ? 'bottom' : 'right'}
      size={isMobile ? '100%' : 480}
      padding="md"
      zIndex={zIndex}
      styles={{
        title: { fontWeight: 700, fontSize: 'var(--mantine-font-size-lg)' },
        ...(isMobile
          ? {
              // inner は position: fixed; inset: 0 の外枠。キーボード分だけ縮めて上端を合わせる
              inner: {
                top: 'var(--form-drawer-top, 0px)',
                bottom: 'auto',
                height: 'var(--form-drawer-height, 100%)',
              },
              // 縮んだ外枠の中でフォーム本体がスクロールする（content は overflow-y: auto）
              content: { height: '100%', maxHeight: '100%' },
            }
          : {}),
      }}
    >
      {children}
    </Drawer>
  )
}
