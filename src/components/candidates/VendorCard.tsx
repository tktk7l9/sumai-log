import { Badge, Card, Group, Stack, Text } from '@mantine/core'
import { Link, useNavigate } from '@tanstack/react-router'
import { MapPin } from 'lucide-react'

import { VENDOR_KIND_LABEL, type Vendor } from '../../db/schema'
import { formatTsubo } from '../../lib/format'
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
      <Stack gap={6}>
        <Group justify="space-between" wrap="nowrap">
          <Link
            to="/candidates/vendors/$id"
            params={params}
            onClick={(e) => e.stopPropagation()}
            style={{ textDecoration: 'none', color: 'inherit' }}
          >
            <Text component="span" fw={700} lineClamp={1}>
              {vendor.name}
            </Text>
          </Link>
          <StatusBadge status={vendor.status} />
        </Group>
        <Group gap="xs">
          <Badge variant="default">{VENDOR_KIND_LABEL[vendor.kind]}</Badge>
          {vendor.coversHome ? (
            <Badge color="teal" variant="light">
              建築予定地が施工エリア内
            </Badge>
          ) : null}
          {vendor.uaValue != null ? <Badge variant="default">UA {vendor.uaValue}</Badge> : null}
          {vendor.cValuePublished ? <Badge variant="default">C値公開</Badge> : null}
        </Group>
        <Group justify="space-between" align="center" wrap="nowrap">
          <Group gap="md">
            <Text size="sm" c="dimmed">
              {formatTsubo(vendor.pricePerTsuboMin, vendor.pricePerTsuboMax)}
            </Text>
            {vendor.placeCount > 0 ? (
              <Group gap={4}>
                <MapPin size={14} aria-hidden />
                <Text size="sm" c="dimmed">
                  {vendor.placeCount} 箇所
                </Text>
              </Group>
            ) : null}
          </Group>
          <VendorLinks websiteUrl={vendor.websiteUrl} socialUrls={vendor.socialUrls} size="sm" />
        </Group>
      </Stack>
    </Card>
  )
}
