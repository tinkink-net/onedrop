import { createError, setHeader } from 'h3'
import { assertValidFileKey, assertValidSlug, getBucket, getFileObjectKey, requireActiveSpace } from '../../../../utils/spaces'

export default defineEventHandler(async (event) => {
  const slug = assertValidSlug(event.context.params?.slug || '')
  const key = assertValidFileKey(event.context.params?.key || '')
  const bucket = getBucket(event)

  await requireActiveSpace(bucket, slug)

  const object = await bucket.get(getFileObjectKey(slug, key))
  if (!object) {
    throw createError({ statusCode: 404, statusMessage: 'File not found.' })
  }

  const filename = object.customMetadata?.name || key
  setHeader(event, 'Content-Type', object.httpMetadata?.contentType || 'application/octet-stream')
  setHeader(event, 'Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`)

  return object.body
})
