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
const REDIRECT_HOME_STATUS_CODES = new Set([400, 404])

const isLoading = ref(true)
const isUploading = ref(false)
const isCopying = ref(false)
const errorMessage = ref('')
const uploadError = ref('')
const selectedFile = ref<File | null>(null)
const copyStatus = ref('')
const uploadInput = ref<HTMLInputElement | null>(null)
const isUploadPanelOpen = ref(true)
const isUploadPanelPinnedOpen = ref(false)

const space = ref<SpaceData | null>(null)

const spaceUrl = computed(() => {
  return space.value?.url || ''
})
const hasFiles = computed(() => Boolean(space.value?.files.length))
const showUploadArea = computed(() => !hasFiles.value || isUploadPanelOpen.value)

watch(hasFiles, (value) => {
  if (!value) {
    isUploadPanelOpen.value = true
    isUploadPanelPinnedOpen.value = false
    return
  }

  if (!isUploadPanelPinnedOpen.value) {
    isUploadPanelOpen.value = false
  }
}, { immediate: true })

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
    const statusCode = error?.statusCode ?? error?.data?.statusCode ?? 0
    if (REDIRECT_HOME_STATUS_CODES.has(statusCode)) {
      await navigateTo('/')
      return
    }

    const statusMessage = error?.data?.statusMessage
    errorMessage.value = statusMessage || 'Unable to load this share.'
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

async function handleFilePickedAndUpload(event: Event) {
  onFilePicked(event)
  if (selectedFile.value) {
    await uploadFile()
  }
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

function openUploadPanel() {
  isUploadPanelOpen.value = true
  isUploadPanelPinnedOpen.value = true
}

function closeUploadPanel() {
  isUploadPanelOpen.value = false
  isUploadPanelPinnedOpen.value = false
}

onMounted(loadSpace)
</script>

<template>
  <main class="relative mx-auto flex min-h-full w-full max-w-4xl flex-col px-6 py-10 md:py-16 text-[color:var(--text)] flex-1">

    <nav class="mb-12 flex items-center justify-between">
      <NuxtLink to="/" class="flex items-center gap-2 text-sm font-medium text-[color:var(--muted)] hover:text-[color:var(--text)] transition-colors">
        <span class="font-mono-brand">←</span> Home
      </NuxtLink>
      <div v-if="space" class="font-mono-brand text-[11px] text-[color:var(--muted)] uppercase tracking-widest">
         Expires {{ formatTimeWithRelative(space.expiresAt) }}
      </div>
    </nav>

    <header class="mb-14 border-b border-[color:var(--border)] pb-8">
      <div class="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
           <p class="font-mono-brand text-[11px] uppercase tracking-widest text-[color:var(--muted)]">Share code</p>
           <h1 class="mt-2 text-5xl font-medium tracking-tight">{{ slug }}</h1>
        </div>
        <div v-if="spaceUrl" class="flex items-center gap-3">
          <!-- show space url -->
          <span class="rounded-md bg-[color:var(--bg-0)] px-3 py-1 text-[11px] font-mono-brand text-[color:var(--muted)] md:inline-flex">
            {{ spaceUrl }}
          </span>
          <button @click="copySpaceUrl" class="text-sm font-medium hover:underline underline-offset-4 disabled:opacity-50" :disabled="isCopying">
             {{ copyStatus || 'Copy Link' }}
          </button>
        </div>
      </div>
    </header>

    <section class="grid grid-cols-1 gap-12" :class="showUploadArea ? 'lg:grid-cols-3' : 'lg:grid-cols-1'">

        <!-- Upload area (Left column) -->
        <div v-if="showUploadArea" class="order-1 lg:order-2 lg:col-span-1">
          <div class="mb-4 flex items-center justify-between">
            <h2 class="text-sm font-medium text-[color:var(--text)]">Upload Files</h2>
            <button
              v-if="hasFiles"
              class="rounded border border-[color:var(--border)] px-2.5 py-1 text-[12px] font-semibold text-[color:var(--muted)] transition-colors hover:border-[color:var(--text)] hover:bg-[color:var(--bg-0)] hover:text-[color:var(--text)]"
              @click="isUploadPanelOpen ? closeUploadPanel() : openUploadPanel()"
            >
              {{ isUploadPanelOpen ? 'Close' : 'Upload' }}
            </button>
         </div>
         <div v-if="isUploadPanelOpen" class="relative flex cursor-pointer flex-col items-center justify-center border border-dashed border-[color:var(--border)] bg-[color:var(--bg-0)] p-10 text-center transition-colors hover:bg-[color:var(--bg-1)]">
           <input ref="uploadInput" type="file" class="absolute inset-0 cursor-pointer opacity-0" @change="handleFilePickedAndUpload">
           <span class="mb-2 text-2xl font-light text-[color:var(--muted)]">+</span>
           <span class="text-sm font-medium text-[color:var(--text)]">Click or Drop</span>
           <span class="mt-1 text-[11px] text-[color:var(--muted)]">Any file size limit</span>
            <div v-if="isUploading" class="absolute inset-0 flex items-center justify-center bg-[color:var(--card)]/90 text-sm font-medium backdrop-blur-sm">
              Uploading...
            </div>
          </div>
          <p v-if="uploadError" class="mt-3 text-sm text-[color:var(--danger)]">{{ uploadError }}</p>
        </div>

       <!-- File List (Right columns) -->
       <div :class="showUploadArea ? 'order-2 lg:order-1 lg:col-span-2' : 'order-2 lg:order-1 lg:col-span-1'">
          <div class="mb-4 flex items-center justify-between border-b border-[color:var(--border)] pb-2">
            <h2 class="text-sm font-medium text-[color:var(--text)]">Shared Files</h2>
            <button
              v-if="hasFiles && !isUploadPanelOpen"
              class="rounded border border-[color:var(--border)] px-2.5 py-1 text-[12px] font-semibold text-[color:var(--muted)] transition-colors hover:border-[color:var(--text)] hover:bg-[color:var(--bg-0)] hover:text-[color:var(--text)]"
              @click="openUploadPanel"
            >
              Upload Files
            </button>
          </div>

          <p v-if="isLoading" class="mt-4 text-[13px] text-[color:var(--muted)]">Loading files...</p>
         <p v-else-if="errorMessage" class="mt-4 text-[13px] text-[color:var(--danger)]">{{ errorMessage }}</p>

         <ul v-else-if="space?.files.length" class="mt-4 grid gap-2">
            <li
              v-for="file in space.files"
              :key="file.key"
              class="group flex flex-col justify-between gap-3 border border-transparent border-b-[color:var(--border)] py-3 sm:flex-row sm:items-center hover:border-b-[color:var(--text)] transition-colors"
            >
              <div class="min-w-0">
                <p class="truncate text-[14px] font-medium text-[color:var(--text)]">{{ file.name }}</p>
                <div class="mt-1 flex gap-3 text-[11px] text-[color:var(--muted)] font-mono-brand">
                   <span>{{ formatBytes(file.size) }}</span>
                   <span v-if="file.uploadedAt">Uploaded {{ formatTimeWithRelative(new Date(file.uploadedAt).getTime()) }}</span>
                </div>
              </div>
              <a
                class="shrink-0 text-[13px] font-medium text-[color:var(--muted)] transition-colors hover:text-[color:var(--text)]"
                :href="`/api/spaces/${slug}/files/${file.key}`"
              >
                Download ↓
              </a>
            </li>
         </ul>

         <div v-else class="mt-10 text-center">
            <p class="text-[13px] text-[color:var(--muted)]">No files uploaded yet.</p>
         </div>
      </div>

    </section>
  </main>
</template>
