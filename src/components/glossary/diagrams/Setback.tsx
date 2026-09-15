import { Arrow, Figure, Label } from './Figure'

/** 幅3mの道路、中心線、2mの後退線、その内側に建てる */
export function SetbackDiagram() {
  return (
    <Figure label="幅3mの道路の中心線から2m後退した線の内側に建物を建てる、セットバックの断面図">
      <rect
        x={20}
        y={150}
        width={280}
        height={40}
        fill="var(--mantine-color-gray-3)"
        fillOpacity={0.5}
      />
      <Label x={160} y={175} size={12}>
        道路 3m
      </Label>

      <line x1={20} y1={170} x2={300} y2={170} strokeDasharray="4 3" />
      <Label x={300} y={165} size={12} anchor="end">
        中心線
      </Label>

      <line x1={20} y1={130} x2={300} y2={130} strokeDasharray="4 3" />
      <Label x={300} y={125} size={12} anchor="end">
        後退線
      </Label>

      <Arrow x1={60} y1={168} x2={60} y2={132} double />
      <Label x={70} y={150} size={12} anchor="start">
        2m
      </Label>

      <rect
        x={90}
        y={60}
        width={140}
        height={68}
        fill="var(--mantine-color-clay-2)"
        fillOpacity={0.6}
      />
      <Label x={160} y={95} size={13}>
        建物
      </Label>
    </Figure>
  )
}
