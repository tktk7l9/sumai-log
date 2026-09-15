import { Drawer } from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'

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
  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      title={title}
      position={isMobile ? 'bottom' : 'right'}
      size={isMobile ? '100%' : 480}
      padding="md"
      zIndex={zIndex}
      styles={{ title: { fontWeight: 700, fontSize: 'var(--mantine-font-size-lg)' } }}
    >
      {children}
    </Drawer>
  )
}
