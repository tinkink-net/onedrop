import { createError } from 'h3'

const SLUG_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const SLUG_REGEX = /^[A-HJ-NP-Z2-9]{6}$/

type SpaceMeta = {
  slug: string
  createdAt: number
  expiresAt: number
}

type SpaceFile = {
  key: string
  name: string
  size: number
  uploadedAt?: string
}

export function normalizeSlug(value: string) {
  return value.trim().toUpperCase()
}

export function assertValidSlug(value: string) {
  const slug = normalizeSlug(value)
  if (!SLUG_REGEX.test(slug)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid space slug.' })
  }

  return slug
}

export function sanitizeFilename(name: string) {
  return name.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120) || 'file'
}

export function generateSlug() {
  let slug = ''
  for (let i = 0; i < 6; i++) {
    slug += SLUG_CHARS[Math.floor(Math.random() * SLUG_CHARS.length)]
  }
  return slug
}

export function getBucket(event: any) {
  const bucket = event.context.cloudflare?.env?.ONEDROP_BUCKET ?? globalThis.ONEDROP_BUCKET
  if (!bucket) {
    throw createError({ statusCode: 500, statusMessage: 'R2 bucket binding ONEDROP_BUCKET is not configured.' })
  }
  return bucket
}

function metaKey(slug: string) {
  return `spaces/${slug}/meta.json`
}

function filesPrefix(slug: string) {
  return `spaces/${slug}/files/`
}

export async function getSpaceMeta(bucket: any, slug: string): Promise<SpaceMeta | null> {
  const object = await bucket.get(metaKey(slug))
  if (!object) {
    return null
  }

  const text = await object.text()
  return JSON.parse(text)
}

export async function saveSpaceMeta(bucket: any, meta: SpaceMeta) {
  await bucket.put(metaKey(meta.slug), JSON.stringify(meta), {
    httpMetadata: {
      contentType: 'application/json'
    }
  })
}

export async function requireActiveSpace(bucket: any, slug: string) {
  const meta = await getSpaceMeta(bucket, slug)

  if (!meta) {
    throw createError({ statusCode: 404, statusMessage: 'Space not found.' })
  }

  if (meta.expiresAt <= Date.now()) {
    throw createError({ statusCode: 410, statusMessage: 'Space has expired.' })
  }

  return meta
}

export async function listSpaceFiles(bucket: any, slug: string): Promise<SpaceFile[]> {
  const prefix = filesPrefix(slug)
  const listed = await bucket.list({ prefix })

  return listed.objects.map((item: any) => ({
    key: item.key.slice(prefix.length),
    name: item.customMetadata?.name || item.key.slice(prefix.length),
    size: item.size,
    uploadedAt: item.customMetadata?.uploadedAt
  }))
}

export function getFileObjectKey(slug: string, key: string) {
  return `${filesPrefix(slug)}${key}`
}

export function assertValidFileKey(value: string) {
  if (!/^[A-Za-z0-9._-]+$/.test(value)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid file key.' })
  }

  return value
}

export async function removeSpace(bucket: any, slug: string) {
  const prefix = `spaces/${slug}/`
  const listed = await bucket.list({ prefix })
  if (listed.objects.length === 0) {
    return
  }

  await bucket.delete(listed.objects.map((item: any) => item.key))
}

export async function listExpiredSpaceSlugs(bucket: any) {
  const listed = await bucket.list({ prefix: 'spaces/', delimiter: '/' })
  const slugs = (listed.delimitedPrefixes || []).map((prefix: string) => prefix.split('/')[1]).filter(Boolean)

  const expired: string[] = []

  await Promise.all(slugs.map(async (slug) => {
    const meta = await getSpaceMeta(bucket, slug)
    if (!meta || meta.expiresAt <= Date.now()) {
      expired.push(slug)
    }
  }))

  return expired
}
