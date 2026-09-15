import { Figure, Label } from './Figure'

/** 30年の帯グラフ。マンション=管理費+積立金の階段、戸建て=自分で積む修繕費の波 */
export function CostCompareDiagram() {
  return (
    <Figure label="30年間の維持費の比較。マンションは管理費と修繕積立金が階段状に増える。戸建ては自分で積み立てる修繕費が波状にかかる">
      <Label x={20} y={30} size={9} anchor="start">
        マンション（管理費＋積立金）
      </Label>
      <path
        d="M30 50 L100 50 L100 42 L180 42 L180 34 L260 34 L260 26 L300 26 L300 65 L30 65 Z"
        fill="var(--mantine-color-clay-3)"
        fillOpacity={0.6}
        stroke="none"
      />
      <path d="M30 50 L100 50 L100 42 L180 42 L180 34 L260 34 L260 26 L300 26" strokeWidth={2} />

      <Label x={20} y={112} size={9} anchor="start">
        戸建て（自分で積む修繕費）
      </Label>
      <path
        d="M30 165 C 70 165 90 100 130 130 S 190 90 230 120 S 280 80 300 100 L300 175 L30 175 Z"
        fill="var(--mantine-color-clay-2)"
        fillOpacity={0.6}
        stroke="none"
      />
      <path d="M30 165 C 70 165 90 100 130 130 S 190 90 230 120 S 280 80 300 100" strokeWidth={2} />

      <line x1={30} y1={190} x2={300} y2={190} strokeWidth={1.5} />
      <Label x={30} y={183} size={8} anchor="start">
        0年
      </Label>
      <Label x={300} y={183} size={8} anchor="end">
        30年
      </Label>
    </Figure>
  )
}
