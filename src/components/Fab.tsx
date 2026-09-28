import { Affix, Button, rem } from '@mantine/core'
import { Plus } from 'lucide-react'

/**
 * The add button at the bottom right. Floats 16px above the bottom tabs (56px), and further up by
 * the home indicator height
 */
export function Fab({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Affix
      position={{ bottom: `calc(${rem(72)} + env(safe-area-inset-bottom, 0px))`, right: rem(16) }}
    >
      <Button
        size="lg"
        radius="xl"
        leftSection={<Plus size={20} aria-hidden />}
        onClick={onClick}
        className="lifted"
      >
        {label}
      </Button>
    </Affix>
  )
}
