import { createError, getRequestHeader, readBody } from 'h3'
import { generateSlug, getBucket, getSpaceMeta, saveSpaceMeta } from '../../utils/spaces'

const MAX_HOURS = 24
const DEFAULT_HOURS = 3

export default defineEventHandler(async (event) => {
  const body = await readBody<{ expiresInHours?: number }>(event)
  const requestedHours = Number(body?.expiresInHours ?? DEFAULT_HOURS)
  const expiresInHours = Number.isFinite(requestedHours) ? Math.min(MAX_HOURS, Math.max(1, Math.floor(requestedHours))) : DEFAULT_HOURS

  const bucket = getBucket(event)

  let slug = ''
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = generateSlug()
    const existing = await getSpaceMeta(bucket, candidate)
    if (!existing) {
      slug = candidate
      break
    }
  }

  if (!slug) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to generate a unique share code.' })
  }

  const now = Date.now()
  const expiresAt = now + expiresInHours * 60 * 60 * 1000

  await saveSpaceMeta(bucket, {
    slug,
    createdAt: now,
    expiresAt
  })

  const host = getRequestHeader(event, 'host')
  const protocol = host?.includes('localhost') ? 'http' : 'https'
  const origin = host ? `${protocol}://${host}` : 'https://0x1.one'

  return {
    slug,
    url: `${origin}/${slug}`,
    createdAt: now,
    expiresAt,
    expiresInHours
  }
})
