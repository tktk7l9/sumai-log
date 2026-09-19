import { isNotNull } from 'drizzle-orm'
import PostalMime from 'postal-mime'

import type { Db } from '../db/client'
import { vendors } from '../db/schema'
import { toJstDateKey } from '../lib/jst'
import { splitForwardedBlock } from '../lib/mail/forwarded'
import { domainOf, matchVendorByDomain } from '../lib/mail/match'
import { extractBody, toParsedMail } from '../lib/mail/parse'
import { classifyRoute } from '../lib/mail/route'
import { MAX_INPUT_LENGTH } from '../lib/news/text'
import { importMailAsNews, insertInboundMail, reviveRejectedInboundMail } from './repository/mails'

/** ForwardableEmailMessage のうち使う部分（テストは素のオブジェクトで渡す） */
export type InboundMessage = {
  from: string
  to: string
  rawSize: number
  raw: ReadableStream<Uint8Array> | string | Uint8Array
  setReject(reason: string): void
}

export type HandleResult = {
  status: 'imported' | 'unassigned' | 'rejected' | 'system' | 'duplicate' | 'too-large'
  fromDomain: string | null
  subject: string
}

/**
 * news@ に届いた 1 通を処理する（設計 2026-09-19 §3）。
 * 読む → 経路判定 → inbound_mails に記録 → 業者が決まれば vendor_news へ。
 * 例外は呼び出し側（server.ts）でログにする。ctx.waitUntil は使わない。
 *
 * 信頼モデル（src/lib/mail/route.ts 参照）: 認可は `message.from`（Cloudflare Email Routing が
 * 渡すエンベロープ送信者）だけで行う。ヘッダ（`From:` / `X-Forwarded-For`）はメール本文の
 * 一部で偽装できるため、`classifyRoute` の第三引数として渡すだけで認可には使わない。
 * Email Routing は送信ドメインの DMARC ポリシーに従って認証失敗メールを拒否するので、
 * `google.com`（p=reject）を騙る system 経路は保護されるが、`gmail.com` は p=none のため
 * エンベロープ送信者の偽装は Routing を通り得る。ヘッダより強い判定だが完全ではない
 * （緩和策は転送先アドレスを推測できない secret にすること。SPF/ARC ヘッダ検証は follow-up）。
 *
 * この「誰でも送れる」前提があるので、**本文のテキスト化（重い）は経路が受理されてから**
 * 行う: 拒否するメールでは extractBody を呼ばない（HTML → テキストは入力サイズに比例する）。
 *
 * auto/manual 経路は常に status: 'unassigned' で記録し、業者が決まったときだけ
 * importMailAsNews に imported へ上げさせる（お知らせ化に失敗しても行は unassigned の
 * ままなので、設定ページから再取込できる。imported かつ newsId が無い、という
 * 中途半端な状態を作らない）。
 *
 * Gmail の自動転送は元メールの Message-ID をそのまま使うため、本人以外から news@ に
 * 直接届いて reject された行と、後日正しく転送されてきた同じメールは message_id が
 * 衝突する。素直に重複扱いすると reject された内容（本文なし）のまま取り戻せなくなる
 * ので、reject 済みの行だけは reviveRejectedInboundMail で新しい内容に上書きしてから
 * 続ける（それ以外の既存 status は普通に duplicate）。
 */
export async function handleInboundMail(
  message: InboundMessage,
  db: Db,
  allowlist: readonly string[],
  nowIso: string = new Date().toISOString(),
): Promise<HandleResult> {
  if (message.rawSize > MAX_INPUT_LENGTH) {
    message.setReject('too large')
    return { status: 'too-large', fromDomain: domainOf(message.from), subject: '' }
  }

  const email = await PostalMime.parse(message.raw)
  const parsed = await toParsedMail(email)
  const route = classifyRoute(parsed, allowlist, message.from)
  const receivedOn = toJstDateKey(nowIso)

  if (route.kind === 'rejected') {
    // setReject は常に呼ぶ（配信自体が許可されていないため）。記録が重複していても
    // 拒否の通知そのものは毎回返す。
    message.setReject(route.reason)
    const { created } = await insertInboundMail(db, {
      messageId: parsed.messageId,
      receivedAt: nowIso,
      fromAddress: parsed.from,
      forwardedBy: null,
      subject: parsed.subject,
      sentOn: parsed.date ? toJstDateKey(parsed.date) : null,
      bodyText: null,
      bodyTruncated: false,
      status: 'rejected',
      rejectReason: route.reason,
      vendorId: null,
      newsId: null,
    })
    return {
      status: created ? 'rejected' : 'duplicate',
      fromDomain: domainOf(parsed.from),
      subject: parsed.subject,
    }
  }

  // ここから先は受理済みの経路だけ。本文のテキスト化はこの位置より後でしか行わない
  // （拒否されるメールで重い変換を走らせない。関数コメントの信頼モデル参照）。
  const body = extractBody(email)

  if (route.kind === 'system') {
    const { created } = await insertInboundMail(db, {
      messageId: parsed.messageId,
      receivedAt: nowIso,
      fromAddress: parsed.from,
      forwardedBy: null,
      subject: parsed.subject,
      sentOn: parsed.date ? toJstDateKey(parsed.date) : null,
      bodyText: body.text,
      bodyTruncated: body.truncated,
      status: 'system',
      rejectReason: null,
      vendorId: null,
      newsId: null,
    })
    return {
      status: created ? 'system' : 'duplicate',
      fromDomain: domainOf(parsed.from),
      subject: parsed.subject,
    }
  }

  // 手動転送は転送ブロックの中身が「元のメール」
  let fromAddress = parsed.from
  let subject = parsed.subject
  let sentOn = parsed.date ? toJstDateKey(parsed.date) : null
  let bodyText = body.text
  if (route.kind === 'manual') {
    const block = splitForwardedBlock(body.text)
    if (block) {
      fromAddress = block.from ?? fromAddress
      subject = block.subject ?? subject
      sentOn = block.date ?? sentOn
      bodyText = block.body
    }
  }

  const candidates = await db
    .select({ id: vendors.id, newsEmailDomain: vendors.newsEmailDomain })
    .from(vendors)
    .where(isNotNull(vendors.newsEmailDomain))
  const vendor = matchVendorByDomain(fromAddress, candidates)

  // 常に unassigned で入れる。imported へ上げる・newsId を付けるのは importMailAsNews だけ
  // （途中で失敗しても行は unassigned のまま残り、設定ページから再取込できる）。
  const row = {
    messageId: parsed.messageId,
    receivedAt: nowIso,
    fromAddress,
    forwardedBy: route.forwardedBy,
    subject,
    sentOn,
    bodyText,
    bodyTruncated: body.truncated,
    status: 'unassigned' as const,
    rejectReason: null,
    vendorId: vendor?.id ?? null,
    newsId: null,
  }
  const { id, created, existingStatus } = await insertInboundMail(db, row)
  const fromDomain = domainOf(fromAddress)

  if (!created) {
    if (existingStatus === 'rejected') {
      // 本人以外から直接届いて reject された行を、後から届いた正しい転送で生き返らせる
      await reviveRejectedInboundMail(db, id, row)
    } else {
      return { status: 'duplicate', fromDomain, subject }
    }
  }

  if (!vendor) return { status: 'unassigned', fromDomain, subject }
  await importMailAsNews(db, id, vendor.id, receivedOn)
  return { status: 'imported', fromDomain, subject }
}
