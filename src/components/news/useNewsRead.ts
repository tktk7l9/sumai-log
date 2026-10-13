import { notifications } from '@mantine/notifications'
import { useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'

import { isMailNews } from '../../lib/mail/toNews'
import { markNewsRead } from '../../server/news'
import type { NewsEventRow } from '../../server/repository'

/**
 * The read flag of a newsletter (vendor news whose url is mail:). One flag shared by the two
 * users, like the watched flag of the videos. `setRead` writes it and refreshes the loaders;
 * `openRead` is what a tap on a row calls: opening an unread newsletter counts as reading
 * it (a mail client's rule), and 「未読に戻す」 (Mark unread) in the drawer takes it back
 */
export function useNewsRead() {
  const router = useRouter()
  const mark = useServerFn(markNewsRead)

  async function setRead(news: NewsEventRow, read: boolean) {
    try {
      await mark({ data: { id: news.id, read } })
      await router.invalidate()
    } catch {
      notifications.show({ message: '保存できませんでした', color: 'red' })
    }
  }

  function openRead(news: NewsEventRow) {
    if (isMailNews(news.url) && news.readAt === null) void setRead(news, true)
  }

  return { setRead, openRead }
}
