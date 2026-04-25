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
const QR_CODE_SIZE = 224

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

const uploadProgress = ref(0)
const uploadSpeed = ref(0)

const space = ref<SpaceData | null>(null)
const qrCodeDataUrl = ref('')
const qrCodeToDataURL = ref<((text: string, options?: any) => Promise<string>) | null>(null)
const stopQrCodeWatch = ref<(() => void) | null>(null)

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
    const statusCode = error?.statusCode ?? error?.data?.statusCode
    if (typeof statusCode === 'number' && REDIRECT_HOME_STATUS_CODES.has(statusCode)) {
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

async function updateQrCode(value: string) {
  if (!value || !qrCodeToDataURL.value) {
    qrCodeDataUrl.value = ''
    return
  }

  try {
    qrCodeDataUrl.value = await qrCodeToDataURL.value(value, {
      width: QR_CODE_SIZE,
      margin: 1,
      color: {
        dark: '#111827',
        light: 'transparent'
      }
    })
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
    await loadSpace()
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

onMounted(() => {
  stopQrCodeWatch.value = watch(spaceUrl, async (value) => {
    await updateQrCode(value)
  })

  loadSpace()

  void (async () => {
    try {
      const qrcodeModule = await import('qrcode')
      const toDataURL = (qrcodeModule as any).toDataURL ?? (qrcodeModule as any).default?.toDataURL

      if (typeof toDataURL === 'function') {
        qrCodeToDataURL.value = toDataURL
        await updateQrCode(spaceUrl.value)
      }
    }
    catch {
      qrCodeDataUrl.value = ''
    }
  })()
})

onUnmounted(() => {
  stopQrCodeWatch.value?.()
  stopQrCodeWatch.value = null
})
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
      <div class="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
        <div>
           <p class="font-mono-brand text-[11px] uppercase tracking-widest text-[color:var(--muted)]">Share code</p>
           <h1 class="mt-2 text-5xl font-medium tracking-tight">{{ slug }}</h1>
        </div>
        <div v-if="spaceUrl" class="flex flex-col items-start gap-4 md:items-end">
          <div class="flex items-center gap-3">
            <span class="rounded-md bg-[color:var(--bg-0)] px-3 py-1 text-[11px] font-mono-brand text-[color:var(--muted)] md:inline-flex">
              {{ spaceUrl }}
            </span>
            <button @click="copySpaceUrl" class="text-sm font-medium hover:underline underline-offset-4 disabled:opacity-50" :disabled="isCopying">
               {{ copyStatus || 'Copy Link' }}
            </button>
          </div>
          <div v-if="qrCodeDataUrl" class="hidden lg:flex flex-col items-center gap-2 rounded-lg border border-[color:var(--border)] bg-[color:var(--bg-0)] p-3">
            <p id="share-qr-label" class="font-mono-brand text-[10px] uppercase tracking-widest text-[color:var(--muted)]">Scan to open</p>
            <img :src="qrCodeDataUrl" alt="QR code for share link" aria-labelledby="share-qr-label" :width="QR_CODE_SIZE" :height="QR_CODE_SIZE" class="rounded bg-white p-2">
          </div>
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
