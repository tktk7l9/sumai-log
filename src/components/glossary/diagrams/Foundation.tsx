import { Figure, Label } from './Figure'

/** ベタ基礎（面で支える）と布基礎（逆T字で線状に支える）の断面比較 */
export function FoundationDiagram() {
  return (
    <Figure label="基礎の断面比較。左はベタ基礎で面全体で支える。右は布基礎で逆T字の形で線状に支える">
      <line x1={10} y1={140} x2={310} y2={140} strokeDasharray="2 2" />

      <rect
        x={30}
        y={125}
        width={110}
        height={15}
        fill="var(--mantine-color-clay-3)"
        fillOpacity={0.7}
      />
      <rect
        x={65}
        y={90}
        width={40}
        height={35}
        fill="var(--mantine-color-clay-3)"
        fillOpacity={0.7}
      />
      <Label x={85} y={178} size={10}>
        ベタ基礎（面）
      </Label>

      <rect
        x={190}
        y={125}
        width={80}
        height={15}
        fill="var(--mantine-color-clay-3)"
        fillOpacity={0.7}
      />
      <rect
        x={215}
        y={90}
        width={30}
        height={35}
        fill="var(--mantine-color-clay-3)"
        fillOpacity={0.7}
      />
      <Label x={230} y={178} size={10}>
        布基礎（逆T字）
      </Label>

      <Label x={295} y={135} size={8} anchor="end">
        地面
      </Label>
    </Figure>
  )
}
