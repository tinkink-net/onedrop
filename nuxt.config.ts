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
  },
  app: {
    head: {
      title: 'Onedrop - A simple and secure file sharing service',
      meta: [
        { name: 'description', content: 'Onedrop is a simple and secure file sharing service that allows you to share files with anyone, anywhere.' }
      ],
      link: [
        { rel: 'icon', type: 'image/png', href: '/favicon.png' }
      ],
      script: import.meta.env.PROD ? [
        {
          async: true,
          src: 'https://www.googletagmanager.com/gtag/js?id=G-MN31XGPEXK',
        }, {
          innerHTML: `
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());

            gtag('config', 'G-MN31XGPEXK');
          `,
        }
      ]: [],
    }
  }
})
