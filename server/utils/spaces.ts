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

type SpaceFileMeta = {
  name: string
  uploadedAt: string
}

export function normalizeSlug(value: string) {
  return value.trim().toUpperCase()
}

export function assertValidSlug(value: string) {
  const slug = normalizeSlug(value)
  if (!SLUG_REGEX.test(slug)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid share code.' })
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
  const bucket = event.context.cloudflare?.env?.ONEDROP_BUCKET ?? (globalThis as any).ONEDROP_BUCKET
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

function filesMetaPrefix(slug: string) {
  return `spaces/${slug}/files-meta/`
}

function fileMetaKey(slug: string, key: string) {
  return `${filesMetaPrefix(slug)}${key}.json`
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

export async function saveSpaceFileMeta(bucket: any, slug: string, key: string, meta: SpaceFileMeta) {
  await bucket.put(fileMetaKey(slug, key), JSON.stringify(meta), {
    httpMetadata: {
      contentType: 'application/json'
    }
  })
}

export async function getSpaceFileMeta(bucket: any, slug: string, key: string): Promise<SpaceFileMeta | null> {
  const object = await bucket.get(fileMetaKey(slug, key))
  if (!object) {
    return null
  }

  try {
    return JSON.parse(await object.text()) as SpaceFileMeta
  }
  catch {
    return null
  }
}

export async function requireActiveSpace(bucket: any, slug: string) {
  const meta = await getSpaceMeta(bucket, slug)

  if (!meta) {
    throw createError({ statusCode: 404, statusMessage: 'Share not found.' })
  }

  if (meta.expiresAt <= Date.now()) {
    throw createError({ statusCode: 410, statusMessage: 'Share has expired.' })
  }

  return meta
}

export async function listSpaceFiles(bucket: any, slug: string): Promise<SpaceFile[]> {
  const prefix = filesPrefix(slug)
  const listed = await bucket.list({ prefix })

  const files = await Promise.all(listed.objects.map(async (item: any) => {
    const key = item.key.slice(prefix.length)
    const objectName = item.customMetadata?.name as string | undefined
    const objectUploadedAt = item.customMetadata?.uploadedAt as string | undefined
    const storedMeta = (!objectName || !objectUploadedAt) ? await getSpaceFileMeta(bucket, slug, key) : null

    return {
      key,
      name: objectName || storedMeta?.name || key,
      size: item.size,
      uploadedAt: objectUploadedAt || storedMeta?.uploadedAt
    }
  }))

  return files.sort((a, b) => {
    const at = a.uploadedAt ? new Date(a.uploadedAt).getTime() : 0
    const bt = b.uploadedAt ? new Date(b.uploadedAt).getTime() : 0
    return bt - at
  })
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
  const slugs: string[] = ((listed.delimitedPrefixes || []) as string[])
    .map((prefix) => prefix.split('/')[1])
    .filter((slug): slug is string => Boolean(slug))

  const expired: string[] = []

  await Promise.all(slugs.map(async (slug) => {
    const meta = await getSpaceMeta(bucket, slug)
    if (!meta || meta.expiresAt <= Date.now()) {
      expired.push(slug)
    }
  }))

  return expired
}
