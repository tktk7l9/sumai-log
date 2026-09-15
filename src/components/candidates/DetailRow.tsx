import { Group, Text } from '@mantine/core'

/** 詳細ページの「ラベル: 値」1 行。vendors/$id と properties/$id で共有する */
export function Row({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <Group justify="space-between" wrap="nowrap" align="flex-start">
      <Text size="sm" c="dimmed" style={{ flexShrink: 0 }}>
        {label}
      </Text>
      <Text size="sm" ta="right" className="breakable">
        {value ?? '—'}
      </Text>
    </Group>
  )
}
