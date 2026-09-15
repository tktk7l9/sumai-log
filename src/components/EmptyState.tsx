import { Card, Stack, Text } from '@mantine/core'

/**
 * 何も無いときの枠。絵文字ひとつ・一文・（あれば）次の一手のボタン、だけを置く。
 * 絵文字は飾りなので読み上げからは外す。
 */
export function EmptyState({
  emoji = '🏠',
  title,
  description,
  action,
}: {
  emoji?: string
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <Card withBorder padding="lg" className="sunken">
      <Stack align="center" gap="xs" ta="center">
        <Text fz={32} lh={1} aria-hidden>
          {emoji}
        </Text>
        <Text fw={600}>{title}</Text>
        {/* 沈めた面の上では dimmed（gray-6 / dark-2）が 3.9:1 / 3.5:1 までしか出ないので、
            添えの一文も本文色のまま置く。主従は大きさ（14 と 16）と太さで付ける */}
        {description ? <Text size="sm">{description}</Text> : null}
        {action ? <Stack pt={4}>{action}</Stack> : null}
      </Stack>
    </Card>
  )
}
