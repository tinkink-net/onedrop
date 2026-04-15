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
const showJoin = ref(false)
const copyStatus = ref('')
const recentSpaces = ref<RecentSpace[]>([])
const isRefreshingRecent = ref(false)

function normalizeInputSlug(value: string) {
  return value.trim().toUpperCase()
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
  <main class="relative mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center px-6 py-12 md:py-20 text-[color:var(--text)] flex-1">

    <header class="mb-14">
      <div class="flex items-center gap-3">
        <div class="h-3 w-3 bg-[#111] rounded-sm"></div>
        <p class="font-mono-brand text-[11px] font-semibold tracking-widest text-[#111]">ONEDROP.TINKCLOUD.COM</p>
      </div>
      <h1 class="mt-8 text-4xl font-medium tracking-tight md:text-5xl">Share files without friction.</h1>
      <p class="mt-5 max-w-xl text-[15px] leading-relaxed text-[#555]">Temporary spaces that expire automatically. No accounts required. Create a space, drop your files, and collaborate instantly.</p>
    </header>

    <div class="space-y-6">

      <!-- Create Action (Primary) -->
      <section class="border border-[color:var(--border)] bg-white p-6 md:p-8">
        <div class="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div class="flex-1">
             <label class="block font-mono-brand text-[11px] tracking-widest text-[#666] uppercase" for="hours">Space Expiration</label>
             <div class="mt-3 flex items-center gap-3 border-b border-[color:var(--border)] pb-2 transition-colors focus-within:border-[color:var(--primary)]">
               <input id="hours" v-model.number="hours" type="number" min="1" max="24" class="w-16 bg-transparent text-2xl font-medium outline-none" />
               <span class="text-[15px] text-[#666]">hours</span>
             </div>
          </div>
          <button class="flex items-center gap-2 bg-[color:var(--primary)] px-7 py-3.5 text-sm font-medium text-white transition-colors hover:bg-[color:var(--primary-hover)] disabled:opacity-50" :disabled="isCreating" @click="createSpace">
            {{ isCreating ? 'Creating...' : 'Create Space' }} <span class="ml-1 font-mono-brand text-xs font-normal">→</span>
          </button>
        </div>

        <!-- Created State -->
        <div v-if="createdUrl" class="mt-8 border-t border-[color:var(--border)] pt-6">
          <p class="mb-3 font-mono-brand text-[11px] tracking-widest text-[#666] uppercase">Copy URL to Share</p>
          <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
            <input readonly :value="createdUrl" class="flex-1 border border-[color:var(--border)] bg-[color:var(--bg-0)] px-4 py-2.5 font-mono-brand text-sm text-[color:var(--text)] outline-none" />
            <div class="flex gap-2">
              <button class="whitespace-nowrap border border-[color:var(--border)] bg-transparent px-4 py-2.5 text-sm font-medium transition-colors hover:bg-[color:var(--bg-1)] disabled:opacity-60" @click="copyText(createdUrl)">
                {{ copyStatus ? 'Copied!' : 'Copy Link' }}
              </button>
              <button class="border border-[color:var(--border)] bg-transparent px-4 py-2.5 text-sm font-medium transition-colors hover:bg-[color:var(--bg-1)]" @click="openCreatedUrl">
                Open
              </button>
            </div>
          </div>
        </div>
        <p v-if="errorMessage" class="mt-4 text-sm text-[color:var(--danger)]">{{ errorMessage }}</p>
      </section>

      <!-- Join Action (Triggered) -->
      <section>
        <button v-if="!showJoin" @click="showJoin = true" class="text-[13px] font-medium text-[color:var(--muted)] transition-colors hover:text-[color:var(--text)] underline decoration-[color:var(--border)] underline-offset-4">
          Have a slug? Join an existing space
        </button>
        <div v-else class="flex flex-col gap-4 border border-[color:var(--border)] bg-[color:var(--bg-0)] p-6 md:p-8">
            <label class="block font-mono-brand text-[11px] tracking-widest text-[color:var(--muted)] uppercase" for="slug">Enter Space Slug</label>
            <div class="flex flex-col gap-3 sm:flex-row">
              <input id="slug" v-model="slugInput" maxlength="6" placeholder="AB2C3D" class="flex-1 border-b border-[color:var(--border)] bg-transparent px-0 py-2 text-xl font-medium uppercase tracking-[0.1em] outline-none transition-colors focus:border-[color:var(--primary)]" @keyup.enter="joinSpace" />
              <button class="border border-[color:var(--primary)] px-6 py-2.5 text-sm font-medium text-[color:var(--primary)] transition-colors hover:bg-[color:var(--primary)] hover:text-white disabled:opacity-50" :disabled="isJoining" @click="joinSpace">
                {{ isJoining ? 'Checking...' : 'Join' }}
              </button>
            </div>
            <p v-if="joinError" class="mt-1 text-sm text-[color:var(--danger)]">{{ joinError }}</p>
        </div>
      </section>

      <!-- Recent Spaces -->
      <section v-if="recentSpaces.length" class="mt-20 border-t border-[color:var(--border)] pt-10">
        <div class="mb-6 flex items-center justify-between">
          <h2 class="text-sm font-medium text-[color:var(--text)]">Recent Spaces</h2>
          <span v-if="isRefreshingRecent" class="font-mono-brand text-[11px] text-[color:var(--muted)]">Syncing...</span>
        </div>

        <ul class="grid gap-3">
          <li v-for="spaceItem in recentSpaces" :key="spaceItem.slug" class="group flex flex-col gap-4 border border-[color:var(--border)] bg-transparent p-4 transition-colors hover:bg-[color:var(--card)] sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p class="font-mono-brand text-[13px] tracking-wide text-[color:var(--text)]">{{ spaceItem.slug }}</p>
              <div class="mt-1.5 flex items-center gap-3 text-[12px] text-[color:var(--muted)]">
                <span>Visited {{ formatTimeWithRelative(spaceItem.lastVisitedAt) }}</span>
                <span v-if="spaceItem.expiresAt" class="opacity-50">• Expires {{ formatTimeWithRelative(spaceItem.expiresAt) }}</span>
              </div>
            </div>
            <button class="text-[13px] font-medium text-[color:var(--muted)] transition-colors group-hover:text-[color:var(--text)]" @click="openRecentSpace(spaceItem.slug)">
              Re-enter →
            </button>
          </li>
        </ul>
      </section>

    </div>
  </main>
</template>
