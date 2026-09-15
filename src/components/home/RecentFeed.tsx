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

/** id 1 個をパスパラメータに取る詳細ページ。visit/vendor/property/place/video と、
 * comment がそれらのどれかを対象にした場合の遷移先で共有する。 */
type IdRouteTo =
  | '/records/visits/$id'
  | '/candidates/vendors/$id'
  | '/candidates/properties/$id'
  | '/places/$id'
  | '/records/videos/$id'

function IdLink({
  to,
  id,
  label,
  children,
}: {
  to: IdRouteTo
  id: string
  label: string
  children: React.ReactNode
}) {
  switch (to) {
    case '/records/visits/$id':
      return (
        <Link to="/records/visits/$id" params={{ id }} aria-label={label} style={linkStyle}>
          {children}
        </Link>
      )
    case '/candidates/vendors/$id':
      return (
        <Link to="/candidates/vendors/$id" params={{ id }} aria-label={label} style={linkStyle}>
          {children}
        </Link>
      )
    case '/candidates/properties/$id':
      return (
        <Link to="/candidates/properties/$id" params={{ id }} aria-label={label} style={linkStyle}>
          {children}
        </Link>
      )
    case '/places/$id':
      return (
        <Link to="/places/$id" params={{ id }} aria-label={label} style={linkStyle}>
          {children}
        </Link>
      )
    case '/records/videos/$id':
      return (
        <Link to="/records/videos/$id" params={{ id }} aria-label={label} style={linkStyle}>
          {children}
        </Link>
      )
  }
}

/**
 * kind で網羅的に分岐する（末尾の never 代入により、FeedKind が増えて分岐漏れが
 * 出るとここで typecheck が落ちる）。comment だけは対象の種別が固定でない
 * （src/server/repository/feed.ts の targetHref 参照）ため、その中でだけ
 * href.to を見て振り分ける。想定外の href.to（対象の種別が増えて未対応になった等）は
 * 誤ったページへ飛ばさないよう、リンクにせずプレーンテキストとして表示する。
 */
function FeedRowLink({ item, children }: { item: FeedItem; children: React.ReactNode }) {
  const label = `${FEED_KIND_LABEL[item.kind]}: ${item.title}`
  switch (item.kind) {
    case 'visit':
    case 'photo':
      // photo の href は自分が属する見学記録の詳細ページを指す
      return (
        <IdLink to="/records/visits/$id" id={item.href.params?.id ?? ''} label={label}>
          {children}
        </IdLink>
      )
    case 'vendor':
      return (
        <IdLink to="/candidates/vendors/$id" id={item.href.params?.id ?? ''} label={label}>
          {children}
        </IdLink>
      )
    case 'property':
      return (
        <IdLink to="/candidates/properties/$id" id={item.href.params?.id ?? ''} label={label}>
          {children}
        </IdLink>
      )
    case 'place':
      return (
        <IdLink to="/places/$id" id={item.href.params?.id ?? ''} label={label}>
          {children}
        </IdLink>
      )
    case 'video':
      return (
        <IdLink to="/records/videos/$id" id={item.href.params?.id ?? ''} label={label}>
          {children}
        </IdLink>
      )
    case 'event': {
      // calendar は m（表示月）が無いと今月にフォールバックし、他の月の予定は
      // 選択状態で表示されない（UpcomingEvents.tsx と同じく d から m を導く）
      const d = item.href.search?.d ?? ''
      return (
        <Link to="/calendar" search={{ m: d.slice(0, 7), d }} aria-label={label} style={linkStyle}>
          {children}
        </Link>
      )
    }
    case 'comment':
      switch (item.href.to) {
        case '/records/visits/$id':
        case '/candidates/vendors/$id':
        case '/candidates/properties/$id':
        case '/places/$id':
        case '/records/videos/$id':
          return (
            <IdLink to={item.href.to} id={item.href.params?.id ?? ''} label={label}>
              {children}
            </IdLink>
          )
        default:
          return <>{children}</>
      }
    default:
      item.kind satisfies never
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
