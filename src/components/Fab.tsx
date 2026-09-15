import { Affix, Button, rem } from '@mantine/core'
import { Plus } from 'lucide-react'

/** 右下の追加ボタン。下タブ(56px)の 16px 上、ホームインジケータの分だけさらに上に浮かせる */
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
