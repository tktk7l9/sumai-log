import { Arrow, Figure, Label } from './Figure'

/** 左=第三種換気（排気ファンのみ、給気口から冷気）、右=第一種熱交換換気（給気と排気が熱交換器を通る） */
export function VentilationDiagram() {
  return (
    <Figure label="換気方式の比較。左は第三種換気で排気ファンのみ、給気口から冷気が入る。右は第一種熱交換換気で給気と排気が熱交換器を通る">
      <line x1={160} y1={20} x2={160} y2={185} strokeDasharray="3 3" />

      {/* 左: 第三種 */}
      <Label x={80} y={20} size={10}>
        第三種換気
      </Label>
      <rect x={30} y={60} width={100} height={80} />
      <circle cx={115} cy={70} r={8} />
      <Label x={115} y={50} size={8}>
        排気ファン
      </Label>
      <Arrow x1={123} y1={64} x2={150} y2={45} />
      <rect x={35} y={122} width={16} height={8} />
      <Label x={43} y={148} size={8}>
        給気口
      </Label>
      <Arrow x1={15} y1={126} x2={35} y2={126} dashed />
      <Label x={12} y={116} size={8} anchor="start">
        冷気
      </Label>

      {/* 右: 第一種熱交換 */}
      <Label x={240} y={20} size={10}>
        第一種(熱交換)
      </Label>
      <rect x={190} y={60} width={100} height={80} />
      <rect
        x={215}
        y={80}
        width={50}
        height={30}
        fill="var(--mantine-color-clay-2)"
        fillOpacity={0.5}
      />
      <Label x={240} y={98} size={7}>
        熱交換器
      </Label>
      <Arrow x1={305} y1={88} x2={200} y2={88} />
      <Label x={305} y={80} size={8} anchor="end">
        給気
      </Label>
      <Arrow x1={200} y1={106} x2={305} y2={106} />
      <Label x={305} y={118} size={8} anchor="end">
        排気
      </Label>
    </Figure>
  )
}
