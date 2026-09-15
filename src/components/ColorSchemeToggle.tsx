import { ActionIcon, useComputedColorScheme, useMantineColorScheme } from '@mantine/core'
import { Moon, Sun } from 'lucide-react'

export function ColorSchemeToggle() {
  const { setColorScheme } = useMantineColorScheme()
  const computed = useComputedColorScheme('light', { getInitialValueInEffect: true })
  const next = computed === 'dark' ? 'light' : 'dark'

  return (
    <ActionIcon
      variant="default"
      size="lg"
      aria-label={next === 'dark' ? 'ダークモードに切り替え' : 'ライトモードに切り替え'}
      onClick={() => setColorScheme(next)}
    >
      {computed === 'dark' ? <Sun size={18} aria-hidden /> : <Moon size={18} aria-hidden />}
    </ActionIcon>
  )
}
