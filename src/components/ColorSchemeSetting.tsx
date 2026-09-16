import { SegmentedControl, Stack, Text, useMantineColorScheme } from '@mantine/core'
import { useEffect, useState } from 'react'

const OPTIONS = [
  { label: '自動', value: 'auto' },
  { label: 'ライト', value: 'light' },
  { label: 'ダーク', value: 'dark' },
]

export function ColorSchemeSetting() {
  const { colorScheme, setColorScheme } = useMantineColorScheme()
  // サーバーは常に 'auto' を描画する。クライアントの保存値でずれるとハイドレーション不整合になるので、
  // マウント後に初めて実際の値を出す（旧 ColorSchemeToggle の getInitialValueInEffect と同じ考え方）。
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  return (
    <Stack gap="xs">
      <SegmentedControl
        aria-label="配色"
        value={mounted ? colorScheme : 'auto'}
        onChange={(value) => setColorScheme(value as 'auto' | 'light' | 'dark')}
        data={OPTIONS}
        fullWidth
      />
      <Text size="xs" c="dimmed">
        端末の設定に合わせるには「自動」
      </Text>
    </Stack>
  )
}
