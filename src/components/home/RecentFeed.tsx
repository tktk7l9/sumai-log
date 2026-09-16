import { Group, Stack, Text, Title } from '@mantine/core'
import { Link } from '@tanstack/react-router'

import { formatDateWithWeekday } from '../../lib/calendar'
import { feedSentence, groupFeedByDay, type FeedItem } from '../../lib/feed'
import { formatJstTime } from '../../lib/jst'
import type { Member } from '../../lib/members'
import { EmptyState } from '../EmptyState'
import { MemberChip } from '../MemberChip'

/** テキストの中の対象名だけをリンクにする。下線付きで「押せる」ことが分かるようにする */
const linkStyle = {
  color: 'var(--mantine-color-blue-7)',
  textDecoration: 'underline',
  textUnderlineOffset: '2px',
  fontWeight: 600,
} as const

/** id 1 個をパスパラメータに取る詳細ページ。visit/vendor/property/place/video と、
 * comment がそれらのどれかを対象にした場合の遷移先で共有する。 */
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
 * kind で網羅的に分岐する（末尾の never 代入により、FeedKind が増えて分岐漏れが
 * 出るとここで typecheck が落ちる）。comment だけは対象の種別が固定でない
 * （src/server/repository/feed.ts の targetHref 参照）ため、その中でだけ
 * href.to を見て振り分ける。想定外の href.to（対象の種別が増えて未対応になった等）は
 * 誤ったページへ飛ばさないよう、リンクにせずプレーンテキストとして表示する。
 */
function FeedRowLink({ item, children }: { item: FeedItem; children: React.ReactNode }) {
  switch (item.kind) {
    case 'visit':
    case 'photo':
      // photo の href は自分が属する見学記録の詳細ページを指す
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
      // calendar は m（表示月）が無いと今月にフォールバックし、他の月の予定は
      // 選択状態で表示されない（UpcomingEvents.tsx と同じく d から m を導く）
      const d = item.href.search?.d ?? ''
      return (
        <Link to="/calendar" search={{ m: d.slice(0, 7), d }} style={linkStyle}>
          {children}
        </Link>
      )
    }
    case 'source':
      // 情報源には詳細ページが無いため、一覧（/sources）へのリンクにする
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
                        {/* アイコンの隣の名前は出さない（所有者の要望）。誰が書いたかは
                            丸の色と title/aria-label（読み上げ・ホバー）に残す */}
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
