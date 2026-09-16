import {
  ActionIcon,
  Anchor,
  Avatar,
  Badge,
  Button,
  Card,
  Group,
  Stack,
  Text,
  Title,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { ExternalLink, MapPin, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { CommentThread } from '../components/comments/CommentThread'
import { FormDrawer } from '../components/FormDrawer'
import { PageShell } from '../components/PageShell'
import { Row } from '../components/candidates/DetailRow'
import { StatusBadge } from '../components/candidates/StatusBadge'
import { VendorForm } from '../components/candidates/VendorForm'
import { VendorLinks } from '../components/candidates/VendorLinks'
import { PlaceForm } from '../components/places/PlaceForm'
import { PLACE_KIND_LABEL, VENDOR_KIND_LABEL } from '../db/schema'
import { resolveAffiliations } from '../lib/affiliations'
import { formatTsubo } from '../lib/format'
import { termIdForMetric } from '../lib/glossary'
import { photoUrl, vendorImageKeys } from '../lib/photos'
import { deleteVendor, getVendor } from '../server/candidates'
import { listCommentsFor } from '../server/comments'
import { listLinkTargets } from '../server/places'
import { getHomeAreas } from '../server/settings'

/** DetailRow のラベルに添える「用語集で見る」リンク。見出し語自体をリンクにする */
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

export const Route = createFileRoute('/candidates_/vendors/$id')({
  component: Page,
  loader: async ({ params }) => {
    const [detail, homeAreas, targets, commentData] = await Promise.all([
      getVendor({ data: { id: params.id } }),
      getHomeAreas(),
      listLinkTargets(),
      listCommentsFor({ data: { targetType: 'vendor', targetId: params.id } }),
    ])
    return { ...detail, homeAreas, targets, ...commentData }
  },
})

function Page() {
  const { vendor, places, coversHome, homeAreas, targets, comments, me, members } =
    Route.useLoaderData()
  const navigate = useNavigate()
  const remove = useServerFn(deleteVendor)
  const [editing, setEditing] = useState(false)
  const [addingPlace, setAddingPlace] = useState(false)

  async function handleDelete() {
    if (!window.confirm(`「${vendor.name}」を削除します。場所・予定・記録は残ります。`)) return
    try {
      await remove({ data: { id: vendor.id } })
      notifications.show({ message: '業者を削除しました' })
      navigate({ to: '/candidates', search: { tab: 'vendors', coversHome: false } })
    } catch {
      notifications.show({ message: '削除できませんでした', color: 'red' })
    }
  }

  return (
    <PageShell
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
          <VendorLinks websiteUrl={vendor.websiteUrl} socialUrls={vendor.socialUrls} size="md" />
          <ActionIcon variant="default" aria-label="編集" onClick={() => setEditing(true)}>
            <Pencil size={16} />
          </ActionIcon>
          <ActionIcon variant="default" color="red" aria-label="削除" onClick={handleDelete}>
            <Trash2 size={16} />
          </ActionIcon>
        </Group>
      }
    >
      <Card withBorder padding="md">
        <Stack gap="xs">
          <Row label="本社" value={vendor.hq} />
          {vendor.representative ? (
            <Group justify="space-between" wrap="nowrap" align="center">
              <Text size="sm" c="dimmed" style={{ flexShrink: 0 }}>
                代表者
              </Text>
              <Group gap="sm" wrap="nowrap" align="center">
                {vendor.representativePhotoKey ? (
                  <Avatar
                    src={photoUrl(vendorImageKeys(vendor.id).thumbKey)}
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
          <Row
            label="施工エリア"
            value={vendor.serviceAreas.length ? vendor.serviceAreas.join('、') : '未登録'}
          />
          <Row
            label={
              <Group component="span" gap={4} wrap="nowrap">
                <MetricLabel metric="ua" text="UA値" />
                <Text span size="sm" c="dimmed">
                  /
                </Text>
                <MetricLabel metric="c" text="C値" />
              </Group>
            }
            value={`${vendor.uaValue ?? '—'} / ${vendor.cValuePublished ? '実測公開' : '非公開'}`}
          />
          <Row
            label={
              <Group component="span" gap={4} wrap="nowrap">
                <MetricLabel metric="seismic" text="耐震等級" />
                <Text span size="sm" c="dimmed">
                  /
                </Text>
                <MetricLabel metric="longTerm" text="長期優良" />
              </Group>
            }
            value={`${vendor.seismicGrade ?? '—'} / ${vendor.longTermCertified ? '対応' : '—'}`}
          />
          <Row
            label="坪単価"
            value={formatTsubo(vendor.pricePerTsuboMin, vendor.pricePerTsuboMax)}
          />
          <Row label="構造" value={vendor.structure} />
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
        </Stack>
      </Card>
      {vendor.features ? <Text style={{ whiteSpace: 'pre-wrap' }}>{vendor.features}</Text> : null}

      {vendor.affiliations.length > 0 ? (
        <Stack gap="xs">
          <Title order={2}>加盟団体</Title>
          {resolveAffiliations(vendor.affiliations).map((a) => (
            <Card key={a.id} withBorder padding="sm">
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
            </Card>
          ))}
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

      <FormDrawer opened={editing} onClose={() => setEditing(false)} title="業者を編集">
        <VendorForm vendor={vendor} homeAreas={homeAreas} onSaved={() => setEditing(false)} />
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
