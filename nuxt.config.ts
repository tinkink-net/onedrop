// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@nuxtjs/tailwindcss'],
  css: ['~/assets/css/main.css'],
  nitro: {
    preset: 'cloudflare_module',
    experimental: {
      tasks: true
    },
    scheduledTasks: {
      '*/5 * * * *': ['cleanup-spaces']
    }
  }
})
