import { ActionIcon, Anchor, Avatar, Badge, Group, Menu, Stack, Text } from '@mantine/core'
import { Link } from '@tanstack/react-router'
import { MoreVertical } from 'lucide-react'

import type { Source } from '../../db/schema'
import { findAffiliation } from '../../lib/affiliations'

/**
 * 情報収集ページの 1 行。アバター（無ければ頭文字）・外部リンク・説明（2 行まで）・
 * バッジ（候補の会社／加盟団体）・「…」メニュー（編集／削除）。
 */
export function SourceRow({
  source,
  vendorName,
  onEdit,
  onDelete,
}: {
  source: Source
  vendorName: string | null
  onEdit: () => void
  onDelete: () => void
}) {
  const affiliation = source.affiliation ? findAffiliation(source.affiliation) : null
  const hasBadges = (source.vendorId && vendorName) || affiliation

  return (
    <Group wrap="nowrap" align="flex-start" gap="sm">
      <Avatar src={source.avatarUrl} size={40} radius="xl" color="gray" alt="">
        {source.name.charAt(0)}
      </Avatar>
      <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
        <Anchor
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          fw={600}
          lineClamp={1}
          underline="hover"
        >
          {source.name}
        </Anchor>
        {source.description ? (
          <Text size="sm" c="dimmed" lineClamp={2}>
            {source.description}
          </Text>
        ) : null}
        {hasBadges ? (
          <Group gap={6}>
            {source.vendorId && vendorName ? (
              <Link
                to="/candidates/vendors/$id"
                params={{ id: source.vendorId }}
                aria-label={`候補「${vendorName}」を見る`}
                style={{ textDecoration: 'none' }}
              >
                <Badge variant="light">候補</Badge>
              </Link>
            ) : null}
            {affiliation ? (
              <Link
                to="/glossary/$termId"
                params={{ termId: affiliation.glossaryId }}
                aria-label={`用語集で ${affiliation.name} を見る`}
                style={{ textDecoration: 'none' }}
              >
                <Badge variant="light">{affiliation.shortName}</Badge>
              </Link>
            ) : null}
          </Group>
        ) : null}
      </Stack>
      <Menu position="bottom-end" withinPortal>
        <Menu.Target>
          <ActionIcon variant="subtle" color="gray" aria-label={`${source.name} の操作`}>
            <MoreVertical size={18} aria-hidden />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item onClick={onEdit}>編集</Menu.Item>
          <Menu.Item color="red" onClick={onDelete}>
            削除
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </Group>
  )
}
