import { Stack, Text } from '@mantine/core'
import type { ReactNode } from 'react'

import type { Count } from '../../lib/analysis'

/**
 * 件数の横棒リスト（1 系列なので凡例は置かず、見出しが系列を名乗る）。棒は多いほど長く、
 * 数値は棒の右に文字色で書く（色だけに頼らない）。renderName で名前をリンクなどにできる
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
