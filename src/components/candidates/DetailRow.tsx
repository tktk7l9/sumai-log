import { Group, Text } from '@mantine/core'

/** 1 "label: value" row of a detail page. Shared by vendors/$id and properties/$id */
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
