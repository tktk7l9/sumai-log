import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  Divider,
  Group,
  Stack,
  TagsInput,
  Text,
  Title,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'

import { ColorSchemeSetting } from '../components/ColorSchemeSetting'
import { MemberChip } from '../components/MemberChip'
import { PageShell } from '../components/PageShell'
import { Row } from '../components/candidates/DetailRow'
import { BuildPlanCard } from '../components/settings/BuildPlanCard'
import { MailImportCard } from '../components/settings/MailImportCard'
import { NEWS_SOURCE_LABEL } from '../db/schema'
import { extractErrorMessage } from '../lib/formError'
import { formatJst } from '../lib/jst'
import { describeFetchError } from '../lib/news/errors'
import { sameHost } from '../lib/news/url'
import { photoUrl } from '../lib/photos'
import { D1_FREE_BYTES, R2_FREE_BYTES, formatBytes, formatRowCounts, percentOf } from '../lib/usage'
import { listMailImport } from '../server/mails'
import { fetchNewsNow, newsSources as loadNewsSources, reparseNewsEvents } from '../server/news'
import { listLinkTargets } from '../server/places'
import { getBuildPlan } from '../server/research'
import { getSettings } from '../server/settings'
import { listTagNames, saveTags } from '../server/tags'
import { faviconSources as loadFaviconSources, refreshVendorFavicons } from '../server/vendorImages'

/** 「お知らせ」カードで取得 URL を短く見せる（全文は title 属性で見られる）。 */
const NEWS_URL_DISPLAY_MAX = 40
function truncateForDisplay(url: string): string {
  return url.length > NEWS_URL_DISPLAY_MAX ? `${url.slice(0, NEWS_URL_DISPLAY_MAX)}…` : url
}

export const Route = createFileRoute('/settings')({
  component: Page,
  loader: async () => {
    const [settings, tags, news, favicons, mail, targets, buildPlan] = await Promise.all([
      getSettings(),
      listTagNames(),
      loadNewsSources(),
      loadFaviconSources(),
      listMailImport(),
      listLinkTargets(),
      getBuildPlan(),
    ])
    return {
      ...settings,
      tags,
      newsSources: news.sources,
      faviconVendors: favicons.vendors,
      mail,
      vendorOptions: targets.vendors,
      buildPlan: buildPlan.plan,
    }
  },
})

function Page() {
  const {
    homeAreas,
    actorEmail,
    members,
    lastSeen,
    environment,
    photosReady,
    usage,
    tags,
    newsSources,
    faviconVendors,
    mail,
    vendorOptions,
    buildPlan,
  } = Route.useLoaderData()
  const router = useRouter()
  const saveTagsFn = useServerFn(saveTags)
  const fetchNewsNowFn = useServerFn(fetchNewsNow)
  const reparseNewsEventsFn = useServerFn(reparseNewsEvents)
  const refreshFaviconsFn = useServerFn(refreshVendorFavicons)
  const [tagValues, setTagValues] = useState<string[]>(tags)
  const [savingTags, setSavingTags] = useState(false)
  const [fetchingNews, setFetchingNews] = useState(false)
  const [reparsingNews, setReparsingNews] = useState(false)
  const [fetchingFavicons, setFetchingFavicons] = useState(false)

  async function submitTags() {
    // 0 件保存はサーバーも拒否するが、往復させずにここで止める
    if (tagValues.length === 0) {
      notifications.show({ message: 'タグは 1 つ以上必要です', color: 'red' })
      return
    }
    setSavingTags(true)
    try {
      await saveTagsFn({ data: { names: tagValues } })
      await router.invalidate()
      notifications.show({ message: 'タグを保存しました' })
    } catch (error) {
      notifications.show({ message: extractErrorMessage(error), color: 'red' })
    } finally {
      setSavingTags(false)
    }
  }

  async function handleFetchNews() {
    if (newsSources.length === 0) {
      notifications.show({ message: 'お知らせ URL が設定された業者がありません', color: 'red' })
      return
    }
    setFetchingNews(true)
    try {
      const { results } = await fetchNewsNowFn()
      for (const r of results) {
        // fetchAllVendorNews が業者名を返す（UUID をそのまま見せない）。
        // 万一空文字が来ても（あり得ないはずだが）読める文言にフォールバックする
        const name = r.vendorName || '不明な業者'
        if (r.error) {
          notifications.show({ message: `${name}: エラー ${r.error}`, color: 'red' })
        } else {
          notifications.show({ message: `${name}: 追加 ${r.added} 件` })
        }
      }
      await router.invalidate()
    } catch (error) {
      notifications.show({ message: extractErrorMessage(error), color: 'red' })
    } finally {
      setFetchingNews(false)
    }
  }

  /**
   * 「日程を再解析」。`eventDate.ts` の抽出ロジックが直った後に、既存の
   * vendor_news 全件へ再適用する（取得し直さず、保存済みのタイトル/要約から
   * 再計算するだけ）。
   */
  async function handleReparseNews() {
    setReparsingNews(true)
    try {
      const { checked, updated } = await reparseNewsEventsFn()
      notifications.show({ message: `${checked} 件のうち ${updated} 件の日程を更新しました` })
      await router.invalidate()
    } catch (error) {
      notifications.show({ message: extractErrorMessage(error), color: 'red' })
    } finally {
      setReparsingNews(false)
    }
  }

  async function handleFetchFavicons(force: boolean) {
    if (faviconVendors.length === 0) {
      notifications.show({ message: '公式サイトの URL が設定された業者がありません', color: 'red' })
      return
    }
    setFetchingFavicons(true)
    try {
      const { results, remaining } = await refreshFaviconsFn({ data: { force } })
      if (results.length === 0 && remaining === 0) {
        notifications.show({
          message: force
            ? '対象の業者がありません'
            : 'すべて取得済みです（「取り直す」で再取得できます）',
        })
      }
      for (const r of results) {
        const name = r.vendorName || '不明な業者'
        if (!r.ok) {
          notifications.show({ message: `${name}: エラー ${r.error}`, color: 'red' })
        } else {
          notifications.show({ message: `${name}: アイコンを取得しました` })
        }
      }
      // 1 回の呼び出しで処理する業者数には上限があるので、残りがあれば続けて押してもらう
      // （次回は今回処理した分の stamp が新しくなっているので、自然に次の分へ順番が回る）
      if (remaining > 0) {
        notifications.show({
          message: `残り ${remaining} 件（もう一度押してください）`,
          color: 'blue',
        })
      }
      await router.invalidate()
    } catch (error) {
      notifications.show({ message: extractErrorMessage(error), color: 'red' })
    } finally {
      setFetchingFavicons(false)
    }
  }

  return (
    <PageShell title="設定">
      <Card withBorder padding="md">
        <Stack gap="sm">
          <Title order={2}>表示</Title>
          <ColorSchemeSetting />
        </Stack>
      </Card>

      <BuildPlanCard plan={buildPlan} />

      <Card withBorder padding="md">
        <Stack gap="sm">
          <Title order={2}>タグ</Title>
          <Text size="sm" c="dimmed">
            動画の記録で候補に出るタグ。Enter で追加、並びは入れた順です。
          </Text>
          <TagsInput
            label="タグ"
            value={tagValues}
            onChange={setTagValues}
            placeholder="タグを入力して Enter"
            maxLength={30}
          />
          <Text size="xs" c="dimmed">
            動画に付けたタグはそのまま残ります。
          </Text>
          <Group justify="flex-end">
            <Button onClick={submitTags} loading={savingTags}>
              保存
            </Button>
          </Group>
        </Stack>
      </Card>

      <Card withBorder padding="md">
        <Stack gap="sm">
          <Title order={2}>利用者</Title>
          {members.length === 0 ? (
            <Alert color="orange">
              secret MEMBERS が未設定です（README 参照）。表示名と色を出すには設定してください。
            </Alert>
          ) : (
            <Stack gap="xs">
              {members.map((m) => (
                <Group key={m.email} justify="space-between" wrap="nowrap" align="flex-start">
                  <Group gap="xs" wrap="nowrap">
                    <MemberChip email={m.email} members={members} />
                    {m.email === actorEmail ? <Badge variant="light">あなた</Badge> : null}
                  </Group>
                  <Text size="xs" c="dimmed" ta="right">
                    {lastSeen[m.email]
                      ? `最後に使った: ${formatJst(lastSeen[m.email]!)}`
                      : '最後に使った: まだ記録なし'}
                  </Text>
                </Group>
              ))}
              <Text size="xs" c="dimmed">
                「最後に使った」はそのメールで最後にアプリを開いた（操作した）日時。ログイン自体は
                Cloudflare Access が行い、セッションは約 1 ヶ月続く
              </Text>
            </Stack>
          )}
        </Stack>
      </Card>

      <Card withBorder padding="md">
        <Stack gap="sm">
          <Title order={2}>環境</Title>
          <Stack gap="xs">
            <Row label="環境" value={environment} />
            <Row label="建築予定地の市区町村" value={homeAreas.join('、') || '未設定'} />
            <Row label="写真の保管 (R2)" value={photosReady ? '有効' : '未設定'} />
            <Row
              label="データベース (D1)"
              value={
                usage.d1
                  ? usage.d1.bytes === null
                    ? '大きさは取れません'
                    : `${formatBytes(usage.d1.bytes)}（無料枠 ${formatBytes(D1_FREE_BYTES)} の ${percentOf(usage.d1.bytes, D1_FREE_BYTES)}%）`
                  : '取れません'
              }
            />
            <Row
              label="データの件数"
              value={usage.d1 ? formatRowCounts(usage.d1.rows) : '取れません'}
            />
            <Row
              label="写真などのファイル (R2)"
              value={
                usage.r2
                  ? `${usage.r2.count.toLocaleString('ja-JP')}${usage.r2.truncated ? '+' : ''} 個・${formatBytes(usage.r2.bytes)}（無料枠 ${formatBytes(R2_FREE_BYTES)} の ${percentOf(usage.r2.bytes, R2_FREE_BYTES)}%）`
                  : photosReady
                    ? '取れません'
                    : '未設定'
              }
            />
          </Stack>
          <Text size="xs" c="dimmed">
            建築予定地は候補の業者の施工エリアと照合する市区町村で、変わらないためここでは変えられません。
            使用量はこのページを開いたときに数えます。1 日あたりの読み書き回数やリクエスト数は
            Cloudflare のダッシュボードで確認できます
          </Text>
        </Stack>
      </Card>

      <Card withBorder padding="md">
        <Stack gap="sm">
          <Title order={2}>アプリについて</Title>
          <Text size="sm" c="dimmed">
            機能や見た目の変更は変更履歴にまとめています。
          </Text>
          <Button
            renderRoot={(rootProps) => <Link {...rootProps} to="/changelog" />}
            variant="default"
          >
            変更履歴を見る
          </Button>
        </Stack>
      </Card>
      <Divider label="管理（取得やメンテナンス。ふだんは触らない）" labelPosition="left" mt="sm" />

      <Card withBorder padding="md">
        <Stack gap="sm">
          <Title order={2}>お知らせ</Title>
          {newsSources.length === 0 ? (
            <Text size="sm" c="dimmed">
              お知らせ URL を設定した業者がありません。候補の編集からお知らせの URL
              を登録してください。
            </Text>
          ) : (
            <Stack gap="xs">
              {newsSources.map((v) => {
                const errorDesc = v.newsFetchError ? describeFetchError(v.newsFetchError) : null
                return (
                  <Stack key={v.id} gap={2}>
                    <Group justify="space-between" wrap="nowrap">
                      <Text fw={600}>{v.name}</Text>
                      <Badge variant="light" color={v.newsFetchError ? 'red' : undefined}>
                        {v.newsSource ? NEWS_SOURCE_LABEL[v.newsSource] : '方式未設定'}
                      </Badge>
                    </Group>
                    {v.newsUrl ? (
                      <Text
                        size="xs"
                        c="dimmed"
                        title={v.newsUrl}
                        style={{ wordBreak: 'break-all' }}
                      >
                        {truncateForDisplay(v.newsUrl)}
                      </Text>
                    ) : null}
                    <Text size="xs" c="dimmed">
                      最終取得: {v.newsFetchedAt ? formatJst(v.newsFetchedAt) : '未取得'}
                    </Text>
                    {errorDesc ? (
                      <Stack gap={0}>
                        <Text size="xs" c="red">
                          {errorDesc.label}
                        </Text>
                        {errorDesc.hint ? (
                          <Text size="xs" c="dimmed">
                            {errorDesc.hint}
                          </Text>
                        ) : null}
                      </Stack>
                    ) : null}
                  </Stack>
                )
              })}
            </Stack>
          )}
          <Group justify="flex-end" gap="xs">
            <Button variant="default" onClick={handleReparseNews} loading={reparsingNews}>
              日程を再解析
            </Button>
            <Button onClick={handleFetchNews} loading={fetchingNews}>
              今すぐ取得
            </Button>
          </Group>
        </Stack>
      </Card>

      <MailImportCard
        inboxAddress={mail.inboxAddress}
        unassigned={mail.unassigned}
        recent={mail.recent}
        vendors={vendorOptions}
      />

      <Card withBorder padding="md">
        <Stack gap="sm">
          <Title order={2}>候補のサイトアイコン</Title>
          <Text size="sm" c="dimmed">
            公式サイトの URL が設定された業者の一覧（候補の名前の前に出すアイコン）。
          </Text>
          {faviconVendors.length === 0 ? (
            <Text size="sm" c="dimmed">
              公式サイトの URL を設定した業者がありません。
            </Text>
          ) : (
            <Stack gap="xs">
              {faviconVendors.map((v) => {
                // ファビコンの自動取得自体は成否しか記録しない（HTTP ステータスつきの理由を
                // 持つ列が無い）ため、同じお知らせ取得結果（newsFetchError）を手がかりに
                // 「Cloudflare を拒否するサーバー」かどうかを判定する（design 背景: 両方とも
                // 同じサーバー側の拒否が原因であることが多い）。未取得のときだけ意味がある。
                // news_url と website_url が別ホストだと単なる推測になるため、同じホストの
                // ときだけこのヒントを見せる（PR #12 レビュー指摘。sameHost は
                // src/lib/news/url.ts）。別ホスト・お知らせ URL 未設定なら null のままにして、
                // Badge の「未取得」（中立表示）だけを見せる
                const blocked =
                  v.faviconKey === null && v.newsFetchError && sameHost(v.newsUrl, v.websiteUrl)
                    ? describeFetchError(v.newsFetchError)
                    : null
                return (
                  <Stack key={v.id} gap={2}>
                    <Group justify="space-between" wrap="nowrap" gap="xs">
                      <Group gap={8} wrap="nowrap">
                        <Avatar
                          src={v.faviconKey ? photoUrl(v.faviconKey) : null}
                          size={20}
                          radius="xs"
                          color="gray"
                          alt=""
                        >
                          {v.name.charAt(0)}
                        </Avatar>
                        <Text size="sm" lineClamp={1}>
                          {v.name}
                        </Text>
                      </Group>
                      <Badge variant="light" color={v.faviconKey ? 'teal' : 'gray'}>
                        {v.faviconKey ? '取得済み' : '未取得'}
                      </Badge>
                    </Group>
                    {blocked?.hint ? (
                      <Text size="xs" c="dimmed">
                        {blocked.label}。このサイトはアイコンを自動取得できません。業者フォームの
                        「サイトのアイコン」から手動でアップロードしてください
                      </Text>
                    ) : null}
                  </Stack>
                )
              })}
            </Stack>
          )}
          <Group justify="flex-end" gap="xs">
            <Button
              variant="default"
              onClick={() => handleFetchFavicons(true)}
              loading={fetchingFavicons}
            >
              取り直す
            </Button>
            <Button onClick={() => handleFetchFavicons(false)} loading={fetchingFavicons}>
              アイコンを取得
            </Button>
          </Group>
        </Stack>
      </Card>
    </PageShell>
  )
}
