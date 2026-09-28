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

/** For the "メール取込" (Mail import) card in settings */
export const listMailImport = createServerFn().handler(async () => {
  const db = getDb()
  const [unassigned, recent] = await Promise.all([
    listInboundMails(db, { status: 'unassigned', limit: UNASSIGNED_LIMIT }),
    listInboundMails(db, { limit: RECENT_LIMIT }),
  ])
  // The forwarding address is a secret (design §7). When unset, return null and the screen
  // shows "未設定" (Not set)
  return { inboxAddress: env.MAIL_INBOX_ADDRESS || null, unassigned, recent }
})

/** Imports an unassigned mail after a vendor is chosen for it */
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

/** Shows the mail body in the vendor news drawer */
export const getMailBody = createServerFn()
  .validator(mailIdInput)
  .handler(async ({ data }) => ({ body: await getInboundMailBody(getDb(), data.id) }))
