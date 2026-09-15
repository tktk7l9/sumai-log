import { Arrow, Figure, Label } from './Figure'

/** 壁の中心線で測る「壁芯」と、壁の内側で測る「内法」の違い */
export function WallCoreDiagram() {
  return (
    <Figure label="壁の厚みを挟んだ寸法の測り方の違い。壁の中心線で測る壁芯と、壁の内側の面で測る内法">
      <rect
        x={60}
        y={40}
        width={20}
        height={140}
        fill="var(--mantine-color-gray-3)"
        fillOpacity={0.6}
      />
      <rect
        x={240}
        y={40}
        width={20}
        height={140}
        fill="var(--mantine-color-gray-3)"
        fillOpacity={0.6}
      />
      <line x1={70} y1={40} x2={70} y2={185} strokeDasharray="2 2" />
      <line x1={250} y1={40} x2={250} y2={185} strokeDasharray="2 2" />

      <Arrow x1={70} y1={60} x2={250} y2={60} double />
      <Label x={160} y={50} size={10}>
        壁芯（中心線どうし）
      </Label>

      <Arrow x1={80} y1={160} x2={240} y2={160} double />
      <Label x={160} y={178} size={10}>
        内法（内側の面どうし）
      </Label>

      <Label x={45} y={112} size={9} anchor="end">
        壁
      </Label>
      <Label x={275} y={112} size={9} anchor="start">
        壁
      </Label>
    </Figure>
  )
}
