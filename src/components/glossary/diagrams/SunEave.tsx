import { Arrow, Figure, Label } from './Figure'

/** 夏の高い太陽は軒で遮られ、冬の低い太陽は軒の下を通って窓の奥まで届く */
export function SunEaveDiagram() {
  return (
    <Figure label="夏は高い角度の太陽光が軒で遮られ、冬は低い角度の太陽光が軒の下を通って窓の奥まで届く">
      <path d="M30 70 L160 20 L290 70 L270 70 L160 30 L50 70 Z" />
      <line x1={90} y1={70} x2={90} y2={170} />
      <line x1={230} y1={70} x2={230} y2={170} />
      <line x1={90} y1={170} x2={230} y2={170} strokeWidth={3} />
      <rect
        x={190}
        y={90}
        width={35}
        height={55}
        fill="var(--mantine-color-clay-2)"
        fillOpacity={0.5}
      />
      <Label x={160} y={186} size={9}>
        軒が夏の日差しを遮る
      </Label>

      <circle cx={262} cy={16} r={6} />
      <Arrow x1={257} y1={22} x2={215} y2={69} dashed />
      <Label x={272} y={12} size={10}>
        夏
      </Label>

      <circle cx={302} cy={92} r={6} />
      <Arrow x1={296} y1={94} x2={200} y2={128} dashed />
      <Label x={306} y={78} size={10} anchor="end">
        冬
      </Label>
    </Figure>
  )
}
