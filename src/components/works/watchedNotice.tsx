import { Button, Group, Text } from '@mantine/core'
import { notifications } from '@mantine/notifications'

/** How long 「視聴済みにしました／取り消す」 stays */
const UNDO_NOTICE_MS = 10_000

/**
 * Says that something was marked as watched, with no confirm dialog before it, and offers the
 * undo (SHIG 57, 54). Shared by the works and the channel videos on /works.
 */
export function showWatchedNotice(key: string, undo: () => void) {
  const notificationId = `watched-${key}`
  notifications.show({
    id: notificationId,
    // Longer than the 4 s default: the mark often happens while a video is still on screen
    autoClose: UNDO_NOTICE_MS,
    message: (
      <Group justify="space-between" wrap="nowrap" gap="sm">
        <Text size="sm">視聴済みにしました</Text>
        <Button
          variant="subtle"
          size="sm"
          onClick={() => {
            notifications.hide(notificationId)
            undo()
          }}
        >
          取り消す
        </Button>
      </Group>
    ),
  })
}
