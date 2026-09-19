import { Anchor, Badge, Button, Loader, ScrollArea, Stack, Text } from '@mantine/core'
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
 * お知らせをタップしたときに開くドロワーの中身。カレンダーの情報レイヤー
 * （src/routes/calendar.tsx の FormDrawer）と、お知らせのアジェンダ表示
 * （src/components/news/NewsAgenda.tsx の FormDrawer）の両方で使う共通部品。
 * 「行く」で自分の予定に変換すると（router.invalidate 後、同じ news をこの props に
 * 渡し直せば）plannedEventId が付き、ボタンが自動的に「予定を見る」に変わる。
 *
 * メール由来（url が mail:）は外部リンクが無いので、タイトルを文字で出し本文を下に表示する
 * （設計 2026-09-19 §5）。本文は開いたときに取りに行く（一覧の payload に本文を含めない）。
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
  // 「行く」は日程を判定できた今後のお知らせにだけ出す（lib/news/planButton）。今日は JST
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
  return (
    <ScrollArea.Autosize mah="50vh" type="auto">
      <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
        {body}
      </Text>
    </ScrollArea.Autosize>
  )
}
