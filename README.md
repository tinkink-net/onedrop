# onedrop

Cloudflare-based temporary file sharing spaces built with Nuxt.

## Features

- No auth, anyone can create or join spaces
- Space slug format: 6 chars using `A-Z` and `2-9` (excluding `I`, `O`, `0`, `1`)
- Upload, list, and download files in a shared space
- Configurable expiration (default 3h, max 24h)
- Uses Cloudflare R2 for files + metadata (no database)
- Scheduled cleanup every 5 minutes via Cloudflare cron

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Cloudflare bindings

Configure `ONEDROP_BUCKET` as an R2 binding (see `wrangler.toml`).
