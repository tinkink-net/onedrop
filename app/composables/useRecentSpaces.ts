type RecentSpace = {
  slug: string
  lastVisitedAt: number
  expiresAt?: number
}

const RECENT_SPACES_STORAGE_KEY = 'onedrop.recent-spaces.v1'
const MAX_RECENT_SPACES = 8
const SLUG_REGEX = /^[A-HJ-NP-Z2-9]{6}$/

function normalizeSlug(slug: string) {
  return String(slug || '').trim().toUpperCase()
}

function isClient() {
  return typeof window !== 'undefined'
}

function isValidSlug(slug: string) {
  return SLUG_REGEX.test(normalizeSlug(slug))
}

export function loadRecentSpaces(): RecentSpace[] {
  if (!isClient()) {
    return []
  }

  try {
    const raw = window.localStorage.getItem(RECENT_SPACES_STORAGE_KEY)
    if (!raw) {
      return []
    }

    const parsed = JSON.parse(raw) as RecentSpace[]
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed
      .map((item) => ({
        slug: normalizeSlug(item.slug),
        lastVisitedAt: Number(item.lastVisitedAt) || Date.now(),
        expiresAt: Number.isFinite(Number(item.expiresAt)) ? Number(item.expiresAt) : undefined
      }))
      .filter((item) => isValidSlug(item.slug))
      .sort((a, b) => b.lastVisitedAt - a.lastVisitedAt)
      .slice(0, MAX_RECENT_SPACES)
  }
  catch {
    return []
  }
}

export function saveRecentSpaces(entries: RecentSpace[]) {
  if (!isClient()) {
    return
  }

  window.localStorage.setItem(RECENT_SPACES_STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_RECENT_SPACES)))
}

export function recordRecentSpace(slugInput: string, expiresAt?: number) {
  const slug = normalizeSlug(slugInput)
  if (!isValidSlug(slug)) {
    return
  }

  const now = Date.now()
  const existing = loadRecentSpaces().filter((entry) => entry.slug !== slug)

  const next: RecentSpace[] = [
    {
      slug,
      lastVisitedAt: now,
      expiresAt
    },
    ...existing
  ].slice(0, MAX_RECENT_SPACES)

  saveRecentSpaces(next)
}

export function setRecentSpaces(entries: RecentSpace[]) {
  const normalized = entries
    .map((entry) => ({
      slug: normalizeSlug(entry.slug),
      lastVisitedAt: Number(entry.lastVisitedAt) || Date.now(),
      expiresAt: Number.isFinite(Number(entry.expiresAt)) ? Number(entry.expiresAt) : undefined
    }))
    .filter((entry) => isValidSlug(entry.slug))
    .sort((a, b) => b.lastVisitedAt - a.lastVisitedAt)
    .slice(0, MAX_RECENT_SPACES)

  saveRecentSpaces(normalized)
}
