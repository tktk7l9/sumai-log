/**
 * Pre-size gate for upload routes, run before `request.formData()` buffers the body.
 * `Number(null)` is 0, so comparing the header directly lets a chunked request with no
 * Content-Length skip the gate. The app's own uploads send FormData, whose length the browser
 * always declares, so requiring the header costs them nothing.
 */
export type UploadLengthProblem = 'length-required' | 'too-large'

export const UPLOAD_LENGTH_REQUIRED_ERROR = '画像のサイズを確認できませんでした'

export function checkUploadLength(
  contentLength: string | null,
  maxBytes: number,
): UploadLengthProblem | null {
  if (contentLength === null || !/^\d+$/.test(contentLength.trim())) return 'length-required'
  return Number(contentLength) > maxBytes ? 'too-large' : null
}
