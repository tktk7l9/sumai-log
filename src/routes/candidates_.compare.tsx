import { Avatar, Badge, Button, Chip, Group, Stack, Switch, Table, Text } from '@mantine/core'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { EyeOff } from 'lucide-react'
import { useState } from 'react'
import { z } from 'zod'

import { BackButton, PageShell } from '../components/PageShell'
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
  parseHiddenIds,
  serializeHiddenIds,
} from '../lib/research'
import { listCandidates } from '../server/candidates'
import { getBuildPlan } from '../server/research'

/**
 * Comparison table of the candidates (detached house vendors) (owner's request, 2026-09-22.
 * It revises "no comparison table" in design.md §1). Columns = vendors, rows = items. On a
 * phone it scrolls horizontally and only the item name column is pinned to the left
 * (.compare-table in styles.css). Rows go in the order "registered numbers (UA value, seismic
 * grade, price per tsubo...)" -> "facts from the research notes (in RESEARCH_FACT_KEYS order)"
 * -> "estimate against the building plan".
 *
 * "非表示" (Hide) in a column heading hides vendors one by one (owner's request, 2026-09-22).
 * The hidden ids are kept in `h` in the URL (comma separated): reload, back and sharing give
 * the same view, and hidden vendors can be brought back 1 at a time from the chips above the
 * table. Independent of the bulk hiding of "見送り" (Dropped) (the switch)
 */
const search = z.object({
  // A broken value falls back to "hide nothing" (parseHiddenIds discards elements that are not UUIDs)
  h: z.string().max(2000).optional().catch(undefined),
})

export const Route = createFileRoute('/candidates_/compare')({
  component: Page,
  validateSearch: (s) => search.parse(s),
  loader: async () => {
    const [{ vendors }, { plan }] = await Promise.all([listCandidates(), getBuildPlan()])
    return { vendors, plan }
  },
})

const COLUMN_WIDTH = 200
const LABEL_WIDTH = 112

function Page() {
  const { vendors, plan } = Route.useLoaderData()
  const { h } = Route.useSearch()
  const navigate = useNavigate({ from: '/candidates/compare' })
  // "見送り" is hidden by default (they are not the ones to compare against). The switch shows them
  const [showDropped, setShowDropped] = useState(false)
  // Vendors hidden one by one. Ids that do not exist (deleted, etc.) cannot be shown as chips, so drop them
  const hiddenIds = parseHiddenIds(h).filter((id) => vendors.some((v) => v.id === id))
  const hiddenVendors = hiddenIds.map((id) => vendors.find((v) => v.id === id)!)
  const shown = vendors.filter(
    (v) => (showDropped || v.status !== 'dropped') && !hiddenIds.includes(v.id),
  )
  const droppedCount = vendors.length - vendors.filter((v) => v.status !== 'dropped').length

  function setHidden(ids: string[]) {
    navigate({ search: (s) => ({ ...s, h: serializeHiddenIds(ids) }), replace: true })
  }
  function hide(id: string) {
    setHidden([...hiddenIds, id])
  }
  function unhide(id: string) {
    setHidden(hiddenIds.filter((x) => x !== id))
  }

  const rows: { label: string; cell: (v: (typeof shown)[number]) => React.ReactNode }[] = [
    { label: '状態', cell: (v) => <StatusBadge status={v.status} /> },
    { label: '種別', cell: (v) => VENDOR_KIND_LABEL[v.kind] },
    { label: '本社', cell: (v) => v.hq ?? '—' },
    { label: '構造', cell: (v) => v.structure ?? '—' },
    { label: 'UA値', cell: (v) => (v.uaValue != null ? String(v.uaValue) : '—') },
    // Unchecked is not the same as confirmed not public, so it is 「—」, not 「非公開」 (SHIG 56)
    { label: 'C値', cell: (v) => (v.cValuePublished ? '実測公開' : '—') },
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
          {/* A nationwide company lists dozens of municipalities and the row gets close to 300px.
              Clamp at 4 lines; the full text can be read in title and on the vendor detail page */}
          <Text size="sm" lineClamp={4} title={v.serviceAreas.join('、')}>
            {v.serviceAreas.length ? v.serviceAreas.join('、') : '未登録'}
          </Text>
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

  // Rows with no value for any vendor (all "—") are not shown. Unresearched items lined up as
  // 10 or more rows of "—" and the table was hard to read. Rows appear naturally once filled in
  const visibleRows = rows.filter((r) => shown.some((v) => r.cell(v) !== '—'))

  return (
    <PageShell
      back={
        <BackButton
          label="候補"
          renderLink={(p) => <Link {...p} to="/candidates" search={{ tab: 'vendors' }} />}
        />
      }
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
        {hiddenVendors.length > 0 ? (
          // Hidden vendors are lined up as chips and come back when pressed (checked=false on the
          // Chip serves as the mark for "hidden"). A button to bring all of them back is added too
          <Group gap="xs" align="center">
            <Text size="sm" c="dimmed">
              非表示:
            </Text>
            {hiddenVendors.map((v) => (
              <Chip
                key={v.id}
                size="xs"
                checked={false}
                onChange={() => unhide(v.id)}
                aria-label={`${v.name} を表示する`}
              >
                {v.name}
              </Chip>
            ))}
            <Button variant="subtle" size="compact-xs" onClick={() => setHidden([])}>
              すべて表示
            </Button>
          </Group>
        ) : null}
        {shown.length === 0 ? (
          <Text size="sm" c="dimmed">
            {vendors.length === 0
              ? '比べる業者がありません。候補から業者を登録してください。'
              : '表示中の業者がありません。上のチップやスイッチから戻せます。'}
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
                        <Group gap={4} wrap="nowrap" align="flex-start" justify="space-between">
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
                          {/* A visible word next to the icon: an eye-off alone does not say what it does
                              (SHIG 31, 34). size xs = 30px tall, not compact-xs (22px, under 7mm; SHIG 78) */}
                          <Button
                            variant="subtle"
                            color="gray"
                            size="xs"
                            aria-label={`${v.name} を比較から隠す`}
                            leftSection={<EyeOff size={14} aria-hidden />}
                            onClick={() => hide(v.id)}
                            style={{ flexShrink: 0 }}
                          >
                            隠す
                          </Button>
                        </Group>
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
                {visibleRows.map((row) => (
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
