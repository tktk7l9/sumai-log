import { Button, Divider, Stack, Text } from '@mantine/core'
import { Pencil, Trash2 } from 'lucide-react'

/**
 * The labelled "編集" (Edit) button for detail headers. A text label and a 36px target instead
 * of a bare 28px pencil icon (SHIG 31, 78)
 */
export function EditButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      variant="default"
      size="sm"
      leftSection={<Pencil size={16} aria-hidden />}
      onClick={onClick}
    >
      編集
    </Button>
  )
}

/**
 * The delete button of a detail page. It sits at the very bottom, away from "編集" (Edit)
 * in the header, so the two can never be mistaken for each other (SHIG 16, 13, 78). No confirm:
 * deletion is undoable from the notification (see undoableDelete.tsx)
 */
export function DeleteSection({
  label,
  onDelete,
  blockedReason,
}: {
  label: string
  onDelete: () => void
  /** When set, the deletion is not possible; say why instead of failing after the fact (SHIG 32, 15) */
  blockedReason?: string | null
}) {
  return (
    <Stack gap="md" mt="xl">
      <Divider />
      {blockedReason ? (
        <Text size="sm" c="dimmed">
          {blockedReason}
        </Text>
      ) : null}
      <Button
        disabled={Boolean(blockedReason)}
        variant="subtle"
        color="red"
        size="sm"
        leftSection={<Trash2 size={16} aria-hidden />}
        onClick={onDelete}
        style={{ alignSelf: 'flex-start' }}
      >
        {label}
      </Button>
    </Stack>
  )
}
