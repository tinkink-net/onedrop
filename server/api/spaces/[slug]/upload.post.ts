import { createError, getQuery, readBody } from 'h3'
import { assertValidSlug, getBucket, getFileObjectKey, requireActiveSpace, saveSpaceFileMeta } from '../../../utils/spaces'

export default defineEventHandler(async (event) => {
  const slug = assertValidSlug(event.context.params?.slug || '')
  const bucket = getBucket(event)

  await requireActiveSpace(bucket, slug)

  const query = getQuery(event)
  const action = query.action

  if (action === 'start') {
    const { name, type } = await readBody(event)
    const key = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const uploadedAt = new Date().toISOString()
    const objectKey = getFileObjectKey(slug, key)
    
    const multipart = await bucket.createMultipartUpload(objectKey, {
      httpMetadata: { contentType: type || 'application/octet-stream' },
      customMetadata: { name, uploadedAt }
    })
    
    return {
      ok: true,
      key,
      uploadId: multipart.uploadId,
      name,
      type,
      uploadedAt
    }
  }

  if (action === 'part') {
    const key = query.key as string
    const uploadId = query.uploadId as string
    const partNumber = parseInt(query.partNumber as string, 10)
    
    const formData = await readFormData(event)
    const chunk = formData.get('chunk')
    if (!(chunk instanceof File)) {
      throw createError({ statusCode: 400, statusMessage: 'Chunk is required.' })
    }
    
    const objectKey = getFileObjectKey(slug, key)
    const multipart = bucket.resumeMultipartUpload(objectKey, uploadId)
    const uploadedPart = await multipart.uploadPart(partNumber, await chunk.arrayBuffer())

    return {
      ok: true,
      partNumber: uploadedPart.partNumber,
      etag: uploadedPart.etag
    }
  }

  if (action === 'complete') {
    const { key, uploadId, parts, name, uploadedAt } = await readBody(event)
    const objectKey = getFileObjectKey(slug, key)
    
    const multipart = bucket.resumeMultipartUpload(objectKey, uploadId)
    try {
        await multipart.complete(parts)
    } catch (e: any) {
        await multipart.abort()
        throw createError({ statusCode: 500, statusMessage: 'Failed to complete multipart upload.' })
    }

    // Store metadata
    await saveSpaceFileMeta(bucket, slug, key, {
        name,
        uploadedAt
    })

    return {
        ok: true,
        key
    }
  }

  // legacy single-file fallback
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
