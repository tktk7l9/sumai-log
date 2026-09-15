import { Figure, Label } from './Figure'

/** 敷地に対する建築面積（1階の塗り）と、2階分の延床（点線の積み上げ）。建ぺい率60%/容積率200% */
export function BcrFarDiagram() {
  return (
    <Figure label="敷地に対する建築面積（塗りつぶし、建ぺい率60%）と、2階分の延床面積（点線の積み上げ、容積率200%）">
      <rect x={40} y={70} width={240} height={100} strokeDasharray="2 2" />
      <Label x={45} y={64} size={12} anchor="start">
        敷地
      </Label>

      <rect
        x={70}
        y={100}
        width={180}
        height={70}
        fill="var(--mantine-color-clay-3)"
        fillOpacity={0.7}
      />
      <Label x={160} y={140} size={13}>
        建築面積
      </Label>

      <rect x={70} y={58} width={180} height={30} strokeDasharray="3 2" />
      <Label x={160} y={77} size={12}>
        2階分（延床に加算）
      </Label>

      <Label x={160} y={225} size={13}>
        建ぺい率60% ／ 容積率200%
      </Label>
    </Figure>
  )
}
