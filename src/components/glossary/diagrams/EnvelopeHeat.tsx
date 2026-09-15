import { Arrow, Figure, Label } from './Figure'

/** 断面（屋根・壁・床・窓）から外へ逃げる熱。窓の矢印だけ太くして「窓が最も逃げる」を示す */
export function EnvelopeHeatDiagram() {
  return (
    <Figure label="家の断面図。屋根・壁・床・窓から熱が外へ逃げる矢印。窓の矢印が最も太い。UA値は矢印の合計を外皮面積で割った値">
      <path d="M60 110 L160 50 L260 110 Z" />
      <rect x={60} y={110} width={200} height={70} />
      <rect
        x={130}
        y={130}
        width={60}
        height={40}
        fill="var(--mantine-color-clay-2)"
        fillOpacity={0.6}
      />
      <line x1={50} y1={180} x2={270} y2={180} strokeWidth={3} />

      <Label x={160} y={90} size={13}>
        屋根
      </Label>
      <Label x={78} y={124} size={13} anchor="start">
        壁
      </Label>
      <Label x={185} y={198} size={13} anchor="start">
        床
      </Label>
      <Label x={160} y={124} size={13}>
        窓
      </Label>

      <Arrow x1={160} y1={50} x2={160} y2={20} />
      <Arrow x1={260} y1={142} x2={296} y2={142} />
      <Arrow x1={160} y1={180} x2={160} y2={206} />
      <Arrow x1={190} y1={150} x2={230} y2={150} width={4.5} />

      <Label x={160} y={228} size={12}>
        UA値 = 矢印の合計 ÷ 外皮面積
      </Label>
    </Figure>
  )
}
