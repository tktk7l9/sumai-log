import { Figure, Label } from './Figure'

const LAYERS = [
  '外装材',
  '通気層',
  '防水シート',
  '付加断熱',
  '面材',
  '柱+断熱',
  '気密シート',
  '石膏ボード',
]

const LEFT = 30
const RIGHT = 290
const STEP = (RIGHT - LEFT) / LAYERS.length

/** 外壁の断面を、外側→内側の8層を並べた縦じま＋交互ラベルで表す */
export function WallSectionDiagram() {
  return (
    <Figure label="外壁の断面。外側から内側へ、外装材・通気層・透湿防水シート・付加断熱・構造用面材・柱と充填断熱・気密シート・石膏ボードの順に重なる">
      <Label x={160} y={18} size={10}>
        外壁の断面（外 → 内）
      </Label>
      <rect x={LEFT} y={55} width={RIGHT - LEFT} height={70} />
      {LAYERS.slice(1).map((_, i) => {
        const x = LEFT + STEP * (i + 1)
        return <line key={x} x1={x} y1={55} x2={x} y2={125} />
      })}
      {LAYERS.map((name, i) => {
        const x = LEFT + STEP * (i + 0.5)
        const y = i % 2 === 0 ? 45 : 140
        return (
          <Label key={name} x={x} y={y} size={7}>
            {name}
          </Label>
        )
      })}
      <Label x={LEFT} y={160} size={9} anchor="start">
        ← 外
      </Label>
      <Label x={RIGHT} y={160} size={9} anchor="end">
        内 →
      </Label>
    </Figure>
  )
}
