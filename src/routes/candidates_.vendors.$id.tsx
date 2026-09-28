import { Anchor, Avatar, Badge, Button, Card, Group, Stack, Text, Title } from '@mantine/core'
import { Link, createFileRoute, useNavigate, useRouter, notFound } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { ExternalLink, MapPin, NotebookPen, Plus } from 'lucide-react'
import { Fragment, useState } from 'react'

import { CommentThread } from '../components/comments/CommentThread'
import { RouteNotFoundState } from '../components/ErrorStates'
import { DeleteSection, EditButton } from '../components/DetailActions'
import { FormDrawer } from '../components/FormDrawer'
import { deleteWithUndo, researchDeleteId, usePendingDeletes } from '../components/undoableDelete'
import { BackButton, PageShell } from '../components/PageShell'
import { Row } from '../components/candidates/DetailRow'
import { StatusBadge } from '../components/candidates/StatusBadge'
import { VendorForm } from '../components/candidates/VendorForm'
import { VendorLinks } from '../components/candidates/VendorLinks'
import { PlaceForm } from '../components/places/PlaceForm'
import { CostEstimate } from '../components/research/CostEstimate'
import { ResearchForm } from '../components/research/ResearchForm'
import { ResearchSection } from '../components/research/ResearchSection'
import { PLACE_KIND_LABEL, VENDOR_KIND_LABEL } from '../db/schema'
import { resolveAffiliations } from '../lib/affiliations'
import { formatTsubo } from '../lib/format'
import { vendorSpecHalves } from '../lib/vendorSpecs'
import { termIdForMetric } from '../lib/glossary'
import { photoUrl, representativeThumbKeyFromDisplayKey } from '../lib/photos'
import { deleteVendor, getVendor } from '../server/candidates'
import { listCommentsFor } from '../server/comments'
import { listLinkTargets } from '../server/places'
import { getBuildPlan } from '../server/research'
import { getHomeAreas } from '../server/settings'

type SpecHalf = { label: React.ReactNode; value: string } | null

/** A combined "A / B" spec row that shows only the halves that are registered and nothing at
 * all when both are missing (SHIG 1, 37) */
function SpecRow({ left, right }: { left: SpecHalf; right: SpecHalf }) {
  const halves = [left, right].filter((h): h is NonNullable<SpecHalf> => h !== null)
  if (halves.length === 0) return null
  return (
    <Row
      label={
        <Group component="span" gap={4} wrap="nowrap">
          {halves.map((h, i) => (
            <Fragment key={i}>
              {i > 0 ? (
                <Text span size="sm" c="dimmed">
                  /
                </Text>
              ) : null}
              {h.label}
            </Fragment>
          ))}
        </Group>
      }
      value={halves.map((h) => h.value).join(' / ')}
    />
  )
}

/** The "view in the glossary" link attached to a DetailRow label. The headword itself becomes the link */
function MetricLabel({
  metric,
  text,
}: {
  metric: Parameters<typeof termIdForMetric>[0]
  text: string
}) {
  return (
    <Link
      to="/glossary/$termId"
      params={{ termId: termIdForMetric(metric) }}
      aria-label={`用語集で ${text} を見る`}
      style={{ color: 'inherit' }}
    >
      {text}
    </Link>
  )
}
import { isIdLike } from '../lib/ids'

export const Route = createFileRoute('/candidates_/vendors/$id')({
  component: Page,
  notFoundComponent: NotFound,
  loader: async ({ params }) => {
    // A malformed id can never exist; answer with the in-app 404 instead of a validator 500
    if (!isIdLike(params.id)) throw notFound()
    const [detail, homeAreas, targets, commentData, buildPlan] = await Promise.all([
      getVendor({ data: { id: params.id } }),
      getHomeAreas(),
      listLinkTargets(),
      listCommentsFor({ data: { targetType: 'vendor', targetId: params.id } }),
      getBuildPlan(),
    ])
    return { ...detail, homeAreas, targets, ...commentData, buildPlan: buildPlan.plan }
  },
})

function Page() {
  const { vendor, places, coversHome, homeAreas, targets, comments, me, members, buildPlan } =
    Route.useLoaderData()
  const navigate = useNavigate()
  const router = useRouter()
  const remove = useServerFn(deleteVendor)
  const [editing, setEditing] = useState(false)
  const [addingPlace, setAddingPlace] = useState(false)
  const [editingResearch, setEditingResearch] = useState(false)
  const pendingDeletes = usePendingDeletes()
  const spec = vendorSpecHalves(vendor)
  // Hidden at once while its deletion can still be undone
  const research = pendingDeletes.has(researchDeleteId(vendor.id)) ? null : vendor.research

  function handleDelete() {
    deleteWithUndo({
      id: vendor.id,
      message: `「${vendor.name}」を削除しました`,
      commit: async () => {
        await remove({ data: { id: vendor.id } })
        await router.invalidate()
      },
    })
    navigate({ to: '/candidates', search: { tab: 'vendors' } })
  }

  return (
    <PageShell
      back={
        <BackButton
          label="候補"
          renderLink={(p) => <Link {...p} to="/candidates" search={{ tab: 'vendors' }} />}
        />
      }
      title={
        <Group gap={8} wrap="nowrap" align="center" component="span">
          <Avatar
            src={vendor.faviconKey ? photoUrl(vendor.faviconKey) : null}
            size={24}
            radius="xs"
            color="gray"
            alt=""
          >
            {vendor.name.charAt(0)}
          </Avatar>
          {vendor.name}
        </Group>
      }
      actions={
        <Group gap="xs">
          <StatusBadge status={vendor.status} />
          <Badge variant="default">{VENDOR_KIND_LABEL[vendor.kind]}</Badge>
          {coversHome ? (
            <Badge color="teal" variant="light">
              建築予定地が施工エリア内
            </Badge>
          ) : null}
          {/* The website is the 「公式」 (Official) row below; only SNS icons here (SHIG 31) */}
          <VendorLinks websiteUrl={null} socialUrls={vendor.socialUrls} size="md" />
          <EditButton onClick={() => setEditing(true)} />
        </Group>
      }
    >
      <Card withBorder padding="md">
        <Stack gap="xs">
          {vendor.hq ? <Row label="本社" value={vendor.hq} /> : null}
          {vendor.representative ? (
            <Group justify="space-between" wrap="nowrap" align="center">
              <Text size="sm" c="dimmed" style={{ flexShrink: 0 }}>
                代表者
              </Text>
              <Group gap="sm" wrap="nowrap" align="center">
                {vendor.representativePhotoKey ? (
                  <Avatar
                    src={photoUrl(
                      representativeThumbKeyFromDisplayKey(vendor.representativePhotoKey),
                    )}
                    size={96}
                    radius="50%"
                    alt=""
                  />
                ) : null}
                <Text size="sm" ta="right">
                  {vendor.representative}
                </Text>
              </Group>
            </Group>
          ) : null}
          {vendor.serviceAreas.length ? (
            <Row label="施工エリア" value={vendor.serviceAreas.join('、')} />
          ) : null}
          <SpecRow
            left={
              spec.ua ? { label: <MetricLabel metric="ua" text="UA値" />, value: spec.ua } : null
            }
            right={spec.c ? { label: <MetricLabel metric="c" text="C値" />, value: spec.c } : null}
          />
          <SpecRow
            left={
              spec.seismic
                ? { label: <MetricLabel metric="seismic" text="耐震等級" />, value: spec.seismic }
                : null
            }
            right={
              spec.longTerm
                ? { label: <MetricLabel metric="longTerm" text="長期優良" />, value: spec.longTerm }
                : null
            }
          />
          {vendor.pricePerTsuboMin != null || vendor.pricePerTsuboMax != null ? (
            <Row
              label="坪単価"
              value={formatTsubo(vendor.pricePerTsuboMin, vendor.pricePerTsuboMax)}
            />
          ) : null}
          {vendor.structure ? <Row label="構造" value={vendor.structure} /> : null}
          {vendor.websiteUrl ? (
            <Row
              label="公式"
              value={
                <Anchor href={vendor.websiteUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink size={14} aria-hidden /> 開く
                </Anchor>
              }
            />
          ) : null}
          {vendor.sourceUrl ? (
            <Row
              label="参照 URL"
              value={
                <Anchor href={vendor.sourceUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink size={14} aria-hidden /> 開く
                </Anchor>
              }
            />
          ) : null}
          {vendor.newsEmailDomain ? (
            <Row label="メール差出人" value={vendor.newsEmailDomain.split(',').join(', ')} />
          ) : null}
        </Stack>
      </Card>
      {vendor.features ? <Text style={{ whiteSpace: 'pre-wrap' }}>{vendor.features}</Text> : null}

      {/* With a building plan (settings), show the building and total cost estimate at this vendor's price per tsubo */}
      {buildPlan ? (
        <Card withBorder padding="md">
          <Stack gap="xs">
            <Title order={2}>計画に対する目安</Title>
            <CostEstimate vendor={vendor} plan={buildPlan} />
          </Stack>
        </Card>
      ) : null}

      {/* Research notes. When absent only the "書く" (Write) button is shown (they also feed the comparison table /candidates/compare) */}
      <Stack gap="xs">
        <Group justify="space-between" align="center">
          <Title order={2}>調査メモ</Title>
          <Button
            variant="default"
            size="xs"
            leftSection={<NotebookPen size={14} aria-hidden />}
            onClick={() => setEditingResearch(true)}
          >
            {research ? '編集' : '書く'}
          </Button>
        </Group>
        {research ? (
          <ResearchSection research={research} />
        ) : (
          <Text size="sm" c="dimmed">
            まだ調べたことを書いていません。特徴・性能・価格・保証・平屋の実績などをまとめると、比較表に並びます。
          </Text>
        )}
      </Stack>

      {vendor.affiliations.length > 0 ? (
        <Stack gap="xs">
          <Title order={2}>加盟団体</Title>
          {resolveAffiliations(vendor.affiliations).map((a) => {
            const link = vendor.affiliationLinks[a.id]
            return (
              <Card key={a.id} withBorder padding="sm">
                <Stack gap="xs">
                  <Group justify="space-between" wrap="wrap" gap="xs">
                    <Text fw={600}>
                      {a.name}（{a.shortName}）
                    </Text>
                    <Group gap="md">
                      <Anchor href={a.url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink size={14} aria-hidden /> 公式サイト
                      </Anchor>
                      <Link
                        to="/glossary/$termId"
                        params={{ termId: a.glossaryId }}
                        style={{ color: 'inherit' }}
                      >
                        用語集で読む
                      </Link>
                    </Group>
                  </Group>
                  {link ? (
                    <Group justify="space-between" wrap="wrap" gap="xs">
                      <Anchor href={link.url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink size={14} aria-hidden /> 紹介ページ
                      </Anchor>
                      {link.note ? (
                        <Text size="sm" c="dimmed">
                          {link.note}
                        </Text>
                      ) : null}
                    </Group>
                  ) : null}
                </Stack>
              </Card>
            )
          })}
        </Stack>
      ) : null}

      <Stack gap="xs">
        <Group justify="space-between" align="center">
          <Title order={2}>場所</Title>
          <Button
            variant="default"
            size="xs"
            leftSection={<Plus size={14} aria-hidden />}
            onClick={() => setAddingPlace(true)}
          >
            場所を追加
          </Button>
        </Group>
        {places.length === 0 ? (
          <Text size="sm" c="dimmed">
            この業者の展示場・モデルハウスはまだ登録されていません。
          </Text>
        ) : (
          places.map((p) => (
            <Link
              key={p.id}
              to="/places/$id"
              params={{ id: p.id }}
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              <Card withBorder padding="sm">
                <Group gap="xs" wrap="nowrap">
                  <MapPin size={16} aria-hidden />
                  <Text fw={600} lineClamp={1}>
                    {p.name}
                  </Text>
                  <Badge variant="default" size="xs">
                    {PLACE_KIND_LABEL[p.kind]}
                  </Badge>
                </Group>
              </Card>
            </Link>
          ))
        )}
      </Stack>

      <CommentThread
        targetType="vendor"
        targetId={vendor.id}
        comments={comments}
        me={me}
        members={members}
      />

      <DeleteSection label="この業者を削除" onDelete={handleDelete} />

      <FormDrawer opened={editing} onClose={() => setEditing(false)} title="業者を編集">
        <VendorForm vendor={vendor} homeAreas={homeAreas} onSaved={() => setEditing(false)} />
      </FormDrawer>
      <FormDrawer
        opened={editingResearch}
        onClose={() => setEditingResearch(false)}
        title="調査メモ"
      >
        {editingResearch ? (
          <ResearchForm
            vendorId={vendor.id}
            research={research ?? null}
            onSaved={() => setEditingResearch(false)}
          />
        ) : null}
      </FormDrawer>
      <FormDrawer opened={addingPlace} onClose={() => setAddingPlace(false)} title="場所を追加">
        <PlaceForm
          place={null}
          targets={targets}
          defaults={{ vendorId: vendor.id }}
          onSaved={() => setAddingPlace(false)}
        />
      </FormDrawer>
    </PageShell>
  )
}

function NotFound() {
  return (
    <RouteNotFoundState
      back={
        <BackButton
          label="候補"
          renderLink={(p) => <Link {...p} to={'/candidates'} search={{ tab: 'vendors' }} />}
        />
      }
    />
  )
}
