import { Card, Group, Stack, Text, ThemeIcon, Title } from '@mantine/core'
import { Link } from '@tanstack/react-router'
import {
  Building,
  Building2,
  Camera,
  CalendarDays,
  Image,
  MapPin,
  MessageSquare,
  Video,
} from 'lucide-react'

import { FEED_KIND_LABEL, type FeedItem, type FeedKind } from '../../lib/feed'
import { formatJst } from '../../lib/jst'
import type { Member } from '../../lib/members'
import { EmptyState } from '../EmptyState'
import { MemberChip } from '../MemberChip'

// lucide-react のこのバージョンにはブランドアイコン（Youtube 等）が無いため、
// 動画は汎用の Video アイコンで代用する。
const FEED_KIND_ICON: Record<FeedKind, typeof Camera> = {
  visit: Camera,
  event: CalendarDays,
  vendor: Building2,
  property: Building,
  place: MapPin,
  video: Video,
  comment: MessageSquare,
  photo: Image,
}

const linkStyle = { textDecoration: 'none', color: 'inherit' } as const

/**
 * FeedItem.href.to は種別ごとに固定の文字列（comment はコメント対象の種別の href を
 * そのまま流用するため kind とは 1:1 にならない）。href.to の値で分岐することで、
 * `<Link>` の to ごとに正しい型の params/search を渡す。
 */
function FeedRowLink({ item, children }: { item: FeedItem; children: React.ReactNode }) {
  const { href } = item
  const label = `${FEED_KIND_LABEL[item.kind]}: ${item.title}`
  switch (href.to) {
    case '/calendar':
      return (
        <Link to="/calendar" search={{ d: href.search?.d }} aria-label={label} style={linkStyle}>
          {children}
        </Link>
      )
    case '/records/visits/$id':
      return (
        <Link
          to="/records/visits/$id"
          params={{ id: href.params?.id ?? '' }}
          aria-label={label}
          style={linkStyle}
        >
          {children}
        </Link>
      )
    case '/records/videos/$id':
      return (
        <Link
          to="/records/videos/$id"
          params={{ id: href.params?.id ?? '' }}
          aria-label={label}
          style={linkStyle}
        >
          {children}
        </Link>
      )
    case '/candidates/vendors/$id':
      return (
        <Link
          to="/candidates/vendors/$id"
          params={{ id: href.params?.id ?? '' }}
          aria-label={label}
          style={linkStyle}
        >
          {children}
        </Link>
      )
    case '/candidates/properties/$id':
      return (
        <Link
          to="/candidates/properties/$id"
          params={{ id: href.params?.id ?? '' }}
          aria-label={label}
          style={linkStyle}
        >
          {children}
        </Link>
      )
    case '/places/$id':
      return (
        <Link
          to="/places/$id"
          params={{ id: href.params?.id ?? '' }}
          aria-label={label}
          style={linkStyle}
        >
          {children}
        </Link>
      )
    default:
      return <>{children}</>
  }
}

export function RecentFeed({ items, members }: { items: FeedItem[]; members: Member[] }) {
  return (
    <Stack gap="xs">
      <Title order={2}>最近の更新</Title>
      {items.length === 0 ? (
        <EmptyState title="まだ更新がありません" />
      ) : (
        <Stack gap="xs">
          {items.map((item) => {
            const Icon = FEED_KIND_ICON[item.kind]
            return (
              <FeedRowLink key={`${item.kind}-${item.id}`} item={item}>
                <Card withBorder padding="sm">
                  <Group wrap="nowrap" align="flex-start" gap="sm">
                    <ThemeIcon variant="light" size="lg" radius="xl" style={{ flexShrink: 0 }}>
                      <Icon size={18} aria-hidden />
                    </ThemeIcon>
                    <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
                      <Text fw={600} lineClamp={1}>
                        {item.title}
                      </Text>
                      {item.subtitle ? (
                        <Text size="xs" c="dimmed" lineClamp={1}>
                          {item.subtitle}
                        </Text>
                      ) : null}
                      <Group gap={6} wrap="nowrap">
                        <MemberChip email={item.by} members={members} />
                        <Text size="xs" c="dimmed">
                          ・{formatJst(item.at)}
                        </Text>
                      </Group>
                    </Stack>
                  </Group>
                </Card>
              </FeedRowLink>
            )
          })}
        </Stack>
      )}
    </Stack>
  )
}
