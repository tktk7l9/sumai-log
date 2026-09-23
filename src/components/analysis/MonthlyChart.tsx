import { Group, Table, Text } from '@mantine/core'
import { useEffect, useRef, useState } from 'react'

import type { MonthRow } from '../../lib/analysis'

const SERIES = [
  { key: 'visits', label: '見学', className: 'analysis-series-visit' },
  { key: 'videos', label: '動画', className: 'analysis-series-video' },
] as const

/**
 * 月ごとの見学・動画の件数（縦棒を 2 本ずつ並べる）。色は検証済みの 2 色（styles.css の
 * --sumai-series-*）で、凡例と棒の上の数値を必ず添える。棒にカーソル・指を当てると
 * その月の内訳を出し、「表で見る」で同じ数を表にできる
 */
export function MonthlyChart({ rows }: { rows: MonthRow[] }) {
  const [active, setActive] = useState<string | null>(null)
  const [asTable, setAsTable] = useState(false)
  // 横に長いときは最新の月（右端）が見えるところから始める
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [rows.length, asTable])
  if (rows.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        まだ日付のある記録がありません。
      </Text>
    )
  }
  const max = Math.max(1, ...rows.flatMap((r) => [r.visits, r.videos]))
  const bar = 8
  const gap = 2
  const slot = bar * 2 + gap + 14
  const height = 110
  const top = 16
  const width = rows.length * slot
  const hovered = rows.find((r) => r.month === active)

  return (
    <div>
      <Group justify="space-between" mb={6} wrap="nowrap">
        <Group gap="md" component="ul" className="analysis-legend">
          {SERIES.map((s) => (
            <li key={s.key}>
              <span className={`analysis-swatch ${s.className}`} aria-hidden />
              <Text span size="xs">
                {s.label}
              </Text>
            </li>
          ))}
        </Group>
        <Text
          size="xs"
          c="dimmed"
          component="button"
          type="button"
          className="analysis-link-button"
          onClick={() => setAsTable((v) => !v)}
        >
          {asTable ? 'グラフで見る' : '表で見る'}
        </Text>
      </Group>

      {asTable ? (
        <Table fz="sm" withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>月</Table.Th>
              <Table.Th ta="right">見学</Table.Th>
              <Table.Th ta="right">動画</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((r) => (
              <Table.Tr key={r.month}>
                <Table.Td>{monthLabel(r.month)}</Table.Td>
                <Table.Td ta="right">{r.visits}</Table.Td>
                <Table.Td ta="right">{r.videos}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      ) : (
        <>
          <div className="analysis-chart-scroll" ref={scrollRef}>
            <svg
              width={Math.max(width, 200)}
              height={height + top + 20}
              role="img"
              aria-label={`月ごとの見学と動画の件数。${rows.map((r) => `${monthLabel(r.month)} 見学${r.visits}件・動画${r.videos}件`).join('、')}`}
              onPointerLeave={() => setActive(null)}
            >
              <line
                x1={0}
                x2={Math.max(width, 200)}
                y1={top + height}
                y2={top + height}
                className="analysis-axis"
              />
              {rows.map((r, i) => {
                const x0 = i * slot + 7
                return (
                  <g
                    key={r.month}
                    onPointerEnter={() => setActive(r.month)}
                    onClick={() => setActive(r.month)}
                  >
                    {/* 当たり判定は棒より広く取る */}
                    <rect
                      x={i * slot}
                      y={0}
                      width={slot}
                      height={top + height + 20}
                      fill="transparent"
                    />
                    {SERIES.map((s, j) => {
                      const v = r[s.key]
                      const h = (v / max) * height
                      const x = x0 + j * (bar + gap)
                      return (
                        <g key={s.key}>
                          {v > 0 ? (
                            <path
                              className={s.className}
                              d={`M${x},${top + height} v${-(h - 2)} q0,-2 2,-2 h${bar - 4} q2,0 2,2 v${h - 2} z`}
                            />
                          ) : null}
                          {v > 0 ? (
                            <text
                              x={x + bar / 2}
                              y={top + height - h - 3}
                              textAnchor="middle"
                              className="analysis-value-label"
                            >
                              {v}
                            </text>
                          ) : null}
                        </g>
                      )
                    })}
                    <text
                      x={x0 + bar + gap / 2}
                      y={top + height + 14}
                      textAnchor="middle"
                      className="analysis-tick-label"
                    >
                      {r.month.slice(5)}
                    </text>
                  </g>
                )
              })}
            </svg>
          </div>
          <Text size="xs" c="dimmed" mt={4} aria-live="polite">
            {hovered
              ? `${monthLabel(hovered.month)}：見学 ${hovered.visits} 件・動画 ${hovered.videos} 件`
              : '棒に触れるとその月の内訳を出します'}
          </Text>
        </>
      )}
    </div>
  )
}

/** 'YYYY-MM' を 'YYYY/MM' に（日付の表示は / 区切りにそろえる） */
function monthLabel(month: string): string {
  return month.replace('-', '/')
}
