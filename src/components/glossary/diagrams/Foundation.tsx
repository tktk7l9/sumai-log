import { Figure, Label } from './Figure'

/**
 * Mat foundation = supports with a surface (a continuous fill), strip foundation =
 * supports with lines (band-shaped footings only under the walls, no fill between the
 * footings). They are drawn differently by the presence of a fill so that this
 * "surface vs line" contrast is visible.
 */
export function FoundationDiagram() {
  return (
    <Figure label="基礎の断面比較。左はベタ基礎で面全体を塗りつぶして支える。右は布基礎で壁の下だけを帯状の線で支え、間は空いている">
      <line x1={10} y1={170} x2={310} y2={170} strokeDasharray="2 2" />
      <Label x={300} y={165} size={12} anchor="end">
        地面
      </Label>

      {/* Mat foundation: a continuous fill (surface). Overlapping 2 <rect>s shows a seam
          line at the boundary, so the base and the rising part are 1 <path> */}
      <path
        d="M30 170 L30 155 L70 155 L70 115 L110 115 L110 155 L150 155 L150 170 Z"
        fill="var(--mantine-color-clay-3)"
        fillOpacity={0.7}
      />
      <Label x={90} y={205} size={12}>
        ベタ基礎（面で支える）
      </Label>

      {/* Strip foundation: bands only under the walls (lines), no fill between the footings */}
      <rect x={170} y={155} width={35} height={15} fill="none" />
      <rect x={180} y={115} width={15} height={40} fill="none" />
      <rect x={245} y={155} width={35} height={15} fill="none" />
      <rect x={255} y={115} width={15} height={40} fill="none" />
      <Label x={230} y={205} size={12}>
        布基礎（線で支える）
      </Label>
    </Figure>
  )
}
