<script setup lang="ts">
const route = useRoute()
const slug = computed(() => String(route.params.slug || '').toUpperCase())

const isLoading = ref(true)
const isUploading = ref(false)
const errorMessage = ref('')
const uploadError = ref('')
const selectedFile = ref<File | null>(null)

const space = ref<{
  slug: string
  createdAt: number
  expiresAt: number
  files: Array<{ key: string; name: string; size: number; uploadedAt?: string }>
} | null>(null)

async function loadSpace() {
  isLoading.value = true
  errorMessage.value = ''

  try {
    space.value = await $fetch(`/api/spaces/${slug.value}`)
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

function formatBytes(size: number) {
  if (size < 1024) {
    return `${size} B`
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

onMounted(loadSpace)
</script>

<template>
  <main class="mx-auto min-h-screen w-full max-w-4xl px-6 py-10">
    <NuxtLink to="/" class="text-sm text-zinc-500 hover:text-zinc-900">← Back</NuxtLink>

    <header class="mt-4 rounded-xl border border-zinc-200 bg-white p-6">
      <h1 class="text-2xl font-semibold tracking-tight">Space {{ slug }}</h1>
      <p v-if="space" class="mt-2 text-sm text-zinc-600">Expires at {{ formatTime(space.expiresAt) }}</p>
    </header>

    <section class="mt-6 rounded-xl border border-zinc-200 bg-white p-6">
      <h2 class="text-lg font-medium">Upload file</h2>
      <div class="mt-4 flex flex-col gap-3 md:flex-row md:items-center">
        <input type="file" class="text-sm" @change="onFilePicked">
        <button
          class="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-60"
          :disabled="!selectedFile || isUploading"
          @click="uploadFile"
        >
          {{ isUploading ? 'Uploading…' : 'Upload' }}
        </button>
      </div>
      <p v-if="uploadError" class="mt-3 text-sm text-red-600">{{ uploadError }}</p>
    </section>

    <section class="mt-6 rounded-xl border border-zinc-200 bg-white p-6">
      <h2 class="text-lg font-medium">Files</h2>

      <p v-if="isLoading" class="mt-4 text-sm text-zinc-600">Loading files…</p>
      <p v-else-if="errorMessage" class="mt-4 text-sm text-red-600">{{ errorMessage }}</p>

      <ul v-else-if="space?.files.length" class="mt-4 divide-y divide-zinc-200">
        <li v-for="file in space.files" :key="file.key" class="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
          <div class="min-w-0">
            <p class="truncate font-medium text-zinc-800">{{ file.name }}</p>
            <p class="text-zinc-500">{{ formatBytes(file.size) }}</p>
          </div>
          <a
            class="inline-flex rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
            :href="`/api/spaces/${slug}/files/${file.key}`"
          >
            Download
          </a>
        </li>
      </ul>

      <p v-else class="mt-4 text-sm text-zinc-600">No files uploaded yet.</p>
    </section>
  </main>
</template>
