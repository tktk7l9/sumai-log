import { Arrow, Figure, Label } from './Figure'

/** 断面（屋根・壁・床・窓）から外へ逃げる熱。窓の矢印だけ太くして「窓が最も逃げる」を示す */
export function EnvelopeHeatDiagram() {
  return (
    <Figure label="家の断面図。屋根・壁・床・窓から熱が外へ逃げる矢印。窓の矢印が最も太い。UA値は矢印の合計を外皮面積で割った値">
      <path d="M60 90 L160 30 L260 90 Z" />
      <rect x={60} y={90} width={200} height={70} />
      <rect
        x={130}
        y={110}
        width={60}
        height={40}
        fill="var(--mantine-color-clay-2)"
        fillOpacity={0.6}
      />
      <line x1={50} y1={160} x2={270} y2={160} strokeWidth={3} />

      <Label x={160} y={65} size={10}>
        屋根
      </Label>
      <Label x={78} y={104} size={10} anchor="start">
        壁
      </Label>
      <Label x={160} y={178} size={10}>
        床
      </Label>
      <Label x={160} y={104} size={10}>
        窓
      </Label>

      <Arrow x1={160} y1={30} x2={160} y2={10} />
      <Arrow x1={260} y1={122} x2={296} y2={122} />
      <Arrow x1={160} y1={160} x2={160} y2={186} />
      <Arrow x1={190} y1={130} x2={230} y2={130} width={4.5} />

      <Label x={160} y={196} size={9}>
        UA値 = 矢印の合計 ÷ 外皮面積
      </Label>
    </Figure>
  )
}
