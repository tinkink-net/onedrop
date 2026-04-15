import { createError } from 'h3'
import { assertValidSlug, getBucket, getFileObjectKey, requireActiveSpace, saveSpaceFileMeta } from '../../../utils/spaces'

export default defineEventHandler(async (event) => {
  const slug = assertValidSlug(event.context.params?.slug || '')
  const bucket = getBucket(event)

  await requireActiveSpace(bucket, slug)

  const formData = await readFormData(event)
  const file = formData.get('file')

  if (!(file instanceof File)) {
    throw createError({ statusCode: 400, statusMessage: 'A file is required.' })
  }

  const key = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const uploadedAt = new Date().toISOString()

  await bucket.put(getFileObjectKey(slug, key), await file.arrayBuffer(), {
    httpMetadata: {
      contentType: file.type || 'application/octet-stream'
    },
    customMetadata: {
      name: file.name,
      uploadedAt
    }
  })

  await saveSpaceFileMeta(bucket, slug, key, {
    name: file.name,
    uploadedAt
  })

  return {
    ok: true,
    key
  }
})
