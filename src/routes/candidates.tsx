import { Button, Chip, Group, SegmentedControl, SimpleGrid, Stack, Title } from '@mantine/core'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { Columns3 } from 'lucide-react'
import { useState } from 'react'
import { z } from 'zod'

import { EmptyState } from '../components/EmptyState'
import { Fab } from '../components/Fab'
import { FormDrawer } from '../components/FormDrawer'
import { PageShell } from '../components/PageShell'
import { PropertyCard } from '../components/candidates/PropertyCard'
import { PropertyForm } from '../components/candidates/PropertyForm'
import { VendorCard } from '../components/candidates/VendorCard'
import { VendorForm } from '../components/candidates/VendorForm'
import { VENDOR_KINDS, VENDOR_KIND_LABEL } from '../db/schema'
import { CANDIDATE_STATUSES, STATUS_LABEL } from '../lib/status'
import { listCandidates } from '../server/candidates'

const search = z.object({
  tab: z.enum(['vendors', 'properties']).default('vendors'),
  status: z.enum(CANDIDATE_STATUSES).optional(),
})

type VendorKind = (typeof VENDOR_KINDS)[number]
type CandidateKind = 'vendors' | 'properties'

/**
 * 候補一覧のカードを工務店とハウスメーカーで分けて表示する（所有者の要望）。
 * 工務店／ハウスメーカー／設計事務所は名前どおりの見出し、それ以外
 * （デベロッパー等、増えても）は「その他」にまとめる。0 件の分類は出さない
 * （フィルタで絞って空になった分類も同様）。
 */
const VENDOR_GROUPS: { label: string; match: (kind: VendorKind) => boolean }[] = [
  { label: VENDOR_KIND_LABEL.koumuten, match: (k) => k === 'koumuten' },
  { label: VENDOR_KIND_LABEL.hm, match: (k) => k === 'hm' },
  { label: VENDOR_KIND_LABEL.sekkei, match: (k) => k === 'sekkei' },
  { label: 'その他', match: (k) => k !== 'koumuten' && k !== 'hm' && k !== 'sekkei' },
]

export const Route = createFileRoute('/candidates')({
  component: Page,
  validateSearch: search,
  loader: () => listCandidates(),
})

function Page() {
  const { vendors, properties, homeAreas } = Route.useLoaderData()
  const { tab, status } = Route.useSearch()
  const navigate = useNavigate({ from: '/candidates' })
  const [opened, setOpened] = useState(false)

  const shownVendors = vendors.filter((v) => !status || v.status === status)
  const shownProperties = properties.filter((p) => !status || p.status === status)
  const vendorGroups = VENDOR_GROUPS.map((g) => ({
    label: g.label,
    vendors: shownVendors.filter((v) => g.match(v.kind)),
  })).filter((g) => g.vendors.length > 0)

  // マンション（物件）が 1 件も無ければ戸建て/マンションの切替タブ自体を出さない
  // （所有者の要望）。?tab=properties を直接開いた場合はそのまま尊重し、下の一覧・
  // 追加ドロワーの初期選択は tab の値をそのまま使う（タブが無いだけで動作は変えない）
  const showTabs = properties.length > 0

  return (
    <PageShell title="候補" titleHidden fab>
      <Stack gap="md">
        {showTabs ? (
          <SegmentedControl
            fullWidth
            aria-label="表示の切替"
            value={tab}
            onChange={(v) =>
              navigate({
                search: (s) => ({ ...s, tab: v as CandidateKind }),
                replace: true,
              })
            }
            data={[
              { value: 'vendors', label: `戸建て ${vendors.length}` },
              { value: 'properties', label: `マンション ${properties.length}` },
            ]}
          />
        ) : null}
        <Group gap="xs" justify="space-between" align="center">
          {/* 常にどれか 1 つが選ばれた状態にする（未選択＝全件、が見て分からないため）。
              「すべて」は状態の値ではないので search には持たない */}
          <Chip.Group
            value={status ?? 'all'}
            onChange={(v) =>
              navigate({
                search: (s) => ({ ...s, status: v === 'all' ? undefined : (v as typeof status) }),
              })
            }
          >
            <Group gap={6}>
              <Chip value="all" size="xs">
                すべて
              </Chip>
              {CANDIDATE_STATUSES.map((s) => (
                <Chip key={s} value={s} size="xs">
                  {STATUS_LABEL[s]}
                </Chip>
              ))}
            </Group>
          </Chip.Group>
          {/* 業者が 2 社以上あるときだけ比較表へ（1 社では比べるものが無い） */}
          {tab === 'vendors' && vendors.length >= 2 ? (
            <Button
              component={Link}
              to="/candidates/compare"
              variant="default"
              size="xs"
              leftSection={<Columns3 size={14} aria-hidden />}
            >
              比較表
            </Button>
          ) : null}
        </Group>

        {tab === 'vendors' ? (
          shownVendors.length ? (
            <Stack gap="lg">
              {vendorGroups.map((g) => (
                <Stack key={g.label} gap="sm">
                  <Title order={2}>
                    {g.label}（{g.vendors.length}）
                  </Title>
                  <SimpleGrid cols={{ base: 1, md: 2 }}>
                    {g.vendors.map((v) => (
                      <VendorCard key={v.id} vendor={v} />
                    ))}
                  </SimpleGrid>
                </Stack>
              ))}
            </Stack>
          ) : (
            <EmptyState title="業者がありません" description="右下の追加から登録できます。" />
          )
        ) : shownProperties.length ? (
          <SimpleGrid cols={{ base: 1, md: 2 }}>
            {shownProperties.map((p) => (
              <PropertyCard key={p.id} property={p} />
            ))}
          </SimpleGrid>
        ) : (
          <EmptyState title="物件がありません" description="右下の追加から登録できます。" />
        )}
      </Stack>

      <Fab
        label={tab === 'vendors' ? '業者を追加' : '物件を追加'}
        onClick={() => setOpened(true)}
      />
      <FormDrawer opened={opened} onClose={() => setOpened(false)} title="追加">
        <CandidateAddForm
          initialKind={tab}
          homeAreas={homeAreas}
          onSaved={(kind, id) => {
            setOpened(false)
            if (kind === 'vendors') navigate({ to: '/candidates/vendors/$id', params: { id } })
            else navigate({ to: '/candidates/properties/$id', params: { id } })
          }}
        />
      </FormDrawer>
    </PageShell>
  )
}

/**
 * 「追加」ドロワーの中身。上に戸建て（業者）/マンション（物件）の SegmentedControl を置き、
 * 下にどちらかのフォームを出す（所有者の要望: 「業者を追加」「物件を追加」を「追加」に
 * 統一し、フォーム側で種別を選べるようにする）。切替は `key` でフォームを丸ごと作り直す
 * ことで「もう一方の入力状態をリセットする」を素直に満たす。入力中に切り替えようとしたら
 * （dirty のときだけ）確認を挟む。dirty かどうかは表示中のフォーム（VendorForm /
 * PropertyForm）が `onDirtyChange` で都度教えてくれる。
 */
function CandidateAddForm({
  initialKind,
  homeAreas,
  onSaved,
}: {
  initialKind: CandidateKind
  homeAreas: string[]
  onSaved: (kind: CandidateKind, id: string) => void
}) {
  const [kind, setKind] = useState<CandidateKind>(initialKind)
  const [dirty, setDirty] = useState(false)

  function handleKindChange(next: string) {
    if (next === kind) return
    if (dirty && !window.confirm('入力中の内容は破棄されます。切り替えますか？')) return
    setKind(next as CandidateKind)
    setDirty(false)
  }

  return (
    <Stack gap="md">
      <SegmentedControl
        fullWidth
        aria-label="追加する種別"
        value={kind}
        onChange={handleKindChange}
        data={[
          { value: 'vendors', label: '戸建て（業者）' },
          { value: 'properties', label: 'マンション（物件）' },
        ]}
      />
      {kind === 'vendors' ? (
        <VendorForm
          key="vendor"
          vendor={null}
          homeAreas={homeAreas}
          onSaved={(id) => onSaved('vendors', id)}
          onDirtyChange={setDirty}
        />
      ) : (
        <PropertyForm
          key="property"
          property={null}
          onSaved={(id) => onSaved('properties', id)}
          onDirtyChange={setDirty}
        />
      )}
    </Stack>
  )
}
