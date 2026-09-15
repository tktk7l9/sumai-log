import { Alert, Badge, Button, Card, Group, Stack, Text, TextInput, Title } from '@mantine/core'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'

import { MemberChip } from '../components/MemberChip'
import { PageShell } from '../components/PageShell'
import { Row } from '../components/candidates/DetailRow'
import { getSettings, saveHomeAreas } from '../server/settings'

export const Route = createFileRoute('/settings')({
  component: Page,
  loader: () => getSettings(),
})

function Page() {
  const { homeAreas, actorEmail, members, environment, photosReady } = Route.useLoaderData()
  const router = useRouter()
  const save = useServerFn(saveHomeAreas)
  const [saving, setSaving] = useState(false)
  const form = useForm({ initialValues: { areas: homeAreas.join('、') } })

  async function submit(values: { areas: string }) {
    setSaving(true)
    try {
      const { areas } = await save({ data: { areas: values.areas } })
      await router.invalidate()
      notifications.show({ message: `照合に使う市区町村: ${areas.join('、') || 'なし'}` })
    } finally {
      setSaving(false)
    }
  }

  return (
    <PageShell title="設定">
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
