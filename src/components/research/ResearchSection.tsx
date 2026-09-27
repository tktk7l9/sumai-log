import { Anchor, Card, Stack, Text, Title } from '@mantine/core'
import { ExternalLink } from 'lucide-react'

import { formatDateSlash } from '../../lib/calendar'
import { presentFacts, type VendorResearch } from '../../lib/research'
import { Row } from '../candidates/DetailRow'

/**
 * "調査メモ" (Research memo) of the vendor detail. Shows the one-line summary, facts (the
 * same items as the comparison table), reading sections and sources, in this order.
 * The body keeps its line breaks as is (pre-wrap, same as features).
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
