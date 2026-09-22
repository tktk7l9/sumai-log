import { Avatar, Badge, Group, Stack, Switch, Table, Text } from '@mantine/core'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'

import { PageShell } from '../components/PageShell'
import { StatusBadge } from '../components/candidates/StatusBadge'
import { CostEstimate } from '../components/research/CostEstimate'
import { VENDOR_KIND_LABEL } from '../db/schema'
import { formatDateSlash } from '../lib/calendar'
import { formatTsubo } from '../lib/format'
import { photoUrl } from '../lib/photos'
import {
  FLOORS_LABEL,
  RESEARCH_FACT_KEYS,
  RESEARCH_FACT_LABEL,
  formatManYen,
  formatTsuboRange,
} from '../lib/research'
import { listCandidates } from '../server/candidates'
import { getBuildPlan } from '../server/research'

/**
 * 候補（戸建て業者）の比較表（所有者の要望、2026-09-22。design.md §1 の「比較表は持たない」
 * を改める）。列＝業者、行＝項目。スマホでは横スクロールし、項目名の列だけ左に固定する
 * （styles.css の .compare-table）。行は「登録済みの数値（UA 値・耐震等級・坪単価…）」→
 * 「調査メモの事実（RESEARCH_FACT_KEYS の順）」→「建築計画に対する目安」の順。
 */
export const Route = createFileRoute('/candidates_/compare')({
  component: Page,
  loader: async () => {
    const [{ vendors }, { plan }] = await Promise.all([listCandidates(), getBuildPlan()])
    return { vendors, plan }
  },
})

const COLUMN_WIDTH = 200
const LABEL_WIDTH = 112

function Page() {
  const { vendors, plan } = Route.useLoaderData()
  // 「見送り」は既定で隠す（比べたい相手ではないため）。スイッチで出せる
  const [showDropped, setShowDropped] = useState(false)
  const shown = vendors.filter((v) => showDropped || v.status !== 'dropped')
  const droppedCount = vendors.length - vendors.filter((v) => v.status !== 'dropped').length

  const rows: { label: string; cell: (v: (typeof shown)[number]) => React.ReactNode }[] = [
    { label: '状態', cell: (v) => <StatusBadge status={v.status} /> },
    { label: '種別', cell: (v) => VENDOR_KIND_LABEL[v.kind] },
    { label: '本社', cell: (v) => v.hq ?? '—' },
    { label: '構造', cell: (v) => v.structure ?? '—' },
    { label: 'UA値', cell: (v) => (v.uaValue != null ? String(v.uaValue) : '—') },
    { label: 'C値', cell: (v) => (v.cValuePublished ? '実測公開' : '非公開') },
    { label: '耐震等級', cell: (v) => (v.seismicGrade != null ? String(v.seismicGrade) : '—') },
    { label: '長期優良', cell: (v) => (v.longTermCertified ? '対応' : '—') },
    { label: '坪単価', cell: (v) => formatTsubo(v.pricePerTsuboMin, v.pricePerTsuboMax) },
    {
      label: '施工エリア',
      cell: (v) => (
        <Stack gap={4}>
          {v.coversHome ? (
            <Badge color="teal" variant="light" w="fit-content">
              建築予定地が施工エリア内
            </Badge>
          ) : null}
          <Text size="sm">{v.serviceAreas.length ? v.serviceAreas.join('、') : '未登録'}</Text>
        </Stack>
      ),
    },
    ...RESEARCH_FACT_KEYS.map((key) => ({
      label: RESEARCH_FACT_LABEL[key],
      cell: (v: (typeof shown)[number]) => v.research?.facts[key] ?? '—',
    })),
    ...(plan
      ? [
          {
            label: `目安（${FLOORS_LABEL[plan.floors]} ${formatTsuboRange(plan)}）`,
            cell: (v: (typeof shown)[number]) => <CostEstimate vendor={v} plan={plan} compact />,
          },
        ]
      : []),
    {
      label: '調査日',
      cell: (v) => (v.research ? formatDateSlash(v.research.researchedOn) : '未調査'),
    },
  ]

  return (
    <PageShell
      title="候補の比較"
      description={
        plan
          ? `建築計画: ${FLOORS_LABEL[plan.floors]} ${formatTsuboRange(plan)}${
              plan.budgetManYen !== null
                ? `・予算 ${formatManYen(plan.budgetManYen)}（土地以外）`
                : ''
            }。目安は本体＝坪単価×坪数、総額＝本体÷0.7 の換算です。`
          : '設定で建築計画（階数・坪数・予算）を登録すると、各社の目安も並びます。'
      }
    >
      <Stack gap="sm">
        {droppedCount > 0 ? (
          <Switch
            label={`見送りも表示（${droppedCount}）`}
            checked={showDropped}
            onChange={(e) => setShowDropped(e.currentTarget.checked)}
          />
        ) : null}
        {shown.length === 0 ? (
          <Text size="sm" c="dimmed">
            比べる業者がありません。候補から業者を登録してください。
          </Text>
        ) : (
          <Table.ScrollContainer minWidth={LABEL_WIDTH + COLUMN_WIDTH * shown.length} type="native">
            <Table
              className="compare-table"
              withColumnBorders
              verticalSpacing="sm"
              horizontalSpacing="sm"
              stickyHeader
            >
              <Table.Thead>
                <Table.Tr>
                  <Table.Th style={{ width: LABEL_WIDTH, minWidth: LABEL_WIDTH }}>項目</Table.Th>
                  {shown.map((v) => (
                    <Table.Th key={v.id} style={{ width: COLUMN_WIDTH, minWidth: COLUMN_WIDTH }}>
                      <Stack gap={4}>
                        <Link
                          to="/candidates/vendors/$id"
                          params={{ id: v.id }}
                          style={{ textDecoration: 'none', color: 'inherit' }}
                        >
                          <Group gap={6} wrap="nowrap" align="center">
                            <Avatar
                              src={v.faviconKey ? photoUrl(v.faviconKey) : null}
                              size={20}
                              radius="xs"
                              color="gray"
                              alt=""
                            >
                              {v.name.charAt(0)}
                            </Avatar>
                            <Text component="span" fw={700} lineClamp={2} lh={1.4}>
                              {v.name}
                            </Text>
                          </Group>
                        </Link>
                        {v.research?.summary ? (
                          <Text size="xs" c="dimmed" fw={400} lineClamp={3}>
                            {v.research.summary}
                          </Text>
                        ) : null}
                      </Stack>
                    </Table.Th>
                  ))}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rows.map((row) => (
                  <Table.Tr key={row.label}>
                    <Table.Th scope="row">
                      <Text size="sm" c="dimmed" fw={600}>
                        {row.label}
                      </Text>
                    </Table.Th>
                    {shown.map((v) => (
                      <Table.Td key={v.id} className="breakable" style={{ verticalAlign: 'top' }}>
                        {typeof row.cell(v) === 'string' ? (
                          <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                            {row.cell(v)}
                          </Text>
                        ) : (
                          row.cell(v)
                        )}
                      </Table.Td>
                    ))}
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Stack>
    </PageShell>
  )
}
