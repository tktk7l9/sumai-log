import { Figure, Label } from './Figure'

/** 30年の帯グラフ。マンション=管理費+積立金の階段、戸建て=自分で積む修繕費の波 */
export function CostCompareDiagram() {
  return (
    <Figure label="30年間の維持費の比較。マンションは管理費と修繕積立金が階段状に増える。戸建ては自分で積み立てる修繕費が波状にかかる">
      <Label x={20} y={20} size={12} anchor="start">
        マンション（管理費＋積立金）
      </Label>
      <path
        d="M30 65 L100 65 L100 57 L180 57 L180 49 L260 49 L260 41 L300 41 L300 80 L30 80 Z"
        fill="var(--mantine-color-clay-3)"
        fillOpacity={0.6}
        stroke="none"
      />
      <path d="M30 65 L100 65 L100 57 L180 57 L180 49 L260 49 L260 41 L300 41" strokeWidth={2} />

      <Label x={20} y={110} size={12} anchor="start">
        戸建て（自分で積む修繕費）
      </Label>
      <path
        d="M30 190 C 70 190 90 125 130 155 S 190 115 230 145 S 280 105 300 125 L300 200 L30 200 Z"
        fill="var(--mantine-color-clay-2)"
        fillOpacity={0.6}
        stroke="none"
      />
      <path
        d="M30 190 C 70 190 90 125 130 155 S 190 115 230 145 S 280 105 300 125"
        strokeWidth={2}
      />

      <line x1={30} y1={215} x2={300} y2={215} strokeWidth={1.5} />
      <Label x={30} y={208} size={12} anchor="start">
        0年
      </Label>
      <Label x={300} y={208} size={12} anchor="end">
        30年
      </Label>
    </Figure>
  )
}
