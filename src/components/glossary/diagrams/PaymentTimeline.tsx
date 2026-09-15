import { Arrow, Figure, Label } from './Figure'

const MILESTONES: { label: string; x: number; pay?: string }[] = [
  { label: '契約', x: 30, pay: '契約金' },
  { label: '着工', x: 100, pay: '着工金' },
  { label: '上棟', x: 175, pay: '中間金' },
  { label: '完成', x: 250 },
  { label: '引渡し', x: 300, pay: '最終金' },
]

/** 契約→着工→上棟→完成→引渡しの線上に支払いと、つなぎ融資の期間 */
export function PaymentTimelineDiagram() {
  return (
    <Figure label="契約から着工・上棟・完成・引渡しまでの流れと、契約金・着工金・中間金・最終金の支払時期、つなぎ融資の期間">
      <Arrow x1={15} y1={50} x2={312} y2={50} />
      {MILESTONES.map((m) => (
        <g key={m.label}>
          <circle cx={m.x} cy={50} r={3} fill="currentColor" stroke="none" />
          <Label x={m.x} y={34} size={12}>
            {m.label}
          </Label>
          {m.pay && (
            <>
              <Arrow x1={m.x} y1={55} x2={m.x} y2={92} width={1.2} />
              <Label x={m.x} y={108} size={12}>
                {m.pay}
              </Label>
            </>
          )}
        </g>
      ))}
      <line x1={100} y1={155} x2={300} y2={155} strokeWidth={2.5} />
      <line x1={100} y1={149} x2={100} y2={161} />
      <line x1={300} y1={149} x2={300} y2={161} />
      <Label x={200} y={175} size={13}>
        つなぎ融資の期間
      </Label>
      <Label x={200} y={205} size={12}>
        着工〜引渡しの間、着工金・中間金を立て替える
      </Label>
    </Figure>
  )
}
