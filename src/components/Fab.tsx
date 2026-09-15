import { Affix, Button, rem } from '@mantine/core'
import { Plus } from 'lucide-react'

/** 右下の追加ボタン。下タブとホームインジケータの上に浮かせる */
export function Fab({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Affix
      position={{ bottom: `calc(${rem(80)} + env(safe-area-inset-bottom, 0px))`, right: rem(16) }}
    >
      <Button
        size="lg"
        radius="xl"
        leftSection={<Plus size={20} aria-hidden />}
        onClick={onClick}
        style={{ boxShadow: 'var(--mantine-shadow-lg)' }}
      >
        {label}
      </Button>
    </Affix>
  )
}
