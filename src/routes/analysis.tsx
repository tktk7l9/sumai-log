import { Badge, Card, Group, SimpleGrid, Stack, Table, Text, Title } from '@mantine/core'
import { Link, createFileRoute } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { CountBars } from '../components/analysis/CountBars'
import { MonthlyChart } from '../components/analysis/MonthlyChart'
import { StatusBadge } from '../components/candidates/StatusBadge'
import { PageShell } from '../components/PageShell'
import { ATTENDEES_LABEL } from '../db/schema'
import type { Gap, Who } from '../lib/analysis'
import { formatDateSlash } from '../lib/calendar'
import type { CandidateStatus } from '../lib/status'
import { getAnalysis } from '../server/analysis'

/**
 * 記録の分析（所有者の要望、2026-09-23）。記録の中身をアプリの中で数えるだけ（外部に送らない）。
 * 集計は src/lib/analysis.ts、ここは見せ方だけ。
 */
export const Route = createFileRoute('/analysis')({
  component: Page,
  loader: () => getAnalysis(),
})

/** 書きかけの記録は最初のこの件数だけ並べる */
const GAP_PREVIEW = 5

function Page() {
  const { analysis: a } = Route.useLoaderData()
  const s = a.summary
  const gapsTotal = a.gaps.visitsWithoutNotes.length + a.gaps.videosWithoutTakeaways.length

  return (
    <PageShell
      title="記録の分析"
      description="見学・動画メモ・業者・予定・コメントをアプリの中で数えた結果です。記録の本文が増えるほど「よく出る言葉」などが育ちます。"
    >
      <Stack gap="md">
        <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="xs">
          <Stat label="見学" value={`${s.visits}件`} sub={`写真 ${s.photos}枚`} />
          <Stat label="動画メモ" value={`${s.videos}本`} sub={`コメント ${s.comments}件`} />
          <Stat label="業者" value={`${s.vendors}社`} sub="候補に登録" />
          <Stat
            label="期間"
            value={s.firstDate ? formatDateSlash(s.firstDate) : '—'}
            sub={s.lastDate ? `〜 ${formatDateSlash(s.lastDate)}` : '記録なし'}
          />
        </SimpleGrid>

        {gapsTotal > 0 ? (
          <Section
            title="書きかけの記録"
            badge={`${gapsTotal}件`}
            note="本文が空の記録です。ここを埋めると、下の「よく出る言葉」「次にやること」が出てきます。"
          >
            <GapList
              title="よかった点・気になる点などが空の見学"
              items={a.gaps.visitsWithoutNotes}
              link={(g) => (
                <Link className="analysis-link" to="/records/visits/$id" params={{ id: g.id }}>
                  {g.label}
                </Link>
              )}
            />
            <GapList
              title="学んだことが空の動画"
              items={a.gaps.videosWithoutTakeaways}
              link={(g) => (
                <Link className="analysis-link" to="/records/videos/$id" params={{ id: g.id }}>
                  {g.label}
                </Link>
              )}
            />
          </Section>
        ) : null}

        <Section
          title="月ごとの記録"
          note="直近 24 か月まで。それより古い記録は上の件数には入り、グラフには出ません。"
        >
          <MonthlyChart rows={a.monthly} />
        </Section>

        <Section
          title="業者ごとの接点"
          note="見学・動画・済んだ予定の数。これからの予定は別に数えます。接点が 0 の業者は、比べる材料がまだ無いということです。"
        >
          {a.vendors.length === 0 ? (
            <Text size="sm" c="dimmed">
              候補に業者がまだありません。
            </Text>
          ) : (
            <Table.ScrollContainer minWidth={420}>
              <Table fz="sm" verticalSpacing={6}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>業者</Table.Th>
                    <Table.Th ta="right" style={{ whiteSpace: 'nowrap' }}>
                      見学
                    </Table.Th>
                    <Table.Th ta="right" style={{ whiteSpace: 'nowrap' }}>
                      動画
                    </Table.Th>
                    <Table.Th ta="right" style={{ whiteSpace: 'nowrap' }}>
                      予定
                    </Table.Th>
                    <Table.Th style={{ whiteSpace: 'nowrap' }}>最後の接点</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {a.vendors.map((v) => (
                    <Table.Tr key={v.id}>
                      <Table.Td>
                        <Stack gap={2} align="flex-start">
                          <Link
                            className="analysis-link"
                            to="/candidates/vendors/$id"
                            params={{ id: v.id }}
                          >
                            {v.name}
                          </Link>
                          <StatusBadge status={v.status as CandidateStatus} />
                        </Stack>
                      </Table.Td>
                      <Table.Td ta="right">{v.visits}</Table.Td>
                      <Table.Td ta="right">{v.videos}</Table.Td>
                      <Table.Td ta="right">
                        {v.pastEvents}
                        {v.upcomingEvents > 0 ? (
                          <Text span size="xs" c="dimmed">
                            {' '}
                            ＋これから{v.upcomingEvents}
                          </Text>
                        ) : null}
                      </Table.Td>
                      <Table.Td>
                        {v.lastContact ? (
                          formatDateSlash(v.lastContact)
                        ) : (
                          <Text span size="sm" c="dimmed">
                            まだなし
                          </Text>
                        )}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          )}
        </Section>

        <Section
          title="よく出る用語"
          note="用語集の用語が、見学の本文・動画のタイトルと学んだこと・タグ・コメントの何件に出てくるか。"
        >
          <CountBars
            items={a.terms.map((t) => ({ name: t.term, count: t.count }))}
            unit="件"
            empty="用語集の用語はまだ記録に出てきていません。"
            renderName={(item) => {
              const t = a.terms.find((x) => x.term === item.name)!
              return (
                <Link className="analysis-link" to="/glossary/$termId" params={{ termId: t.id }}>
                  {item.name}
                </Link>
              )
            }}
          />
        </Section>

        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          <Section title="よかった点によく出る言葉">
            <CountBars
              items={a.goodWords}
              unit="件"
              empty="見学の「よかった点」を書くとここに出ます。"
            />
          </Section>
          <Section title="気になる点によく出る言葉">
            <CountBars
              items={a.concernWords}
              unit="件"
              empty="見学の「気になる点」を書くとここに出ます。"
            />
          </Section>
        </SimpleGrid>

        <Section
          title="次にやること（未完了）"
          badge={a.nextActions.length > 0 ? `${a.nextActions.length}件` : undefined}
          note="見学の「次にやること」を 1 行ずつ並べます。行頭に「済」「✓」を付けると終わったものとして消えます。"
        >
          {a.nextActions.length === 0 ? (
            <Text size="sm" c="dimmed">
              未完了の「次にやること」はありません。
            </Text>
          ) : (
            <Stack gap={6} component="ul" className="analysis-plain-list">
              {a.nextActions.map((n, i) => (
                <li key={`${n.visitId}-${i}`}>
                  <Text size="sm">{n.text}</Text>
                  <Text size="xs" c="dimmed">
                    <Link
                      className="analysis-link"
                      to="/records/visits/$id"
                      params={{ id: n.visitId }}
                    >
                      {formatDateSlash(n.visitedOn)} {n.where}
                    </Link>
                  </Text>
                </li>
              ))}
            </Stack>
          )}
        </Section>

        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          <Section title="動画のタグ">
            <CountBars items={a.tags} unit="本" empty="動画にタグがまだありません。" />
          </Section>
          <Section title="よく見るチャンネル">
            <CountBars items={a.channels} unit="本" empty="チャンネルの記録がまだありません。" />
          </Section>
        </SimpleGrid>

        <Section title="誰が行った・見たか">
          <Stack gap={4}>
            <WhoLine label="見学" counts={a.who.visits} />
            <WhoLine label="動画" counts={a.who.videos} />
          </Stack>
        </Section>
      </Stack>
    </PageShell>
  )
}

function Section({
  title,
  badge,
  note,
  children,
}: {
  title: string
  badge?: string
  note?: string
  children: ReactNode
}) {
  return (
    <Card withBorder padding="md">
      <Stack gap="xs">
        <Group gap="xs">
          <Title order={2} size="h4">
            {title}
          </Title>
          {badge ? (
            <Badge variant="light" color="gray">
              {badge}
            </Badge>
          ) : null}
        </Group>
        {note ? (
          <Text size="xs" c="dimmed">
            {note}
          </Text>
        ) : null}
        {children}
      </Stack>
    </Card>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <Card withBorder padding="xs">
      <Stack gap={0} align="center">
        <Text size="xs" c="dimmed">
          {label}
        </Text>
        <Text fw={700}>{value}</Text>
        <Text size="xs" c="dimmed">
          {sub}
        </Text>
      </Stack>
    </Card>
  )
}

function GapList({
  title,
  items,
  link,
}: {
  title: string
  items: Gap[]
  link: (g: Gap) => ReactNode
}) {
  if (items.length === 0) return null
  return (
    <Stack gap={4}>
      <Text size="sm" fw={600}>
        {title}（{items.length}件）
      </Text>
      <Stack gap={2} component="ul" className="analysis-plain-list">
        {items.slice(0, GAP_PREVIEW).map((g) => (
          <li key={g.id}>
            <Text size="sm" lineClamp={1}>
              {g.date ? (
                <Text span size="xs" c="dimmed">
                  {formatDateSlash(g.date)}{' '}
                </Text>
              ) : null}
              {link(g)}
            </Text>
          </li>
        ))}
      </Stack>
      {items.length > GAP_PREVIEW ? (
        <Text size="xs" c="dimmed">
          ほか {items.length - GAP_PREVIEW} 件
        </Text>
      ) : null}
    </Stack>
  )
}

function WhoLine({ label, counts }: { label: string; counts: Record<Who, number> }) {
  return (
    <Text size="sm">
      <Text span fw={600}>
        {label}
      </Text>
      ：{(Object.keys(counts) as Who[]).map((k) => `${ATTENDEES_LABEL[k]} ${counts[k]}`).join('・')}
    </Text>
  )
}
