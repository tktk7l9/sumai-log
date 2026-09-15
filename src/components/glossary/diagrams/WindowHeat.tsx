import { Arrow, Figure, Label } from './Figure'

const WINDOWS: { label: string; x: number; panes: number; arrowWidth: number }[] = [
  { label: 'アルミ単板', x: 60, panes: 1, arrowWidth: 4.5 },
  { label: 'アルミ樹脂ペア', x: 160, panes: 2, arrowWidth: 2.5 },
  { label: '樹脂トリプル', x: 260, panes: 3, arrowWidth: 1 },
]

/** 3種の窓（アルミ単板／アルミ樹脂複合ペア／樹脂トリプル）を並べ、熱の矢印を太→細に */
export function WindowHeatDiagram() {
  return (
    <Figure label="窓の種類ごとの熱の逃げやすさ。アルミ単板が最も太い矢印、アルミ樹脂複合ペア、樹脂トリプルの順に矢印が細くなる">
      {WINDOWS.map((w) => (
        <g key={w.label}>
          <rect x={w.x - 25} y={60} width={50} height={80} />
          {Array.from({ length: w.panes }, (_, i) => {
            const px = w.x - 25 + ((i + 1) * 50) / (w.panes + 1)
            return <line key={i} x1={px} y1={60} x2={px} y2={140} />
          })}
          <Arrow x1={w.x} y1={55} x2={w.x} y2={18} width={w.arrowWidth} />
          <Label x={w.x} y={155} size={9}>
            {w.label}
          </Label>
        </g>
      ))}
      <Label x={160} y={195} size={9}>
        熱の逃げやすさ（矢印が太いほど大きい）
      </Label>
    </Figure>
  )
}
