import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Stack,
  TagsInput,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'

import { ColorSchemeSetting } from '../components/ColorSchemeSetting'
import { MemberChip } from '../components/MemberChip'
import { PageShell } from '../components/PageShell'
import { Row } from '../components/candidates/DetailRow'
import { NEWS_SOURCE_LABEL } from '../db/schema'
import { extractErrorMessage } from '../lib/formError'
import { formatJst } from '../lib/jst'
import { fetchNewsNow, newsSources as loadNewsSources } from '../server/news'
import { getSettings, saveHomeAreas } from '../server/settings'
import { listTagNames, saveTags } from '../server/tags'

/** 「業者のお知らせ」カードで取得 URL を短く見せる（全文は title 属性で見られる）。 */
const NEWS_URL_DISPLAY_MAX = 40
function truncateForDisplay(url: string): string {
  return url.length > NEWS_URL_DISPLAY_MAX ? `${url.slice(0, NEWS_URL_DISPLAY_MAX)}…` : url
}

export const Route = createFileRoute('/settings')({
  component: Page,
  loader: async () => {
    const [settings, tags, news] = await Promise.all([
      getSettings(),
      listTagNames(),
      loadNewsSources(),
    ])
    return { ...settings, tags, newsSources: news.sources }
  },
})

function Page() {
  const { homeAreas, actorEmail, members, environment, photosReady, tags, newsSources } =
    Route.useLoaderData()
  const router = useRouter()
  const save = useServerFn(saveHomeAreas)
  const saveTagsFn = useServerFn(saveTags)
  const fetchNewsNowFn = useServerFn(fetchNewsNow)
  const [saving, setSaving] = useState(false)
  const [tagValues, setTagValues] = useState<string[]>(tags)
  const [savingTags, setSavingTags] = useState(false)
  const [fetchingNews, setFetchingNews] = useState(false)
  const form = useForm({ initialValues: { areas: homeAreas.join('、') } })

  async function submit(values: { areas: string }) {
    setSaving(true)
    try {
      const { areas } = await save({ data: { areas: values.areas } })
      await router.invalidate()
      notifications.show({ message: `照合に使う市区町村: ${areas.join('、') || 'なし'}` })
    } catch {
      notifications.show({ message: '保存できませんでした', color: 'red' })
    } finally {
      setSaving(false)
    }
  }

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

  return (
    <PageShell title="設定">
      <Card withBorder padding="md">
        <Stack gap="sm">
          <Title order={2}>表示</Title>
          <ColorSchemeSetting />
        </Stack>
      </Card>

      <Card withBorder padding="md">
        <Stack gap="sm">
          <Title order={2}>建築予定地</Title>
          <Text size="sm" c="dimmed">
            候補の業者の施工エリアと照合する市区町村。読点かカンマで区切って複数入れられます。
          </Text>
          <form onSubmit={form.onSubmit(submit)}>
            <Stack gap="sm">
              <TextInput
                label="市区町村"
                placeholder="例: テスト市、架空町"
                {...form.getInputProps('areas')}
              />
              <Group justify="flex-end">
                <Button type="submit" loading={saving}>
                  保存
                </Button>
              </Group>
            </Stack>
          </form>
        </Stack>
      </Card>

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
          <Title order={2}>業者のお知らせ</Title>
          {newsSources.length === 0 ? (
            <Text size="sm" c="dimmed">
              お知らせ URL を設定した業者がありません。候補の編集からお知らせの URL
              を登録してください。
            </Text>
          ) : (
            <Stack gap="xs">
              {newsSources.map((v) => (
                <Stack key={v.id} gap={2}>
                  <Group justify="space-between" wrap="nowrap">
                    <Text fw={600}>{v.name}</Text>
                    <Badge variant="light" color={v.newsFetchError ? 'red' : undefined}>
                      {v.newsSource ? NEWS_SOURCE_LABEL[v.newsSource] : '方式未設定'}
                    </Badge>
                  </Group>
                  {v.newsUrl ? (
                    <Text size="xs" c="dimmed" title={v.newsUrl} style={{ wordBreak: 'break-all' }}>
                      {truncateForDisplay(v.newsUrl)}
                    </Text>
                  ) : null}
                  <Text size="xs" c="dimmed">
                    最終取得: {v.newsFetchedAt ? formatJst(v.newsFetchedAt) : '未取得'}
                  </Text>
                  {v.newsFetchError ? (
                    <Text size="xs" c="red">
                      {v.newsFetchError}
                    </Text>
                  ) : null}
                </Stack>
              ))}
            </Stack>
          )}
          <Group justify="flex-end">
            <Button onClick={handleFetchNews} loading={fetchingNews}>
              今すぐ取得
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
                <Group key={m.email} justify="space-between">
                  <MemberChip email={m.email} members={members} />
                  {m.email === actorEmail ? <Badge variant="light">あなた</Badge> : null}
                </Group>
              ))}
            </Stack>
          )}
        </Stack>
      </Card>

      <Card withBorder padding="md">
        <Stack gap="sm">
          <Title order={2}>環境</Title>
          <Stack gap="xs">
            <Row label="環境" value={environment} />
            <Row label="写真の保管 (R2)" value={photosReady ? '有効' : '未設定'} />
          </Stack>
        </Stack>
      </Card>
    </PageShell>
  )
}
