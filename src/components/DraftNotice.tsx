import { Button, Group, Text } from '@mantine/core'
import { History } from 'lucide-react'

/** 「下書きを復元しました」と、捨てるためのボタン（useFormDraft の restored の間だけ出す） */
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
 * 相手が先に保存していたときの知らせ（notifications で出す文面）。フォームは画面を読み直す
 * （router.invalidate）ので、閉じれば相手の内容が見え、開き直すと自分の下書きが戻る
 */
export const CONFLICT_MESSAGE =
  '相手が先にこの内容を保存していたので、上書きしませんでした。閉じると相手の内容を確かめられます（いまの入力は下書きに残り、開き直すと戻ります）。このまま保存し直すと、あなたの入力で上書きします。'
