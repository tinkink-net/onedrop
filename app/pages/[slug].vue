<script setup lang="ts">
type SpaceData = {
  slug: string
  url: string
  createdAt: number
  expiresAt: number
  files: Array<{ key: string; name: string; size: number; uploadedAt?: string }>
}
type QrCodeToDataURL = (text: string, options?: {
  width?: number
  margin?: number
  color?: { dark?: string; light?: string }
}) => Promise<string>
type QrCodeModule = {
  toDataURL?: QrCodeToDataURL
  default?: { toDataURL?: QrCodeToDataURL }
}

const route = useRoute()
const slug = computed(() => String(route.params.slug || '').toUpperCase())
const REDIRECT_HOME_STATUS_CODES = new Set([400, 404])
const QR_CODE_SIZE = 224
const REFRESH_INTERVALS = [10_000, 20_000, 45_000, 90_000, 180_000, 300_000] as const
const ACTIVE_REFRESH_WINDOW_MS = 90_000
const ACTIVITY_DEBOUNCE_MS = 1_000
const HIDDEN_TAB_TIER_INCREMENT = 2

const isLoading = ref(true)
const isUploading = ref(false)
const isCopying = ref(false)
const isRefreshingFiles = ref(false)
const errorMessage = ref('')
const uploadError = ref('')
const selectedFile = ref<File | null>(null)
const copyStatus = ref('')
const copyEmailStatus = ref('')
const uploadInput = ref<HTMLInputElement | null>(null)
const isUploadPanelOpen = ref(true)
const isUploadPanelPinnedOpen = ref(false)

const uploadProgress = ref(0)
const uploadSpeed = ref(0)

const space = ref<SpaceData | null>(null)
const qrCodeDataUrl = ref('')
const qrCodeToDataURL = ref<QrCodeToDataURL | null>(null)
const qrCodeRequestId = ref(0)
const stopQrCodeWatch = ref<(() => void) | null>(null)
const isSpaceRequestInFlight = ref(false)
const autoRefreshTimer = ref<ReturnType<typeof window.setTimeout> | null>(null)
const refreshTierIndex = ref(0)
const lastActiveAt = ref(Date.now())
const lastActivityScheduleAt = ref(0)

const spaceUrl = computed(() => {
  return space.value?.url || ''
})
const emailUploadAddress = computed(() => {
  return `${slug.value}@0x1.one`
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

function getFilesFingerprint(files: SpaceData['files'] = []) {
  return JSON.stringify(files.map((file) => [file.key, file.size, file.uploadedAt || '', file.name]))
}

function clearAutoRefreshTimer() {
  if (autoRefreshTimer.value === null) {
    return
  }

  window.clearTimeout(autoRefreshTimer.value)
  autoRefreshTimer.value = null
}

function isDocumentHidden() {
  return typeof document !== 'undefined' && document.hidden
}

function markRefreshActive() {
  lastActiveAt.value = Date.now()
  refreshTierIndex.value = 0
}

function bumpRefreshTierForHiddenTab() {
  refreshTierIndex.value = Math.min(refreshTierIndex.value + HIDDEN_TAB_TIER_INCREMENT, REFRESH_INTERVALS.length - 1)
}

function updateRefreshTier(changed: boolean) {
  if (changed) {
    markRefreshActive()
    return
  }

  if (isDocumentHidden()) {
    bumpRefreshTierForHiddenTab()
    return
  }

  const activeRecently = Date.now() - lastActiveAt.value < ACTIVE_REFRESH_WINDOW_MS
  if (activeRecently) {
    refreshTierIndex.value = 0
    return
  }

  refreshTierIndex.value = Math.min(refreshTierIndex.value + 1, REFRESH_INTERVALS.length - 1)
}

async function loadSpace(options: { background?: boolean } = {}): Promise<boolean | null> {
  if (isSpaceRequestInFlight.value) {
    return null
  }

  const { background = false } = options
  const previousFingerprint = getFilesFingerprint(space.value?.files || [])

  isSpaceRequestInFlight.value = true
  if (background) {
    isRefreshingFiles.value = true
  }
  else {
    isLoading.value = true
  }
  errorMessage.value = ''

  try {
    const nextSpace = await $fetch<SpaceData>(`/api/spaces/${slug.value}`)
    const nextFingerprint = getFilesFingerprint(nextSpace.files || [])
    const changed = previousFingerprint !== nextFingerprint
    space.value = nextSpace
    recordRecentSpace(nextSpace.slug, nextSpace.expiresAt)
    return changed
  }
  catch (error: any) {
    const statusCode = error?.statusCode ?? error?.data?.statusCode
    if (typeof statusCode === 'number' && REDIRECT_HOME_STATUS_CODES.has(statusCode)) {
      await navigateTo('/')
      return null
    }

    const statusMessage = error?.data?.statusMessage
    errorMessage.value = statusMessage || 'Unable to load this share.'
    return null
  }
  finally {
    isSpaceRequestInFlight.value = false
    isRefreshingFiles.value = false
    isLoading.value = false
  }
}

async function updateQrCode(value: string) {
  const requestId = ++qrCodeRequestId.value

  if (!value || !qrCodeToDataURL.value) {
    qrCodeDataUrl.value = ''
    return
  }

  try {
    const dataUrl = await qrCodeToDataURL.value(value, {
      width: QR_CODE_SIZE,
      margin: 1,
      color: {
        dark: '#111827',
        light: '#0000'
      }
    })

    if (requestId === qrCodeRequestId.value) {
      qrCodeDataUrl.value = dataUrl
    }
  }
  catch {
    if (requestId === qrCodeRequestId.value) {
      qrCodeDataUrl.value = ''
    }
  }
}

async function loadQrLibrary() {
  try {
    const qrcodeModule: QrCodeModule = await import('qrcode')
    const toDataURL = qrcodeModule.toDataURL ?? qrcodeModule.default?.toDataURL

    if (typeof toDataURL === 'function') {
      qrCodeToDataURL.value = toDataURL
      await updateQrCode(spaceUrl.value)
    }
  }
  catch {
    qrCodeDataUrl.value = ''
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
  uploadProgress.value = 0
  uploadSpeed.value = 0

  try {
    const CHUNK_SIZE = 5 * 1024 * 1024 // 5MB (R2 min size, except for last chunk)
    const totalSize = selectedFile.value.size

    // Natively handled by R2 via Multipart API, single chunk if file is small
    const startRes = await $fetch<{ ok: boolean; key: string; uploadId: string; uploadedAt: string }>(`/api/spaces/${slug.value}/upload?action=start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: selectedFile.value.name,
        type: selectedFile.value.type || 'application/octet-stream',
      })
    })

    if (!startRes.ok) {
      throw new Error('Failed to start upload.')
    }

    const { key, uploadId, uploadedAt } = startRes
    const totalParts = Math.max(1, Math.ceil(totalSize / CHUNK_SIZE))
    const parts: { partNumber: number; etag: string }[] = []

    let totalLoaded = 0
    let lastTime = Date.now()
    let lastLoadedForSpeed = 0

    for (let i = 0; i < totalParts; i++) {
      const start = i * CHUNK_SIZE
      const end = Math.min(start + CHUNK_SIZE, totalSize)
      const chunk = selectedFile.value.slice(start, end)

      const partNumber = i + 1
      const formData = new FormData()
      formData.append('chunk', chunk)

      const partRes = await new Promise<{ ok: boolean; partNumber: number; etag: string }>((resolve, reject) => {
        const xhr = new XMLHttpRequest()

        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const currentLoaded = totalLoaded + event.loaded
            uploadProgress.value = Math.min((currentLoaded / totalSize) * 100, 99.9)

            const now = Date.now()
            const timeDiff = (now - lastTime) / 1000
            if (timeDiff >= 0.25) {
              const loadedDiff = currentLoaded - lastLoadedForSpeed
              uploadSpeed.value = loadedDiff / timeDiff
              lastTime = now
              lastLoadedForSpeed = currentLoaded
            }
          }
        })

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText))
          } else {
            reject(new Error('Chunk upload failed.'))
          }
        })

        xhr.addEventListener('error', () => reject(new Error('Network error during chunk upload.')))
        xhr.addEventListener('abort', () => reject(new Error('Chunk upload aborted.')))

        xhr.open('POST', `/api/spaces/${slug.value}/upload?action=part&key=${encodeURIComponent(key)}&uploadId=${encodeURIComponent(uploadId)}&partNumber=${partNumber}`)
        xhr.send(formData)
      })

      if (!partRes.ok) {
        throw new Error(`Failed to upload part ${partNumber}.`)
      }

      parts.push({ partNumber: partRes.partNumber, etag: partRes.etag })
      totalLoaded += chunk.size
    }

    await $fetch(`/api/spaces/${slug.value}/upload?action=complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key,
        uploadId,
        parts,
        name: selectedFile.value.name,
        uploadedAt
      })
    })

    uploadProgress.value = 100
    uploadSpeed.value = 0

    selectedFile.value = null
    if (uploadInput.value) {
      uploadInput.value.value = ''
    }
    markRefreshActive()
    const changed = await loadSpace({ background: true })
    if (typeof changed === 'boolean') {
      updateRefreshTier(changed)
    }
    scheduleAutoRefresh()
  }
  catch (error: any) {
    uploadError.value = error?.message || error?.data?.statusMessage || 'Upload failed.'
  }
  finally {
    isUploading.value = false
    uploadProgress.value = 0
    uploadSpeed.value = 0
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

async function copyEmailUploadAddress() {
  if (!emailUploadAddress.value) {
    return
  }

  try {
    await navigator.clipboard.writeText(emailUploadAddress.value)
    copyEmailStatus.value = 'Copied'
    window.setTimeout(() => {
      copyEmailStatus.value = ''
    }, 1600)
  }
  catch {
    copyEmailStatus.value = 'Copy failed'
    window.setTimeout(() => {
      copyEmailStatus.value = ''
    }, 1600)
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

async function refreshFilesNow() {
  markRefreshActive()
  const changed = await loadSpace({ background: true })
  if (typeof changed === 'boolean') {
    updateRefreshTier(changed)
  }
  scheduleAutoRefresh()
}

function scheduleAutoRefresh() {
  if (typeof window === 'undefined') {
    return
  }

  clearAutoRefreshTimer()

  const refreshDelay = REFRESH_INTERVALS[refreshTierIndex.value]
  autoRefreshTimer.value = window.setTimeout(async () => {
    try {
      if (isSpaceRequestInFlight.value) {
        scheduleAutoRefresh()
        return
      }

      const changed = await loadSpace({ background: true })
      if (typeof changed === 'boolean') {
        updateRefreshTier(changed)
      }
      scheduleAutoRefresh()
    }
    catch {
      scheduleAutoRefresh()
    }
  }, refreshDelay)
}

function handleInteractionActivity() {
  const now = Date.now()
  if (now - lastActivityScheduleAt.value < ACTIVITY_DEBOUNCE_MS) {
    return
  }

  lastActivityScheduleAt.value = now
  markRefreshActive()
  scheduleAutoRefresh()
}

function handleVisibilityChange() {
  if (!isDocumentHidden()) {
    void refreshFilesNow()
    return
  }

  bumpRefreshTierForHiddenTab()
  scheduleAutoRefresh()
}

onMounted(() => {
  stopQrCodeWatch.value = watch(spaceUrl, (value) => {
    void updateQrCode(value)
  }, { immediate: true })

  void loadSpace().then((changed) => {
    if (typeof changed === 'boolean') {
      updateRefreshTier(changed)
    }
    scheduleAutoRefresh()
  })
  void loadQrLibrary()

  if (typeof window !== 'undefined') {
    window.addEventListener('pointerdown', handleInteractionActivity, { passive: true })
    window.addEventListener('keydown', handleInteractionActivity, { passive: true })
    window.addEventListener('focus', handleInteractionActivity)
    document.addEventListener('visibilitychange', handleVisibilityChange)
  }
})

onUnmounted(() => {
  stopQrCodeWatch.value?.()
  stopQrCodeWatch.value = null

  if (typeof window !== 'undefined') {
    clearAutoRefreshTimer()
    window.removeEventListener('pointerdown', handleInteractionActivity)
    window.removeEventListener('keydown', handleInteractionActivity)
    window.removeEventListener('focus', handleInteractionActivity)
    document.removeEventListener('visibilitychange', handleVisibilityChange)
  }
})
</script>

<template>
  <main class="relative mx-auto flex min-h-full w-full max-w-4xl flex-col px-6 py-6 md:py-12 text-[color:var(--text)] flex-1">

    <nav class="mb-12 flex items-center justify-between">
      <NuxtLink to="/" class="flex items-center gap-2 text-sm font-medium text-[color:var(--muted)] hover:text-[color:var(--text)] transition-colors">
        <span class="font-mono-brand">←</span> Home
      </NuxtLink>
    </nav>

    <header class="mb-14 border-b border-[color:var(--border)] pb-8">
      <div class="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div class="flex flex-col gap-3">
          <p class="font-mono-brand text-[11px] uppercase tracking-widest text-[color:var(--muted)]">Share code</p>
          <h1 class="text-5xl font-medium tracking-tight">{{ slug }}</h1>
          <div class="flex flex-col gap-3">
            <div v-if="space" class="font-mono-brand text-[11px] text-[color:var(--muted)] uppercase tracking-widest">
              Expires {{ formatTimeWithRelative(space.expiresAt) }}
            </div>
            <div v-if="spaceUrl" class="flex items-center gap-3">
              <span class="rounded-md bg-[color:var(--bg-0)] py-1 text-[11px] font-mono-brand text-[color:var(--muted)]">
                {{ spaceUrl }}
              </span>
              <button @click="copySpaceUrl" class="text-sm font-medium hover:underline underline-offset-4 disabled:opacity-50" :disabled="isCopying">
                 {{ copyStatus || 'Copy Link' }}
              </button>
            </div>
            <div v-if="spaceUrl" class="flex items-center gap-2 text-[11px] text-[color:var(--muted)]">
              <span>Upload by email:</span>
              <span class="font-mono-brand text-[color:var(--text)]" aria-label="Email upload address">{{ emailUploadAddress }}</span>
              <button class="text-[11px] font-medium hover:underline underline-offset-4" @click="copyEmailUploadAddress">
                {{ copyEmailStatus || 'Copy' }}
              </button>
            </div>
          </div>
        </div>
        <div v-if="qrCodeDataUrl" class="hidden lg:block absolute top-6 md:top-12 right-6">
          <img :src="qrCodeDataUrl" alt="QR code for share link" :width="QR_CODE_SIZE" :height="QR_CODE_SIZE" class="rounded bg-white">
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
            <div v-if="isUploading" class="absolute inset-0 flex flex-col items-center justify-center bg-[color:var(--card)]/90 backdrop-blur-sm">
              <div class="mb-2 text-sm font-medium">Uploading... {{ uploadProgress.toFixed(0) }}%</div>
              <div v-if="uploadSpeed > 0" class="text-[11px] text-[color:var(--muted)]">{{ formatBytes(uploadSpeed) }}/s</div>
            </div>
          </div>
          <p v-if="uploadError" class="mt-3 text-sm text-[color:var(--danger)]">{{ uploadError }}</p>
        </div>

       <!-- File List (Right columns) -->
       <div :class="showUploadArea ? 'order-2 lg:order-1 lg:col-span-2' : 'order-2 lg:order-1 lg:col-span-1'">
          <div class="mb-4 flex items-center justify-between border-b border-[color:var(--border)] pb-2">
            <h2 class="text-sm font-medium text-[color:var(--text)]">Shared Files</h2>
            <div class="flex items-center gap-2">
              <button
                class="rounded border border-[color:var(--border)] px-2.5 py-1 text-[12px] font-semibold text-[color:var(--muted)] transition-colors hover:border-[color:var(--text)] hover:bg-[color:var(--bg-0)] hover:text-[color:var(--text)] disabled:opacity-50"
                :disabled="isRefreshingFiles || isLoading"
                @click="refreshFilesNow"
              >
                {{ isRefreshingFiles ? 'Refreshing…' : 'Refresh' }}
              </button>
              <button
                v-if="hasFiles && !isUploadPanelOpen"
                class="rounded border border-[color:var(--border)] px-2.5 py-1 text-[12px] font-semibold text-[color:var(--muted)] transition-colors hover:border-[color:var(--text)] hover:bg-[color:var(--bg-0)] hover:text-[color:var(--text)]"
                @click="openUploadPanel"
              >
                Upload Files
              </button>
            </div>
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
