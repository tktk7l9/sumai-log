import { Stack, Text } from '@mantine/core'
import type { ReactNode } from 'react'

import type { Count } from '../../lib/analysis'

/**
 * A horizontal bar list of counts (1 series, so there is no legend and the heading names
 * the series). A bar is longer for a larger count, and the number is written to the right
 * of the bar in the text color (not relying on color alone). renderName can turn the name
 * into a link, etc.
 */
export function CountBars({
  items,
  unit,
  renderName,
  empty,
}: {
  items: Count[]
  unit: string
  renderName?: (item: Count) => ReactNode
  empty: string
}) {
  if (items.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        {empty}
      </Text>
    )
  }
  const max = Math.max(...items.map((i) => i.count))
  return (
    <Stack gap={6} component="ul" className="analysis-bars">
      {items.map((item) => {
        return (
          <li key={item.name} className="analysis-bar-row">
            <Text size="sm" className="analysis-bar-name" title={item.name}>
              {renderName ? renderName(item) : item.name}
            </Text>
            <span className="analysis-bar-track" aria-hidden>
              <span
                className="analysis-bar-fill"
                style={{ width: `${(item.count / max) * 100}%` }}
              />
            </span>
            <Text size="sm" className="analysis-bar-value">
              {item.count}
              {unit}
            </Text>
          </li>
        )
      })}
    </Stack>
  )
}
