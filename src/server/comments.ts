import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { getDb } from '../db/client'
import { COMMENT_TARGETS } from '../db/schema'
import { allMembers, currentActorEmail } from './members'
import { deleteOwnComment, insertComment, listComments } from './repository'
import { idField, idInput } from './zod'

const target = z.object({ targetType: z.enum(COMMENT_TARGETS), targetId: idField })

export const commentInput = target.extend({
  body: z.string().trim().min(1, '本文を入れてください').max(2000),
})

export const listCommentsFor = createServerFn()
  .validator(target)
  .handler(async ({ data }) => ({
    comments: await listComments(getDb(), data.targetType, data.targetId),
    me: await currentActorEmail(),
    members: allMembers(),
  }))

export const addComment = createServerFn({ method: 'POST' })
  .validator(commentInput)
  .handler(async ({ data }) => ({
    id: await insertComment(getDb(), data, await currentActorEmail()),
  }))

export const deleteComment = createServerFn({ method: 'POST' })
  .validator(idInput)
  .handler(async ({ data }) => ({
    ok: await deleteOwnComment(getDb(), data.id, await currentActorEmail()),
  }))
