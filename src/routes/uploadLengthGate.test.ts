import { afterEach, describe, expect, it, vi } from 'vitest'

import { Route as PhotosRoute } from './api.photos.$'
import { Route as VendorFaviconRoute } from './api.vendor-favicon.$vendorId'
import { Route as VendorPhotosRoute } from './api.vendor-photos.$vendorId'

vi.mock('../db/client', () => ({ getDb: vi.fn() }))
vi.mock('../server/members', () => ({ currentActorEmail: vi.fn() }))
vi.mock('../server/repository', () => ({ insertPhoto: vi.fn() }))
vi.mock('../server/storage', () => ({
  cleanupFailedUpload: vi.fn(),
  deletePhotoObjects: vi.fn(),
  getPhotosBucket: vi.fn(),
}))
vi.mock('../server/vendorImagesFetcher', () => ({
  FAVICON_UPLOAD_MAX_BYTES: 1024,
  FAVICON_UPLOAD_TOO_LARGE_ERROR: 'too large',
  FAVICON_UPLOAD_WRONG_TYPE_ERROR: 'wrong type',
  VENDOR_NOT_FOUND_ERROR: 'not found',
  uploadVendorFaviconCore: vi.fn(),
}))

type Post = (ctx: { request: Request; params: Record<string, string> }) => Promise<Response>

function postHandler(route: unknown): Post {
  return (route as { options: { server: { handlers: { POST: Post } } } }).options.server.handlers
    .POST
}

const VENDOR_ID = '11111111-1111-4111-8111-111111111111'

const ROUTES = [
  ['/api/photos', postHandler(PhotosRoute), { _splat: '' }],
  ['/api/vendor-photos', postHandler(VendorPhotosRoute), { vendorId: VENDOR_ID }],
  ['/api/vendor-favicon', postHandler(VendorFaviconRoute), { vendorId: VENDOR_ID }],
] as const

/** A Request whose body must stay unread: the gate has to answer before formData(). */
function uploadRequest(headers: Record<string, string>) {
  const request = new Request('https://example.test/upload', { method: 'POST', headers })
  const formData = vi.spyOn(request, 'formData')
  return { request, formData }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe.each(ROUTES)('POST %s size gate', (_path, post, params) => {
  it('answers 411 without reading the body when Content-Length is missing', async () => {
    const { request, formData } = uploadRequest({})
    const res = await post({ request, params })
    expect(res.status).toBe(411)
    expect(formData).not.toHaveBeenCalled()
  })

  it('answers 413 without reading the body when the declared size is over the limit', async () => {
    const { request, formData } = uploadRequest({ 'content-length': String(100 * 1024 * 1024) })
    const res = await post({ request, params })
    expect(res.status).toBe(413)
    expect(formData).not.toHaveBeenCalled()
  })
})
