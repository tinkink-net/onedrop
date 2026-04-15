import { createError } from 'h3'
import { assertValidSlug, getBucket, getFileObjectKey, requireActiveSpace, sanitizeFilename } from '../../../utils/spaces'

export default defineEventHandler(async (event) => {
  const slug = assertValidSlug(event.context.params?.slug || '')
  const bucket = getBucket(event)

  await requireActiveSpace(bucket, slug)

  const formData = await event.request.formData()
  const file = formData.get('file')

  if (!(file instanceof File)) {
    throw createError({ statusCode: 400, statusMessage: 'A file is required.' })
  }

  const safeName = sanitizeFilename(file.name)
  const uniquePart = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const key = `${uniquePart}-${safeName}`

  await bucket.put(getFileObjectKey(slug, key), await file.arrayBuffer(), {
    httpMetadata: {
      contentType: file.type || 'application/octet-stream'
    },
    customMetadata: {
      name: file.name,
      uploadedAt: new Date().toISOString()
    }
  })

  return {
    ok: true,
    key
  }
})
