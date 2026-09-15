import { Badge, Card, Group, Stack, Text } from '@mantine/core'
import { Link } from '@tanstack/react-router'
import { MapPin } from 'lucide-react'

import { VENDOR_KIND_LABEL, type Vendor } from '../../db/schema'
import { formatTsubo } from '../../lib/format'
import { StatusBadge } from './StatusBadge'

export function VendorCard({
  vendor,
}: {
  vendor: Vendor & { coversHome: boolean; placeCount: number }
}) {
  return (
    <Link
      to="/candidates/vendors/$id"
      params={{ id: vendor.id }}
      style={{ textDecoration: 'none', color: 'inherit' }}
    >
      <Card withBorder padding="md">
        <Stack gap={6}>
          <Group justify="space-between" wrap="nowrap">
            <Text fw={700} lineClamp={1}>
              {vendor.name}
            </Text>
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
        </Stack>
      </Card>
    </Link>
  )
}
