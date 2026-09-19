import { env } from 'cloudflare:workers'
import { createServerFn } from '@tanstack/react-start'

import { getDb } from '../db/client'
import { toJstDateKey } from '../lib/jst'
import { assignMailInput, mailIdInput } from './mails.schema'
import {
  deleteInboundMail,
  getInboundMailBody,
  importMailAsNews,
  listInboundMails,
} from './repository'

export { assignMailInput, mailIdInput }

const RECENT_LIMIT = 20
const UNASSIGNED_LIMIT = 200

/** 設定「メール取込」カード用 */
export const listMailImport = createServerFn().handler(async () => {
  const db = getDb()
  const [unassigned, recent] = await Promise.all([
    listInboundMails(db, { status: 'unassigned', limit: UNASSIGNED_LIMIT }),
    listInboundMails(db, { limit: RECENT_LIMIT }),
  ])
  return { inboxAddress: env.MAIL_INBOX_ADDRESS, unassigned, recent }
})

/** 未割当メールに業者を選んで取り込む */
export const assignMail = createServerFn({ method: 'POST' })
  .validator(assignMailInput)
  .handler(async ({ data }) => {
    return importMailAsNews(
      getDb(),
      data.mailId,
      data.vendorId,
      toJstDateKey(new Date().toISOString()),
    )
  })

export const deleteMail = createServerFn({ method: 'POST' })
  .validator(mailIdInput)
  .handler(async ({ data }) => {
    await deleteInboundMail(getDb(), data.id)
    return { ok: true as const }
  })

/** お知らせのドロワーでメール本文を表示する */
export const getMailBody = createServerFn()
  .validator(mailIdInput)
  .handler(async ({ data }) => ({ body: await getInboundMailBody(getDb(), data.id) }))
