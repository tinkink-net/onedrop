<script setup lang="ts">
const slugInput = ref('')
const hours = ref(3)
const isCreating = ref(false)
const createdUrl = ref('')
const errorMessage = ref('')

function normalizeInputSlug(value: string) {
  return value.trim().toUpperCase()
}

async function createSpace() {
  isCreating.value = true
  createdUrl.value = ''
  errorMessage.value = ''

  try {
    const response = await $fetch<{ url: string; slug: string; expiresInHours: number }>('/api/spaces/create', {
      method: 'POST',
      body: {
        expiresInHours: hours.value
      }
    })

    createdUrl.value = response.url
  }
  catch (error: any) {
    errorMessage.value = error?.data?.statusMessage || 'Failed to create space.'
  }
  finally {
    isCreating.value = false
  }
}

function joinSpace() {
  const slug = normalizeInputSlug(slugInput.value)
  if (!slug) {
    return
  }

  navigateTo(`/${slug}`)
}
</script>

<template>
  <main class="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center px-6 py-16">
    <div class="space-y-4">
      <p class="text-sm uppercase tracking-[0.2em] text-zinc-500">OneDrop</p>
      <h1 class="text-4xl font-semibold tracking-tight text-zinc-900">Temporary file sharing spaces</h1>
      <p class="max-w-xl text-zinc-600">Create a short-lived space, share the link, and upload files with no user account.</p>
    </div>

    <div class="mt-10 grid gap-6 md:grid-cols-2">
      <section class="rounded-xl border border-zinc-200 bg-white p-6">
        <h2 class="text-lg font-medium">Create a space</h2>
        <p class="mt-1 text-sm text-zinc-600">Default expiry is 3 hours, up to 24 hours.</p>

        <label class="mt-4 block text-sm font-medium text-zinc-700" for="hours">Expires in (hours)</label>
        <input
          id="hours"
          v-model.number="hours"
          type="number"
          min="1"
          max="24"
          class="mt-2 w-full rounded-lg border border-zinc-300 px-3 py-2 outline-none ring-zinc-900/10 focus:ring"
        >

        <button
          class="mt-4 inline-flex w-full items-center justify-center rounded-lg bg-zinc-900 px-4 py-2 font-medium text-white transition hover:bg-zinc-800 disabled:opacity-60"
          :disabled="isCreating"
          @click="createSpace"
        >
          {{ isCreating ? 'Creating…' : 'Create space' }}
        </button>

        <p v-if="createdUrl" class="mt-4 break-all rounded-lg bg-zinc-100 p-3 text-sm text-zinc-700">{{ createdUrl }}</p>
        <p v-if="errorMessage" class="mt-4 text-sm text-red-600">{{ errorMessage }}</p>
      </section>

      <section class="rounded-xl border border-zinc-200 bg-white p-6">
        <h2 class="text-lg font-medium">Join a space</h2>
        <p class="mt-1 text-sm text-zinc-600">Enter a 6-character slug to open a shared space.</p>

        <label class="mt-4 block text-sm font-medium text-zinc-700" for="slug">Space slug</label>
        <input
          id="slug"
          v-model="slugInput"
          maxlength="6"
          placeholder="AB2C3D"
          class="mt-2 w-full rounded-lg border border-zinc-300 px-3 py-2 uppercase outline-none ring-zinc-900/10 focus:ring"
          @keyup.enter="joinSpace"
        >

        <button
          class="mt-4 inline-flex w-full items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 py-2 font-medium text-zinc-800 transition hover:bg-zinc-50"
          @click="joinSpace"
        >
          Join space
        </button>
      </section>
    </div>
  </main>
</template>
