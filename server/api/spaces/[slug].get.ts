import { assertValidSlug, getBucket, listSpaceFiles, requireActiveSpace } from '../../utils/spaces'

export default defineEventHandler(async (event) => {
  const slug = assertValidSlug(event.context.params?.slug || '')
  const bucket = getBucket(event)
  const meta = await requireActiveSpace(bucket, slug)
  const files = await listSpaceFiles(bucket, slug)

  return {
    slug,
    createdAt: meta.createdAt,
    expiresAt: meta.expiresAt,
    files
  }
})
