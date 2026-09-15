import { Arrow, Figure, Label } from './Figure'

/** 同じ断面で、隙間（コンセント・配管まわり・サッシ）から風が入り込む向きの矢印 */
export function AirtightLeaksDiagram() {
  return (
    <Figure label="家の断面図。コンセント・配管まわり・サッシの隙間から風が入り込む矢印。C値は隙間の合計を床面積で割った値">
      <path d="M60 90 L160 30 L260 90 Z" />
      <rect x={60} y={90} width={200} height={70} />
      <rect
        x={130}
        y={110}
        width={60}
        height={40}
        fill="var(--mantine-color-clay-2)"
        fillOpacity={0.5}
      />
      <line x1={50} y1={160} x2={270} y2={160} strokeWidth={3} />

      <circle cx={90} cy={145} r={3} fill="currentColor" stroke="none" />
      <Arrow x1={65} y1={125} x2={88} y2={144} dashed />
      <Label x={90} y={175} size={9}>
        コンセント
      </Label>

      <circle cx={230} cy={150} r={3} fill="currentColor" stroke="none" />
      <Arrow x1={255} y1={130} x2={232} y2={149} dashed />
      <Label x={230} y={175} size={9}>
        配管まわり
      </Label>

      <Arrow x1={178} y1={92} x2={168} y2={112} dashed />
      <Label x={185} y={100} size={9} anchor="start">
        サッシ
      </Label>

      <Label x={160} y={20} size={10}>
        すきま風
      </Label>
      <Label x={160} y={193} size={9}>
        C値 = 隙間の合計 ÷ 床面積
      </Label>
    </Figure>
  )
}
