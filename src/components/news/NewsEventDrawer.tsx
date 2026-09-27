import { Anchor, Badge, Button, Loader, Stack, Text } from '@mantine/core'
import { useServerFn } from '@tanstack/react-start'
import { useEffect, useState } from 'react'

import { formatDateWithWeekday } from '../../lib/calendar'
import { toJstDateKey } from '../../lib/jst'
import { isMailNews } from '../../lib/mail/toNews'
import { planButtonState } from '../../lib/news/planButton'
import { getMailBody } from '../../server/mails'
import type { NewsEventRow } from '../../server/repository'
import { EventBadge } from './EventBadge'

/**
 * The content of the drawer that opens when a vendor news item is tapped. A shared part
 * used by both the information layer of the calendar (FormDrawer in
 * src/routes/calendar.tsx) and the agenda view of vendor news (FormDrawer in
 * src/components/news/NewsAgenda.tsx).
 * When "行く" (Go) converts it into the user's own event (after router.invalidate, if the
 * same news is passed again to these props), plannedEventId is set and the button
 * automatically changes to "予定を見る" (See event).
 *
 * News that comes from mail (url is mail:) has no external link, so the title is shown as
 * text and the body is shown below (design 2026-09-19 §5). The body is fetched when
 * opened (the list payload does not include the body).
 */
export function NewsEventDrawer({
  news,
  planning,
  onPlan,
  onViewEvent,
}: {
  news: NewsEventRow
  planning: boolean
  onPlan: () => void
  onViewEvent: () => void
}) {
  const mail = isMailNews(news.url)
  // "行く" is shown only for upcoming news whose dates could be determined
  // (lib/news/planButton). Today is in JST
  const plan = planButtonState(news, toJstDateKey(new Date().toISOString()))
  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {news.vendorName}
      </Text>
      {mail ? (
        <Stack gap={4}>
          <Badge size="xs" variant="light" style={{ alignSelf: 'flex-start' }}>
            メール
          </Badge>
          <Text fw={600}>{news.title}</Text>
        </Stack>
      ) : (
        <Anchor href={news.url} target="_blank" rel="noopener noreferrer" fw={600}>
          {news.title}
        </Anchor>
      )}
      <EventBadge
        eventKind={news.eventKind}
        eventStart={news.eventStart}
        eventEnd={news.eventEnd}
      />
      <Text size="xs" c="dimmed">
        公開日 {formatDateWithWeekday(news.publishedOn)}
      </Text>
      {plan.kind === 'view' ? (
        <Button onClick={onViewEvent}>予定を見る</Button>
      ) : plan.kind === 'plan' ? (
        <Button onClick={onPlan} loading={planning}>
          {plan.label}
        </Button>
      ) : plan.kind === 'ended' ? (
        <Text size="sm" c="dimmed">
          この日程は終了しました
        </Text>
      ) : null}
      {mail && news.mailId ? <MailBody mailId={news.mailId} /> : null}
    </Stack>
  )
}

function MailBody({ mailId }: { mailId: string }) {
  const load = useServerFn(getMailBody)
  const [body, setBody] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    let cancelled = false
    setBody(undefined)
    load({ data: { id: mailId } })
      .then((r) => {
        if (!cancelled) setBody(r.body)
      })
      .catch(() => {
        if (!cancelled) setBody(null)
      })
    return () => {
      cancelled = true
    }
  }, [mailId, load])
  if (body === undefined) return <Loader size="sm" />
  if (body === null)
    return (
      <Text size="sm" c="dimmed">
        本文を読み込めませんでした。
      </Text>
    )
  // The Drawer itself scrolls vertically, so do not put the body in a separate scroll box
  // (it becomes nested scrolling on a phone). Long URLs etc. wrap with breakable
  // (overflow-wrap: anywhere), and no horizontal scroll appears (owner's report, 2026-09-25)
  return (
    <Text size="sm" className="breakable" style={{ whiteSpace: 'pre-wrap' }}>
      {body}
    </Text>
  )
}
