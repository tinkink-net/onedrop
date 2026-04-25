import { assertValidSlug, getBucket, listSpaceFiles, requireActiveSpace } from '../../utils/spaces'
import { getRequestHeader } from 'h3'

export default defineEventHandler(async (event) => {
  const slug = assertValidSlug(event.context.params?.slug || '')
  const bucket = getBucket(event)
  const meta = await requireActiveSpace(bucket, slug)
  const files = await listSpaceFiles(bucket, slug)

  const host = getRequestHeader(event, 'host')
  const protocol = host?.includes('localhost') ? 'http' : 'https'
  const origin = host ? `${protocol}://${host}` : 'https://0x1.one'

  return {
    slug,
    url: `${origin}/${slug}`,
    createdAt: meta.createdAt,
    expiresAt: meta.expiresAt,
    files
  }
})
