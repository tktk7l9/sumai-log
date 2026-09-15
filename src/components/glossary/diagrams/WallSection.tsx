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
const BAND_TOP = 40
const BAND_BOTTOM = 100

/**
 * 外壁の断面を、外側→内側の8層の縦じま（バンド内は番号のみ）＋
 * 下の凡例リスト（番号と名前）で表す。バンドの中に8つの日本語ラベルを
 * 詰めると 12px では収まらないため、番号とテキストを分離した
 */
export function WallSectionDiagram() {
  return (
    <Figure label="外壁の断面。外側から内側へ、外装材・通気層・透湿防水シート・付加断熱・構造用面材・柱と充填断熱・気密シート・石膏ボードの順に重なる">
      <Label x={160} y={18} size={13}>
        外壁の断面（外 → 内）
      </Label>
      <rect x={LEFT} y={BAND_TOP} width={RIGHT - LEFT} height={BAND_BOTTOM - BAND_TOP} />
      {LAYERS.slice(1).map((_, i) => {
        const x = LEFT + STEP * (i + 1)
        return <line key={x} x1={x} y1={BAND_TOP} x2={x} y2={BAND_BOTTOM} />
      })}
      {LAYERS.map((_, i) => (
        <Label key={i} x={LEFT + STEP * (i + 0.5)} y={(BAND_TOP + BAND_BOTTOM) / 2 + 4} size={13}>
          {i + 1}
        </Label>
      ))}
      <Label x={LEFT} y={BAND_BOTTOM + 16} size={12} anchor="start">
        ← 外
      </Label>
      <Label x={RIGHT} y={BAND_BOTTOM + 16} size={12} anchor="end">
        内 →
      </Label>

      {LAYERS.map((name, i) => {
        const col = i < 4 ? 0 : 1
        const row = i % 4
        const x = col === 0 ? 30 : 175
        const y = BAND_BOTTOM + 40 + row * 20
        return (
          <Label key={name} x={x} y={y} size={12} anchor="start">
            {i + 1}. {name}
          </Label>
        )
      })}
    </Figure>
  )
}
