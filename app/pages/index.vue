<script setup lang="ts">
type SpaceSummary = {
  slug: string
  createdAt: number
  expiresAt: number
  files: Array<{ key: string; name: string; size: number; uploadedAt?: string }>
}

type RecentSpace = {
  slug: string
  lastVisitedAt: number
  expiresAt?: number
}

const slugInput = ref('')
const hours = ref(3)
const isCreating = ref(false)
const isJoining = ref(false)
const createdUrl = ref('')
const createdSlug = ref('')
const errorMessage = ref('')
const joinError = ref('')
const copyStatus = ref('')
const recentSpaces = ref<RecentSpace[]>([])
const isRefreshingRecent = ref(false)

function normalizeInputSlug(value: string) {
  return value.trim().toUpperCase()
}

function formatTime(time: number) {
  return new Date(time).toLocaleString()
}

function relativeTime(time: number) {
  const diff = time - Date.now()
  const abs = Math.abs(diff)
  const minutes = Math.round(abs / (1000 * 60))

  if (minutes < 1) {
    return diff >= 0 ? 'in moments' : 'just now'
  }

  if (minutes < 60) {
    return diff >= 0 ? `in ${minutes}m` : `${minutes}m ago`
  }

  const hours = Math.round(minutes / 60)
  if (hours < 24) {
    return diff >= 0 ? `in ${hours}h` : `${hours}h ago`
  }

  const days = Math.round(hours / 24)
  return diff >= 0 ? `in ${days}d` : `${days}d ago`
}

async function copyText(text: string) {
  if (!text) {
    return
  }

  try {
    await navigator.clipboard.writeText(text)
    copyStatus.value = 'Copied'
    window.setTimeout(() => {
      copyStatus.value = ''
    }, 1600)
  }
  catch {
    copyStatus.value = 'Copy failed'
    window.setTimeout(() => {
      copyStatus.value = ''
    }, 1600)
  }
}

function openCreatedUrl() {
  if (!createdUrl.value) {
    return
  }

  navigateTo(createdUrl.value, { external: true, open: { target: '_blank' } })
}

async function refreshRecentSpaces() {
  isRefreshingRecent.value = true
  const stored = loadRecentSpaces()

  if (!stored.length) {
    recentSpaces.value = []
    isRefreshingRecent.value = false
    return
  }

  const checked: Array<RecentSpace | null> = await Promise.all(stored.map(async (entry) => {
    try {
      const data = await $fetch<SpaceSummary>(`/api/spaces/${entry.slug}`)
      return {
        slug: entry.slug,
        lastVisitedAt: entry.lastVisitedAt,
        expiresAt: data.expiresAt
      }
    }
    catch {
      return null
    }
  }))

  const valid = checked.filter((item): item is RecentSpace => item !== null).sort((a, b) => b.lastVisitedAt - a.lastVisitedAt)
  recentSpaces.value = valid
  setRecentSpaces(valid)
  isRefreshingRecent.value = false
}

async function openRecentSpace(slug: string) {
  navigateTo(`/${slug}`)
}

async function createSpace() {
  isCreating.value = true
  createdUrl.value = ''
  createdSlug.value = ''
  errorMessage.value = ''

  try {
    const response = await $fetch<{ url: string; slug: string; expiresInHours: number; expiresAt: number }>('/api/spaces/create', {
      method: 'POST',
      body: {
        expiresInHours: hours.value
      }
    })

    createdUrl.value = response.url
    createdSlug.value = response.slug
    recordRecentSpace(response.slug, response.expiresAt)
    await refreshRecentSpaces()
  }
  catch (error: any) {
    errorMessage.value = error?.data?.statusMessage || 'Failed to create space.'
  }
  finally {
    isCreating.value = false
  }
}

async function joinSpace() {
  const slug = normalizeInputSlug(slugInput.value)
  joinError.value = ''

  if (!slug) {
    joinError.value = 'Please enter a space slug.'
    return
  }

  isJoining.value = true

  try {
    const data = await $fetch<SpaceSummary>(`/api/spaces/${slug}`)
    recordRecentSpace(slug, data.expiresAt)
    await refreshRecentSpaces()
    navigateTo(`/${slug}`)
  }
  catch (error: any) {
    joinError.value = error?.data?.statusMessage || 'Space is not available.'
  }
  finally {
    isJoining.value = false
  }
}

onMounted(() => {
  refreshRecentSpaces()
})
</script>

<template>
  <main class="relative mx-auto min-h-screen w-full max-w-6xl px-5 py-10 md:px-8 md:py-14">
    <div class="pointer-events-none absolute inset-0 overflow-hidden">
      <div class="absolute -top-20 -left-10 h-72 w-72 rounded-full bg-[#99d7b8]/35 blur-3xl" />
      <div class="absolute top-24 -right-16 h-72 w-72 rounded-full bg-[#9cc8f1]/35 blur-3xl" />
      <div class="absolute bottom-8 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full bg-[#ffe3a3]/45 blur-3xl" />
    </div>

    <section class="relative">
      <p class="font-mono-brand text-xs tracking-[0.22em] text-[#1d6355]">ONEDROP</p>
      <h1 class="mt-3 max-w-3xl text-4xl font-semibold leading-tight md:text-5xl">Share files fast through temporary rooms, without accounts.</h1>
      <p class="mt-4 max-w-2xl text-[15px] leading-relaxed text-[color:var(--muted)]">Create a space, send one link, and collaborate for a short window. Each space expires automatically to keep sharing clean and low-friction.</p>
    </section>

    <section class="relative mt-10 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <div class="surface-glass rounded-3xl p-6 shadow-[0_18px_40px_rgba(18,41,35,0.09)] md:p-7">
        <div class="flex items-center justify-between">
          <h2 class="text-xl font-semibold">Create a Space</h2>
          <span class="rounded-full bg-[#e9f8f2] px-3 py-1 text-xs font-medium text-[#0e705b]">Instant</span>
        </div>
        <p class="mt-2 text-sm text-[color:var(--muted)]">Pick expiration between 1 and 24 hours.</p>

        <label class="mt-6 block text-sm font-medium" for="hours">Expires in (hours)</label>
        <div class="mt-2 flex gap-3">
          <input
            id="hours"
            v-model.number="hours"
            type="number"
            min="1"
            max="24"
            class="w-full rounded-xl border border-[rgba(16,38,31,0.2)] bg-white/80 px-4 py-3 outline-none ring-[color:var(--primary)]/20 transition focus:ring"
          >
          <button
            class="rounded-xl bg-[color:var(--primary)] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[color:var(--primary-strong)] disabled:opacity-60"
            :disabled="isCreating"
            @click="createSpace"
          >
            {{ isCreating ? 'Creating…' : 'Create' }}
          </button>
        </div>

        <div v-if="createdUrl" class="mt-5 rounded-2xl border border-[#b7d9cb] bg-[#f5fffa] p-4">
          <p class="text-xs font-semibold uppercase tracking-[0.14em] text-[#1c6e58]">Generated Link</p>
          <a
            :href="createdUrl"
            class="mt-2 block break-all text-sm font-medium text-[#0a5948] underline decoration-[#90cab6] underline-offset-2 hover:text-[#083f33]"
            target="_blank"
            rel="noopener noreferrer"
          >
            {{ createdUrl }}
          </a>
          <div class="mt-3 flex flex-wrap gap-2">
            <button
              class="rounded-lg border border-[#9fcfbc] bg-white px-3 py-1.5 text-xs font-semibold text-[#0b6552] hover:bg-[#f6fffa]"
              @click="copyText(createdUrl)"
            >
              Copy link
            </button>
            <button
              class="rounded-lg border border-[#9fcfbc] bg-white px-3 py-1.5 text-xs font-semibold text-[#0b6552] hover:bg-[#f6fffa]"
              @click="openCreatedUrl"
            >
              Open
            </button>
            <span v-if="createdSlug" class="rounded-lg bg-[#e9f8f2] px-3 py-1.5 text-xs font-medium text-[#0c5a4a]">Slug {{ createdSlug }}</span>
            <span v-if="copyStatus" class="rounded-lg bg-[#fff6d6] px-3 py-1.5 text-xs font-medium text-[#7d5a00]">{{ copyStatus }}</span>
          </div>
        </div>

        <p v-if="errorMessage" class="mt-4 text-sm text-[color:var(--danger)]">{{ errorMessage }}</p>
      </div>

      <div class="surface-glass rounded-3xl p-6 shadow-[0_18px_40px_rgba(18,41,35,0.09)] md:p-7">
        <h2 class="text-xl font-semibold">Join a Space</h2>
        <p class="mt-2 text-sm text-[color:var(--muted)]">Enter a 6-character slug to continue sharing.</p>

        <label class="mt-6 block text-sm font-medium" for="slug">Space slug</label>
        <input
          id="slug"
          v-model="slugInput"
          maxlength="6"
          placeholder="AB2C3D"
          class="mt-2 w-full rounded-xl border border-[rgba(16,38,31,0.2)] bg-white/80 px-4 py-3 uppercase tracking-[0.08em] outline-none ring-[color:var(--primary)]/20 transition focus:ring"
          @keyup.enter="joinSpace"
        >

        <button
          class="mt-4 inline-flex w-full items-center justify-center rounded-xl border border-[rgba(16,38,31,0.22)] bg-white px-4 py-3 text-sm font-semibold text-[#0f3028] transition hover:bg-[#f3faf7] disabled:opacity-60"
          :disabled="isJoining"
          @click="joinSpace"
        >
          {{ isJoining ? 'Checking…' : 'Join space' }}
        </button>

        <p v-if="joinError" class="mt-3 text-sm text-[color:var(--danger)]">{{ joinError }}</p>
      </div>
    </section>

    <section class="relative mt-8 surface-glass rounded-3xl p-6 shadow-[0_14px_36px_rgba(18,41,35,0.08)] md:p-7">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 class="text-xl font-semibold">Recent Spaces</h2>
        <span class="text-xs text-[color:var(--muted)]">Validated on load</span>
      </div>

      <p v-if="isRefreshingRecent" class="mt-4 text-sm text-[color:var(--muted)]">Checking active spaces…</p>

      <ul v-else-if="recentSpaces.length" class="mt-4 grid gap-3 md:grid-cols-2">
        <li
          v-for="spaceItem in recentSpaces"
          :key="spaceItem.slug"
          class="rounded-2xl border border-[rgba(16,38,31,0.14)] bg-white/85 p-4"
        >
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="font-mono-brand text-sm tracking-[0.08em]">{{ spaceItem.slug }}</p>
              <p class="mt-1 text-xs text-[color:var(--muted)]">Visited {{ relativeTime(spaceItem.lastVisitedAt) }}</p>
              <p v-if="spaceItem.expiresAt" class="mt-1 text-xs text-[color:var(--muted)]">Expires {{ formatTime(spaceItem.expiresAt) }}</p>
            </div>
            <button
              class="rounded-lg bg-[#0f6b58] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#0b4f41]"
              @click="openRecentSpace(spaceItem.slug)"
            >
              Open
            </button>
          </div>
        </li>
      </ul>

      <p v-else class="mt-4 text-sm text-[color:var(--muted)]">No recent valid spaces yet.</p>
    </section>
  </main>
</template>
