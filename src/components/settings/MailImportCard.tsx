import {
  Badge,
  Button,
  Card,
  Code,
  Group,
  Select,
  Spoiler,
  Stack,
  Text,
  Title,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'

import { INBOUND_STATUS_LABEL, type InboundMail } from '../../db/schema'
import { extractErrorMessage } from '../../lib/formError'
import { formatJst } from '../../lib/jst'
import { assignMail, deleteMail } from '../../server/mails'

const STATUS_COLOR: Record<InboundMail['status'], string> = {
  imported: 'teal',
  unassigned: 'yellow',
  rejected: 'red',
  system: 'gray',
}

/** 設定ページの「メール取込」（設計 2026-09-19 §5） */
export function MailImportCard({
  inboxAddress,
  unassigned,
  recent,
  vendors,
}: {
  /** 転送先アドレス（secret MAIL_INBOX_ADDRESS）。未設定なら null */
  inboxAddress: string | null
  unassigned: InboundMail[]
  recent: InboundMail[]
  vendors: { id: string; name: string }[]
}) {
  const router = useRouter()
  const assign = useServerFn(assignMail)
  const remove = useServerFn(deleteMail)
  const [choice, setChoice] = useState<Record<string, string | null>>({})
  // `<mailId>:assign` / `<mailId>:delete`。押したボタンだけを回すため、行 id だけでは足りない
  const [busy, setBusy] = useState<string | null>(null)

  async function run(key: string, action: () => Promise<unknown>, done: string) {
    setBusy(key)
    try {
      await action()
      await router.invalidate()
      notifications.show({ message: done })
    } catch (error) {
      notifications.show({ message: extractErrorMessage(error), color: 'red' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card withBorder padding="md">
      <Stack gap="sm">
        <Title order={2}>メール取込</Title>
        <Text size="sm">
          転送先:{' '}
          {inboxAddress ? <Code>{inboxAddress}</Code> : '未設定（secret MAIL_INBOX_ADDRESS）'}
        </Text>
        <Text size="xs" c="dimmed">
          Gmail の「転送先アドレス」にこの宛先を追加し、確認コードは下の受信ログ（システム）で読む。
          フィルタで業者の差出人ドメインを転送すると、業者の「メールの差出人ドメイン」に一致したものが
          お知らせに入る。
        </Text>

        <Title order={3}>未割当 {unassigned.length} 件</Title>
        {unassigned.length === 0 ? (
          <Text size="sm" c="dimmed">
            業者に紐づかなかったメールはありません。
          </Text>
        ) : (
          <Stack gap="xs">
            {unassigned.map((m) => (
              <Stack key={m.id} gap={4}>
                <Text size="xs" c="dimmed">
                  {formatJst(m.receivedAt)} · {m.fromAddress}
                </Text>
                <Text size="sm" fw={600}>
                  {m.subject || '（件名なし）'}
                </Text>
                {m.bodyText ? (
                  <Text size="xs" c="dimmed" lineClamp={2}>
                    {m.bodyText.slice(0, 100)}
                  </Text>
                ) : null}
                <Group gap="xs" wrap="nowrap">
                  <Select
                    size="xs"
                    placeholder="業者を選ぶ"
                    data={vendors.map((v) => ({ value: v.id, label: v.name }))}
                    value={choice[m.id] ?? null}
                    onChange={(v) => setChoice((c) => ({ ...c, [m.id]: v }))}
                    searchable
                    style={{ flex: 1 }}
                  />
                  <Button
                    size="xs"
                    disabled={!choice[m.id] || busy === `${m.id}:delete`}
                    loading={busy === `${m.id}:assign`}
                    onClick={() =>
                      run(
                        `${m.id}:assign`,
                        () => assign({ data: { mailId: m.id, vendorId: choice[m.id]! } }),
                        'お知らせに取り込みました',
                      )
                    }
                  >
                    取り込む
                  </Button>
                  <Button
                    size="xs"
                    variant="subtle"
                    color="red"
                    disabled={busy === `${m.id}:assign`}
                    loading={busy === `${m.id}:delete`}
                    onClick={() =>
                      run(`${m.id}:delete`, () => remove({ data: { id: m.id } }), '削除しました')
                    }
                  >
                    削除
                  </Button>
                </Group>
              </Stack>
            ))}
          </Stack>
        )}

        <Title order={3}>直近の受信</Title>
        {recent.length === 0 ? (
          <Text size="sm" c="dimmed">
            まだ受信していません。
          </Text>
        ) : (
          <Stack gap={6}>
            {recent.map((m) => (
              <Stack key={m.id} gap={2}>
                <Group gap="xs" wrap="nowrap">
                  <Badge size="xs" color={STATUS_COLOR[m.status]} variant="light">
                    {INBOUND_STATUS_LABEL[m.status]}
                  </Badge>
                  <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                    {formatJst(m.receivedAt)}
                  </Text>
                  <Text size="xs" lineClamp={1} style={{ minWidth: 0 }}>
                    {m.fromAddress} · {m.subject || '（件名なし）'}
                  </Text>
                </Group>
                {m.status === 'system' && m.bodyText ? (
                  <Spoiler maxHeight={0} showLabel="本文を見る" hideLabel="閉じる">
                    <Text size="xs" style={{ whiteSpace: 'pre-wrap' }}>
                      {m.bodyText}
                    </Text>
                  </Spoiler>
                ) : null}
              </Stack>
            ))}
          </Stack>
        )}
      </Stack>
    </Card>
  )
}
