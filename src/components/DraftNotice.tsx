import { Button, Group, Text } from '@mantine/core'
import { History } from 'lucide-react'

/**
 * The "draft restored" notice and a button to discard it (shown only while restored of useFormDraft
 * is set)
 */
export function DraftNotice({ onDiscard }: { onDiscard: () => void }) {
  return (
    <Group gap="xs" wrap="nowrap" className="draft-notice" role="status">
      <History size={16} aria-hidden style={{ flexShrink: 0 }} />
      <Text size="sm" style={{ flex: 1 }}>
        書きかけの下書きを戻しました
      </Text>
      <Button size="compact-sm" variant="subtle" color="gray" onClick={onDiscard}>
        破棄
      </Button>
    </Group>
  )
}

/**
 * The notice for when the partner saved first (the text shown through notifications). The
 * form reloads the screen (router.invalidate), so closing it shows the partner's content,
 * and reopening it brings back your own draft
 */
export const CONFLICT_MESSAGE =
  '相手が先にこの内容を保存していたので、上書きしませんでした。閉じると相手の内容を確かめられます（いまの入力は下書きに残り、開き直すと戻ります）。このまま保存し直すと、あなたの入力で上書きします。'
