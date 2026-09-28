import { Group, Stack, Text, Title } from '@mantine/core'
import { Link } from '@tanstack/react-router'

import { formatDateWithWeekday } from '../../lib/calendar'
import { feedSentence, groupFeedByDay, type FeedItem } from '../../lib/feed'
import { formatJstTime } from '../../lib/jst'
import type { Member } from '../../lib/members'
import { EmptyState } from '../EmptyState'
import { MemberChip } from '../MemberChip'

/** Only the target name inside the text becomes a link. Underlined so that it reads as
 * "pressable". */
const linkStyle = {
  color: 'var(--mantine-color-blue-7)',
  textDecoration: 'underline',
  textUnderlineOffset: '2px',
  fontWeight: 600,
} as const

/** Detail pages that take a single id as the path parameter. Shared by
 * visit/vendor/property/place/video and by the destination of a comment that targets one
 * of them. */
type IdRouteTo =
  | '/records/visits/$id'
  | '/candidates/vendors/$id'
  | '/candidates/properties/$id'
  | '/places/$id'
  | '/records/videos/$id'

function IdLink({ to, id, children }: { to: IdRouteTo; id: string; children: React.ReactNode }) {
  switch (to) {
    case '/records/visits/$id':
      return (
        <Link to="/records/visits/$id" params={{ id }} style={linkStyle}>
          {children}
        </Link>
      )
    case '/candidates/vendors/$id':
      return (
        <Link to="/candidates/vendors/$id" params={{ id }} style={linkStyle}>
          {children}
        </Link>
      )
    case '/candidates/properties/$id':
      return (
        <Link to="/candidates/properties/$id" params={{ id }} style={linkStyle}>
          {children}
        </Link>
      )
    case '/places/$id':
      return (
        <Link to="/places/$id" params={{ id }} style={linkStyle}>
          {children}
        </Link>
      )
    case '/records/videos/$id':
      return (
        <Link to="/records/videos/$id" params={{ id }} style={linkStyle}>
          {children}
        </Link>
      )
  }
}

/**
 * Branches exhaustively on kind (because of the never assignment at the end, typecheck
 * fails here when FeedKind grows and a branch is missing). Only comment has no fixed
 * target type (see targetHref in src/server/repository/feed.ts), so only inside it the
 * branch looks at href.to. An unexpected href.to (for example a new target type that is
 * not handled yet) is shown as plain text instead of a link, so that it never jumps to a
 * wrong page.
 */
function FeedRowLink({ item, children }: { item: FeedItem; children: React.ReactNode }) {
  switch (item.kind) {
    case 'visit':
    case 'photo':
      // The href of a photo points to the detail page of the visit record it belongs to
      return (
        <IdLink to="/records/visits/$id" id={item.href.params?.id ?? ''}>
          {children}
        </IdLink>
      )
    case 'vendor':
      return (
        <IdLink to="/candidates/vendors/$id" id={item.href.params?.id ?? ''}>
          {children}
        </IdLink>
      )
    case 'property':
      return (
        <IdLink to="/candidates/properties/$id" id={item.href.params?.id ?? ''}>
          {children}
        </IdLink>
      )
    case 'place':
      return (
        <IdLink to="/places/$id" id={item.href.params?.id ?? ''}>
          {children}
        </IdLink>
      )
    case 'video':
      return (
        <IdLink to="/records/videos/$id" id={item.href.params?.id ?? ''}>
          {children}
        </IdLink>
      )
    case 'event': {
      // Without m (the displayed month) calendar falls back to the current month, and an
      // event in another month is not shown as selected (derive m from d, as in HomeAgenda)
      const d = item.href.search?.d ?? ''
      return (
        <Link to="/calendar" search={{ m: d.slice(0, 7), d }} style={linkStyle}>
          {children}
        </Link>
      )
    }
    case 'source':
      // Sources have no detail page, so link to the list (/sources)
      return (
        <Link to="/sources" style={linkStyle}>
          {children}
        </Link>
      )
    case 'comment':
      switch (item.href.to) {
        case '/records/visits/$id':
        case '/candidates/vendors/$id':
        case '/candidates/properties/$id':
        case '/places/$id':
        case '/records/videos/$id':
          return (
            <IdLink to={item.href.to} id={item.href.params?.id ?? ''}>
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
  const groups = groupFeedByDay(items)
  return (
    <Stack gap="sm">
      <Title order={2}>最近の更新</Title>
      {items.length === 0 ? (
        <EmptyState emoji="🪴" title="まだ更新がありません" />
      ) : (
        <Stack gap="lg">
          {groups.map((group) => (
            <Stack key={group.day} gap={6}>
              <Text size="sm" fw={600}>
                {formatDateWithWeekday(group.day)}
              </Text>
              <Stack gap={6}>
                {group.items.map((item) => {
                  const sentence = feedSentence(item)
                  return (
                    <Group
                      key={`${item.kind}-${item.id}`}
                      wrap="nowrap"
                      align="flex-start"
                      gap="xs"
                    >
                      <Text
                        size="xs"
                        c="dimmed"
                        ff="monospace"
                        w={40}
                        style={{ flexShrink: 0 }}
                        pt={2}
                      >
                        {formatJstTime(item.at)}
                      </Text>
                      <div style={{ flexShrink: 0, paddingTop: 2 }}>
                        {/* Do not show the name next to the icon (owner's request). Who wrote
                            it stays in the circle color and title/aria-label (screen
                            reader, hover) */}
                        <MemberChip email={item.by} members={members} iconOnly />
                      </div>
                      <Text size="sm" style={{ flex: 1, minWidth: 0 }}>
                        {sentence.before}
                        <FeedRowLink item={item}>{sentence.link}</FeedRowLink>
                        {sentence.after}
                      </Text>
                    </Group>
                  )
                })}
              </Stack>
            </Stack>
          ))}
        </Stack>
      )}
    </Stack>
  )
}
