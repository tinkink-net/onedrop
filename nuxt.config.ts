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
    },
    routeRules: {
      // Point AI agents at the machine-readable docs from every response.
      // This survives HTML truncation, summarisation and CSS stripping.
      '/**': {
        headers: {
          Link: '</llms.txt>; rel="alternate"; type="text/markdown"; title="For agents"'
        }
      },
      '/llms.txt': {
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8'
        }
      },
      // The names agents actually probe. One spec file, many front doors.
      '/.well-known/llms.txt': { redirect: { to: '/llms.txt', statusCode: 308 } },
      '/.well-known/ai.txt': { redirect: { to: '/llms.txt', statusCode: 308 } },
      '/llms-full.txt': { redirect: { to: '/llms.txt', statusCode: 308 } },
      '/agents.md': { redirect: { to: '/llms.txt', statusCode: 308 } },
      '/openapi.json': { redirect: { to: '/llms.openapi.json', statusCode: 308 } },
      '/.well-known/openapi.json': { redirect: { to: '/llms.openapi.json', statusCode: 308 } },
      '/llms.openapi.json': {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': '*'
        }
      }
    }
  },
  app: {
    head: {
      title: 'Onedrop - Share files without friction',
      meta: [
        { name: 'description', content: 'Onedrop is a simple and secure file sharing service that allows you to share files with anyone, anywhere.' }
      ],
      link: [
        { rel: 'icon', type: 'image/png', href: '/favicon.png' },
        { rel: 'alternate', type: 'text/markdown', href: '/llms.txt', title: 'For agents' },
        { rel: 'alternate', type: 'application/json', href: '/llms.openapi.json', title: 'OpenAPI spec' }
      ],
      script: process.env.NODE_ENV === 'production' ? [
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
