import { Badge, Group, Stack, Text, UnstyledButton } from '@mantine/core'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'

import { dateKey, formatDateSlash, formatDateWithWeekday } from '../../lib/calendar'
import { isMailNews } from '../../lib/mail/toNews'
import { groupNewsByDate } from '../../lib/scheduleEvents'
import type { NewsEventRow } from '../../server/repository'
import { EventBadge } from './EventBadge'
import { FormDrawer } from '../FormDrawer'
import { NewsEventDrawer } from './NewsEventDrawer'

/**
 * 見出しに出す日付の範囲（YYYY/MM/DD – YYYY/MM/DD）。0 件のときは「お知らせはありません」の
 * 上に出るだけで意味を持たないため、呼び出し時点の日付を使う。
 * 呼び出し側が明示の rangeStart/rangeEnd を渡すとき（/news の月ごとのアジェンダ。
 * 月初〜月末を渡したい＝件数に依らない固定レンジ）はこちらを使わない。
 */
function agendaRange(items: readonly NewsEventRow[]): { start: string; end: string } {
  if (items.length === 0) {
    const today = dateKey(new Date().toISOString())
    return { start: today, end: today }
  }
  let start = items[0].publishedOn
  let end = items[0].publishedOn
  for (const item of items) {
    if (item.publishedOn < start) start = item.publishedOn
    if (item.publishedOn > end) end = item.publishedOn
  }
  return { start, end }
}

/**
 * ホーム・`/news` 共通のお知らせ一覧（所有者の要望、2026-09-16）。公開日ごとに見出しを
 * 立て、**新しい日を上**に並べる（2026-09-24。以前は @mantine/schedule の AgendaView を
 * 使っていたが、日付を古い順に固定で並べ、順番を変える設定が無かったため自前で組む）。行は「業者名（dimmed）＋タイトル＋
 * イベントバッジ＋（予定化済みなら）予定ありバッジ」の読み取り専用表示にとどめ、クリック
 * すると `NewsEventDrawer`（「行く」/「予定を見る」）を開く。行く操作自体はこのドロワーの
 * 中に一本化する（ホーム・`/news` の両方でボタンの置き場所を揃えるため）。
 *
 * `rangeStart`/`rangeEnd` を省略するとホームと同じ「items の publishedOn の min/max」に
 * なる。`/news`（月ごとのアジェンダ、fix round 1）はその月の初日/末日を明示で渡し、
 * 0 件の月でも月の範囲がヘッダーに出るようにする。`emptyLabel` も同様に省略時は
 * ホームと同じ「お知らせはありません」、`/news` は「この月のお知らせはありません」を渡す。
 *
 * `todayKey` を渡すと、日程が終わったお知らせ（見学会が済んだ等）の行の文字色を落とす
 * （所有者の要望、2026-09-21）。日程を持たないお知らせは公開日しか無く、公開日は常に
 * 過去なので落とさない。
 */
export function NewsAgenda({
  items,
  rangeStart,
  rangeEnd,
  emptyLabel = 'お知らせはありません',
  hideHeader = false,
  todayKey,
}: {
  items: NewsEventRow[]
  rangeStart?: string
  rangeEnd?: string
  emptyLabel?: string
  /** true なら「9/18 – 9/18」のようなレンジ見出しを出さない（ホーム用） */
  hideHeader?: boolean
  /** 今日（JST の 'YYYY-MM-DD'）。終わった日程のお知らせの色を落とす基準 */
  todayKey?: string
}) {
  const navigate = useNavigate()
  const [drawerNewsId, setDrawerNewsId] = useState<string | null>(null)

  const groups = groupNewsByDate(items, todayKey)
  const range = rangeStart && rangeEnd ? { start: rangeStart, end: rangeEnd } : agendaRange(items)
  const drawerNews = drawerNewsId ? (items.find((n) => n.id === drawerNewsId) ?? null) : null

  /** ドロワーの「行く」。即作成せず、カレンダーで予定フォーム（初期値入り）を開く（?plan=）。
   * ボタンは日程のあるお知らせにしか出ない（planButtonState）ので eventStart はある */
  function handlePlan(news: NewsEventRow) {
    setDrawerNewsId(null)
    const key = news.eventStart ?? news.publishedOn
    navigate({ to: '/calendar', search: { m: key.slice(0, 7), d: key, plan: news.id } })
  }

  /** ドロワーの「予定を見る」（既に「行く」済み）。カレンダーの該当日へ移動する
   * （NewsRow が旧 NewsList で持っていた挙動と同じ。ここには EventForm を編集する画面が
   * 無いため、予定そのものの編集はカレンダー側に任せる）。
   * plannedEventId が付くのは planVisitFromNews が eventStart 必須で作る予定だけ
   * （src/server/news.ts）なので、通常は eventStart も必ずある。それでも
   * plannedEventId はあるのに eventStart が無い（データ不整合等の）行き違いが
   * あったときに、日付が特定できないからと何もせず素通りするのは避け、今日の
   * カレンダーへ連れて行く（fix round 1 指摘）。*/
  function handleViewEvent(news: NewsEventRow) {
    setDrawerNewsId(null)
    if (news.eventStart) {
      navigate({ to: '/calendar', search: { m: news.eventStart.slice(0, 7), d: news.eventStart } })
      return
    }
    navigate({ to: '/calendar' })
  }

  return (
    <>
      <div className="news-agenda">
        {hideHeader ? null : (
          <Text size="sm" c="dimmed" className="news-agenda-range">
            {formatDateSlash(range.start)} – {formatDateSlash(range.end)}
          </Text>
        )}
        {groups.length === 0 ? (
          <Text size="sm" c="dimmed" py="sm">
            {emptyLabel}
          </Text>
        ) : (
          groups.map((g) => (
            <section key={g.date} className="news-agenda-group">
              <Text size="sm" fw={600} className="news-agenda-date">
                {formatDateWithWeekday(g.date)}
              </Text>
              {g.items.map(({ news: item, past }) => (
                // 終わった日程のお知らせは題名も補助色に落とす（バッジの色は変えない。
                // 「見学会 2026/09/12(土)」の日付を読めば終わったことは分かる）
                <UnstyledButton
                  key={item.id}
                  className="news-agenda-row"
                  data-past={past ? true : undefined}
                  onClick={() => setDrawerNewsId(item.id)}
                >
                  <Stack gap={4} py={8} px="sm">
                    <Text size="sm" c="dimmed">
                      {item.vendorName}
                    </Text>
                    <Text size="sm" fw={600} c={past ? 'dimmed' : undefined}>
                      {item.title}
                    </Text>
                    {item.eventKind || item.plannedEventId || isMailNews(item.url) ? (
                      <Group gap={6} wrap="wrap" align="center">
                        {isMailNews(item.url) ? (
                          <Badge size="xs" variant="outline" color="gray">
                            メール
                          </Badge>
                        ) : null}
                        <EventBadge
                          eventKind={item.eventKind}
                          eventStart={item.eventStart}
                          eventEnd={item.eventEnd}
                        />
                        {item.plannedEventId ? (
                          <Badge size="xs" variant="light">
                            予定あり
                          </Badge>
                        ) : null}
                      </Group>
                    ) : null}
                  </Stack>
                </UnstyledButton>
              ))}
            </section>
          ))
        )}
      </div>
      <FormDrawer
        opened={drawerNews !== null}
        onClose={() => setDrawerNewsId(null)}
        title="お知らせ"
      >
        {drawerNews ? (
          <NewsEventDrawer
            news={drawerNews}
            planning={false}
            onPlan={() => handlePlan(drawerNews)}
            onViewEvent={() => handleViewEvent(drawerNews)}
          />
        ) : null}
      </FormDrawer>
    </>
  )
}
