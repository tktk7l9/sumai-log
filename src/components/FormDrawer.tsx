import { Drawer } from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'

/** スマホでは下から全画面、デスクトップでは右から幅 480 の Drawer */
export function FormDrawer({
  opened,
  onClose,
  title,
  children,
}: {
  opened: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
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
      styles={{ title: { fontWeight: 700, fontSize: 'var(--mantine-font-size-lg)' } }}
    >
      {children}
    </Drawer>
  )
}
