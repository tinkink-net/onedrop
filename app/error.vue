<script setup lang="ts">
const props = defineProps<{ error: { statusCode: number; statusMessage?: string } }>()

const title = computed(() => {
  if (props.error.statusCode === 404) {
    return 'Nothing here'
  }

  return 'Something went wrong'
})

const description = computed(() => {
  if (props.error.statusCode === 404) {
    return 'This share does not exist or has expired.'
  }

  return props.error.statusMessage || 'Please try again later.'
})
</script>

<template>
  <main class="relative mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center px-6 py-12 md:py-20 text-[color:var(--text)] flex-1">
    <header class="mb-10">
      <div class="flex items-center gap-3">
        <div class="h-3 w-3 bg-[#111] rounded-sm" />
        <p class="font-mono-brand text-[11px] font-semibold tracking-widest text-[#111]">0X1.ONE</p>
      </div>
      <h1 class="mt-8 text-4xl font-medium tracking-tight md:text-5xl">{{ title }}</h1>
      <p class="mt-5 max-w-xl text-[15px] leading-relaxed text-[#555]">{{ description }}</p>
    </header>

    <div class="flex flex-wrap items-center gap-6">
      <NuxtLink
        to="/"
        class="bg-[color:var(--primary)] px-7 py-3.5 text-sm font-medium text-white transition-colors hover:bg-[color:var(--primary-hover)]"
      >
        Start a share
      </NuxtLink>
      <a
        href="/llms.txt"
        class="text-[13px] font-medium text-[color:var(--muted)] transition-colors hover:text-[color:var(--text)] underline decoration-[color:var(--border)] underline-offset-4"
      >
        For agents →
      </a>
    </div>
  </main>
</template>
