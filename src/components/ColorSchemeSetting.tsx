import { SegmentedControl, Stack, Text, useMantineColorScheme } from '@mantine/core'
import { useEffect, useState } from 'react'

const OPTIONS = [
  { label: '自動', value: 'auto' },
  { label: 'ライト', value: 'light' },
  { label: 'ダーク', value: 'dark' },
]

export function ColorSchemeSetting() {
  const { colorScheme, setColorScheme } = useMantineColorScheme()
  // The server always renders 'auto'. If the client's stored value differs, it causes a
  // hydration mismatch, so the actual value is shown only after mount (same idea as
  // getInitialValueInEffect of the former ColorSchemeToggle).
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
