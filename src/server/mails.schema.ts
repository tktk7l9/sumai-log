import { z } from 'zod'

import { idField } from './zod'

export const assignMailInput = z.object({ mailId: idField, vendorId: idField })
export const mailIdInput = z.object({ id: idField })
