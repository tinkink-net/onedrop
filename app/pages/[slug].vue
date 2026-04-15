<script setup lang="ts">
type SpaceData = {
  slug: string
  url: string
  createdAt: number
  expiresAt: number
  files: Array<{ key: string; name: string; size: number; uploadedAt?: string }>
}

const route = useRoute()
const slug = computed(() => String(route.params.slug || '').toUpperCase())

const isLoading = ref(true)
const isUploading = ref(false)
const isCopying = ref(false)
const errorMessage = ref('')
const uploadError = ref('')
const selectedFile = ref<File | null>(null)
const copyStatus = ref('')
const uploadInput = ref<HTMLInputElement | null>(null)

const space = ref<SpaceData | null>(null)

const spaceUrl = computed(() => {
  return space.value?.url || ''
})

async function loadSpace() {
  isLoading.value = true
  errorMessage.value = ''

  try {
    space.value = await $fetch<SpaceData>(`/api/spaces/${slug.value}`)
    if (space.value) {
      recordRecentSpace(space.value.slug, space.value.expiresAt)
    }
  }
  catch (error: any) {
    errorMessage.value = error?.data?.statusMessage || 'Unable to load this space.'
  }
  finally {
    isLoading.value = false
  }
}

function onFilePicked(event: Event) {
  const input = event.target as HTMLInputElement
  selectedFile.value = input.files?.[0] || null
}

async function uploadFile() {
  if (!selectedFile.value) {
    return
  }

  isUploading.value = true
  uploadError.value = ''

  try {
    const formData = new FormData()
    formData.append('file', selectedFile.value)

    await $fetch(`/api/spaces/${slug.value}/upload`, {
      method: 'POST',
      body: formData
    })

    selectedFile.value = null
    if (uploadInput.value) {
      uploadInput.value.value = ''
    }
    await loadSpace()
  }
  catch (error: any) {
    uploadError.value = error?.data?.statusMessage || 'Upload failed.'
  }
  finally {
    isUploading.value = false
  }
}

function formatTime(time: number) {
  return new Date(time).toLocaleString()
}

function formatRelativeTime(time: number) {
  const deltaMs = time - Date.now()
  const absMs = Math.abs(deltaMs)
  const minute = 1000 * 60
  const hour = minute * 60
  const day = hour * 24

  if (absMs < minute) {
    return deltaMs >= 0 ? 'in moments' : 'just now'
  }

  if (absMs < hour) {
    const minutes = Math.round(absMs / minute)
    return deltaMs >= 0 ? `in ${minutes}m` : `${minutes}m ago`
  }

  if (absMs < day) {
    const hours = Math.round(absMs / hour)
    return deltaMs >= 0 ? `in ${hours}h` : `${hours}h ago`
  }

  const days = Math.round(absMs / day)
  return deltaMs >= 0 ? `in ${days}d` : `${days}d ago`
}

function formatBytes(size: number) {
  if (size < 1024) {
    return `${size} B`
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

async function copySpaceUrl() {
  if (!spaceUrl.value) {
    return
  }

  isCopying.value = true
  try {
    await navigator.clipboard.writeText(spaceUrl.value)
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
  finally {
    isCopying.value = false
  }
}

function openSpaceInNewTab() {
  if (!spaceUrl.value) {
    return
  }

  navigateTo(spaceUrl.value, { external: true, open: { target: '_blank' } })
}

onMounted(loadSpace)
</script>

<template>
  <main class="relative mx-auto min-h-screen w-full max-w-6xl px-5 py-8 md:px-8 md:py-10">
    <div class="pointer-events-none absolute inset-0 overflow-hidden">
      <div class="absolute top-2 -left-10 h-64 w-64 rounded-full bg-[#a7d8ff]/30 blur-3xl" />
      <div class="absolute top-24 -right-10 h-64 w-64 rounded-full bg-[#ffdd9d]/35 blur-3xl" />
    </div>

    <NuxtLink to="/" class="relative inline-flex items-center rounded-full border border-[rgba(16,38,31,0.2)] bg-white/70 px-4 py-2 text-sm font-medium text-[#21483f] transition hover:bg-white">← Back</NuxtLink>

    <header class="relative mt-4 surface-glass rounded-3xl p-6 shadow-[0_18px_40px_rgba(18,41,35,0.09)] md:p-7">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p class="font-mono-brand text-xs tracking-[0.2em] text-[#1c6d58]">SPACE</p>
          <h1 class="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">{{ slug }}</h1>
        </div>
        <span class="rounded-full bg-[#effaf5] px-3 py-1 text-xs font-semibold text-[#0d684f]">Temporary Share Room</span>
      </div>

      <div v-if="space" class="mt-5 grid gap-2 text-sm text-[color:var(--muted)] md:grid-cols-3">
        <p>Created: <span class="font-medium text-[color:var(--text)]">{{ formatTime(space.createdAt) }}</span></p>
        <p>Expires: <span class="font-medium text-[color:var(--text)]">{{ formatTime(space.expiresAt) }}</span></p>
        <p>Remaining: <span class="font-medium text-[color:var(--text)]">{{ formatRelativeTime(space.expiresAt) }}</span></p>
      </div>

      <div v-if="spaceUrl" class="mt-5 rounded-2xl border border-[#b7d9cb] bg-[#f5fffa] p-4">
        <p class="text-xs font-semibold uppercase tracking-[0.14em] text-[#1c6e58]">Space URL</p>
        <a
          :href="spaceUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="mt-2 block break-all text-sm font-medium text-[#0a5948] underline decoration-[#90cab6] underline-offset-2 hover:text-[#083f33]"
        >
          {{ spaceUrl }}
        </a>
        <div class="mt-3 flex flex-wrap gap-2">
          <button
            class="rounded-lg border border-[#9fcfbc] bg-white px-3 py-1.5 text-xs font-semibold text-[#0b6552] hover:bg-[#f6fffa] disabled:opacity-60"
            :disabled="isCopying"
            @click="copySpaceUrl"
          >
            {{ isCopying ? 'Copying…' : 'Copy link' }}
          </button>
          <button
            class="rounded-lg border border-[#9fcfbc] bg-white px-3 py-1.5 text-xs font-semibold text-[#0b6552] hover:bg-[#f6fffa]"
            @click="openSpaceInNewTab"
          >
            Open
          </button>
          <span v-if="copyStatus" class="rounded-lg bg-[#fff6d6] px-3 py-1.5 text-xs font-medium text-[#7d5a00]">{{ copyStatus }}</span>
        </div>
      </div>
    </header>

    <section class="relative mt-6 surface-glass rounded-3xl p-6 shadow-[0_18px_40px_rgba(18,41,35,0.09)] md:p-7">
      <h2 class="text-xl font-semibold">Upload file</h2>
      <p class="mt-1 text-sm text-[color:var(--muted)]">Upload and instantly share with everyone in this space.</p>

      <div class="mt-4 flex flex-col gap-3 md:flex-row md:items-center">
        <input ref="uploadInput" type="file" class="w-full rounded-xl border border-[rgba(16,38,31,0.2)] bg-white/80 px-3 py-2 text-sm" @change="onFilePicked">
        <button
          class="inline-flex items-center justify-center rounded-xl bg-[color:var(--primary)] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[color:var(--primary-strong)] disabled:opacity-60"
          :disabled="!selectedFile || isUploading"
          @click="uploadFile"
        >
          {{ isUploading ? 'Uploading…' : 'Upload' }}
        </button>
      </div>
      <p v-if="selectedFile" class="mt-2 text-xs text-[color:var(--muted)]">Selected: {{ selectedFile.name }}</p>
      <p v-if="uploadError" class="mt-3 text-sm text-[color:var(--danger)]">{{ uploadError }}</p>
    </section>

    <section class="relative mt-6 surface-glass rounded-3xl p-6 shadow-[0_18px_40px_rgba(18,41,35,0.09)] md:p-7">
      <h2 class="text-xl font-semibold">Files</h2>

      <p v-if="isLoading" class="mt-4 text-sm text-[color:var(--muted)]">Loading files…</p>
      <p v-else-if="errorMessage" class="mt-4 text-sm text-[color:var(--danger)]">{{ errorMessage }}</p>

      <ul v-else-if="space?.files.length" class="mt-4 grid gap-3">
        <li
          v-for="file in space.files"
          :key="file.key"
          class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[rgba(16,38,31,0.14)] bg-white/85 p-4"
        >
          <div class="min-w-0">
            <p class="truncate font-medium text-[color:var(--text)]">{{ file.name }}</p>
            <p class="mt-1 text-xs text-[color:var(--muted)]">{{ formatBytes(file.size) }}</p>
            <p v-if="file.uploadedAt" class="mt-1 text-xs text-[color:var(--muted)]">Uploaded {{ formatTime(new Date(file.uploadedAt).getTime()) }}</p>
          </div>
          <a
            class="inline-flex rounded-xl border border-[rgba(16,38,31,0.22)] bg-white px-3 py-2 text-xs font-semibold text-[#1f4d42] transition hover:bg-[#eefaf4]"
            :href="`/api/spaces/${slug}/files/${file.key}`"
          >
            Download
          </a>
        </li>
      </ul>

      <p v-else class="mt-4 text-sm text-[color:var(--muted)]">No files uploaded yet.</p>
    </section>
  </main>
</template>
