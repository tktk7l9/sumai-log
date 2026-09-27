import { Arrow, Figure, Label } from './Figure'

/**
 * With a left/right split in 2, labels of 12px or more did not fit, so it was restacked
 * into 2 rows, top and bottom.
 * Top = type 3 ventilation (exhaust fan only, cold air from the supply vents), bottom =
 * type 1 heat exchange ventilation (supply and exhaust pass through the heat exchanger)
 */
export function VentilationDiagram() {
  return (
    <Figure label="換気方式の比較。上段は第三種換気で排気ファンのみ、給気口から冷気が入る。下段は第一種熱交換換気で給気と排気が熱交換器を通る">
      <line x1={10} y1={118} x2={310} y2={118} strokeDasharray="3 3" />

      {/* Top row: type 3. The title and the "排気ファン" (exhaust fan) label overlapped at
          the same height, so the fan label went below the circle and the exhaust arrow
          was moved to the right to separate them */}
      <Label x={160} y={14} size={12}>
        第三種換気（排気ファンのみ）
      </Label>
      <rect x={90} y={34} width={140} height={70} />
      <circle cx={210} cy={48} r={9} />
      <Label x={210} y={70} size={12}>
        排気ファン
      </Label>
      <Arrow x1={219} y1={46} x2={255} y2={46} />
      <rect x={95} y={90} width={18} height={9} />
      <Label x={104} y={112} size={12}>
        給気口
      </Label>
      <Arrow x1={65} y1={94} x2={95} y2={94} dashed />
      <Label x={62} y={92} size={12} anchor="end">
        冷気
      </Label>

      {/* Bottom row: type 1 heat exchange */}
      <Label x={160} y={136} size={13}>
        第一種換気（熱交換）
      </Label>
      <rect x={90} y={150} width={140} height={80} />
      <rect
        x={125}
        y={166}
        width={70}
        height={38}
        fill="var(--mantine-color-clay-2)"
        fillOpacity={0.5}
      />
      <Label x={160} y={189} size={12}>
        熱交換器
      </Label>
      <Arrow x1={300} y1={176} x2={140} y2={176} />
      <Label x={298} y={168} size={12} anchor="end">
        給気
      </Label>
      <Arrow x1={140} y1={200} x2={300} y2={200} />
      <Label x={298} y={214} size={12} anchor="end">
        排気
      </Label>
    </Figure>
  )
}
