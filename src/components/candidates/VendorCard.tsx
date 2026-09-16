import { Badge, Card, Group, Stack, Text } from '@mantine/core'
import { Link, useNavigate } from '@tanstack/react-router'
import { MapPin } from 'lucide-react'

import { VENDOR_KIND_LABEL, type Vendor } from '../../db/schema'
import { resolveAffiliations } from '../../lib/affiliations'
import { formatTsubo } from '../../lib/format'
import { termIdForMetric } from '../../lib/glossary'
import { StatusBadge } from './StatusBadge'
import { VendorLinks } from './VendorLinks'

export function VendorCard({
  vendor,
}: {
  vendor: Vendor & { coversHome: boolean; placeCount: number }
}) {
  const navigate = useNavigate()
  const params = { id: vendor.id }

  function goToDetail() {
    navigate({ to: '/candidates/vendors/$id', params })
  }

  return (
    <Card withBorder padding="md" onClick={goToDetail} style={{ cursor: 'pointer' }}>
      <Stack gap={8}>
        <Group justify="space-between" wrap="nowrap" align="flex-start" gap="xs">
          <Link
            to="/candidates/vendors/$id"
            params={params}
            onClick={(e) => e.stopPropagation()}
            style={{ textDecoration: 'none', color: 'inherit' }}
          >
            <Text component="span" fw={700} lineClamp={2} lh={1.4}>
              {vendor.name}
            </Text>
          </Link>
          <StatusBadge status={vendor.status} />
        </Group>
        {vendor.hq ? (
          <Group gap={4} c="dimmed">
            <MapPin size={14} aria-hidden />
            <Text size="sm" c="dimmed" lineClamp={1}>
              {vendor.hq}
            </Text>
          </Group>
        ) : null}
        {vendor.kind === 'koumuten' && vendor.representative ? (
          <Text size="sm" c="dimmed">
            代表: {vendor.representative}
          </Text>
        ) : null}
        <Group gap="xs">
          <Badge variant="default">{VENDOR_KIND_LABEL[vendor.kind]}</Badge>
          {vendor.coversHome ? (
            <Badge color="teal" variant="light">
              建築予定地が施工エリア内
            </Badge>
          ) : null}
          {vendor.uaValue != null ||
          vendor.cValuePublished ||
          vendor.seismicGrade != null ||
          vendor.longTermCertified ? (
            <Group gap="xs" onClick={(e) => e.stopPropagation()}>
              {vendor.uaValue != null ? (
                <Link
                  to="/glossary/$termId"
                  params={{ termId: termIdForMetric('ua') }}
                  aria-label="用語集で UA値 を見る"
                  style={{ textDecoration: 'none' }}
                >
                  <Badge variant="default">UA {vendor.uaValue}</Badge>
                </Link>
              ) : null}
              {vendor.cValuePublished ? (
                <Link
                  to="/glossary/$termId"
                  params={{ termId: termIdForMetric('c') }}
                  aria-label="用語集で C値 を見る"
                  style={{ textDecoration: 'none' }}
                >
                  <Badge variant="default">C値公開</Badge>
                </Link>
              ) : null}
              {vendor.seismicGrade != null ? (
                <Link
                  to="/glossary/$termId"
                  params={{ termId: termIdForMetric('seismic') }}
                  aria-label="用語集で 耐震等級 を見る"
                  style={{ textDecoration: 'none' }}
                >
                  <Badge variant="default">耐震等級 {vendor.seismicGrade}</Badge>
                </Link>
              ) : null}
              {vendor.longTermCertified ? (
                <Link
                  to="/glossary/$termId"
                  params={{ termId: termIdForMetric('longTerm') }}
                  aria-label="用語集で 長期優良 を見る"
                  style={{ textDecoration: 'none' }}
                >
                  <Badge variant="default">長期優良</Badge>
                </Link>
              ) : null}
            </Group>
          ) : null}
          {vendor.affiliations.length > 0 ? (
            <Group gap="xs" onClick={(e) => e.stopPropagation()}>
              {resolveAffiliations(vendor.affiliations).map((a) => (
                <Link
                  key={a.id}
                  to="/glossary/$termId"
                  params={{ termId: a.glossaryId }}
                  aria-label={`用語集で ${a.name} を見る`}
                  style={{ textDecoration: 'none' }}
                >
                  <Badge variant="light">{a.shortName}</Badge>
                </Link>
              ))}
            </Group>
          ) : null}
        </Group>
        <Group justify="space-between" align="center" wrap="nowrap">
          <Group gap="md" c="dimmed">
            <Text size="sm">{formatTsubo(vendor.pricePerTsuboMin, vendor.pricePerTsuboMax)}</Text>
            {vendor.placeCount > 0 ? (
              <Group gap={4}>
                <MapPin size={14} aria-hidden />
                <Text size="sm">{vendor.placeCount} 箇所</Text>
              </Group>
            ) : null}
          </Group>
          <VendorLinks websiteUrl={vendor.websiteUrl} socialUrls={vendor.socialUrls} size="sm" />
        </Group>
      </Stack>
    </Card>
  )
}
