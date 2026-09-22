import { Anchor, Card, Stack, Text, Title } from '@mantine/core'
import { ExternalLink } from 'lucide-react'

import { formatDateSlash } from '../../lib/calendar'
import { presentFacts, type VendorResearch } from '../../lib/research'
import { Row } from '../candidates/DetailRow'

/**
 * 業者詳細の「調査メモ」。一言・事実（比較表と同じ項目）・読み物の節・出典を、この順で出す。
 * 本文は改行をそのまま活かす（pre-wrap。features と同じ）。
 */
export function ResearchSection({ research }: { research: VendorResearch }) {
  const facts = presentFacts(research)
  return (
    <Stack gap="sm">
      {research.summary ? <Text fw={600}>{research.summary}</Text> : null}
      {facts.length > 0 ? (
        <Card withBorder padding="md">
          <Stack gap="xs">
            {facts.map((f) => (
              <Row key={f.key} label={f.label} value={f.value} />
            ))}
          </Stack>
        </Card>
      ) : null}
      {research.sections.map((section, i) => (
        <Stack key={`${i}-${section.title}`} gap={4}>
          <Title order={3}>{section.title}</Title>
          <Text size="sm" style={{ whiteSpace: 'pre-wrap' }} className="breakable">
            {section.body}
          </Text>
        </Stack>
      ))}
      {research.sources.length > 0 ? (
        <Stack gap={4}>
          <Title order={3}>出典</Title>
          {research.sources.map((s, i) => (
            <Anchor
              key={`${i}-${s.url}`}
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              size="sm"
              className="breakable"
            >
              <ExternalLink size={14} aria-hidden /> {s.label}
            </Anchor>
          ))}
        </Stack>
      ) : null}
      <Text size="xs" c="dimmed">
        調査日: {formatDateSlash(research.researchedOn)}
        ・公式サイトや第三者サイトの記載をもとにした要約です。数値・条件は最新の公式情報で確認してください。
      </Text>
    </Stack>
  )
}
