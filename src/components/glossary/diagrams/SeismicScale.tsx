import { Figure, Label } from './Figure'

const BASE_Y = 170
const SCALE = 60 // px per 1.0 倍

const BARS: { grade: string; value: number; x: number }[] = [
  { grade: '等級1', value: 1.0, x: 65 },
  { grade: '等級2', value: 1.25, x: 160 },
  { grade: '等級3', value: 1.5, x: 255 },
]

/** 耐震等級 1/2/3 を、柱に見立てた棒の高さ 1.0/1.25/1.5 で比べる */
export function SeismicScaleDiagram() {
  return (
    <Figure label="耐震等級1・2・3を柱の高さで表した棒グラフ。地震に耐える力の目安は基準の1.0倍・1.25倍・1.5倍">
      <line x1={30} y1={BASE_Y} x2={290} y2={BASE_Y} strokeWidth={2} />
      {BARS.map((bar) => {
        const height = bar.value * SCALE
        const top = BASE_Y - height
        return (
          <g key={bar.grade}>
            <rect
              x={bar.x - 22}
              y={top}
              width={44}
              height={height}
              fill="var(--mantine-color-clay-3)"
              fillOpacity={0.7}
            />
            <Label x={bar.x} y={top - 8} size={11}>
              {bar.value}倍
            </Label>
            <Label x={bar.x} y={BASE_Y + 18} size={11}>
              {bar.grade}
            </Label>
          </g>
        )
      })}
    </Figure>
  )
}
