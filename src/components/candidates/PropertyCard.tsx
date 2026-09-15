import { Card, Group, Stack, Text } from '@mantine/core'
import { Link } from '@tanstack/react-router'
import { MapPin } from 'lucide-react'

import type { Property } from '../../db/schema'
import { formatSqm, formatYen } from '../../lib/format'
import { StatusBadge } from './StatusBadge'

export function PropertyCard({ property }: { property: Property }) {
  const stationText =
    property.station && property.walkMinutes != null
      ? `${property.station} 徒歩${property.walkMinutes}分`
      : (property.station ??
        (property.walkMinutes != null ? `徒歩${property.walkMinutes}分` : null))
  const areaText = property.areaSqm != null ? formatSqm(property.areaSqm) : null
  const layoutText = [property.layout, areaText].filter(Boolean).join('・')

  return (
    <Link
      to="/candidates/properties/$id"
      params={{ id: property.id }}
      style={{ textDecoration: 'none', color: 'inherit' }}
    >
      <Card withBorder padding="md">
        <Stack gap={6}>
          <Group justify="space-between" wrap="nowrap">
            <Text fw={700} lineClamp={1}>
              {property.name}
            </Text>
            <StatusBadge status={property.status} />
          </Group>
          {stationText ? (
            <Group gap={4}>
              <MapPin size={14} aria-hidden />
              <Text size="sm" c="dimmed">
                {stationText}
              </Text>
            </Group>
          ) : null}
          <Group gap="md">
            <Text size="sm" c="dimmed">
              {formatYen(property.price)}
            </Text>
            {layoutText ? (
              <Text size="sm" c="dimmed">
                {layoutText}
              </Text>
            ) : null}
          </Group>
        </Stack>
      </Card>
    </Link>
  )
}
