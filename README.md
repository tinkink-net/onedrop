# onedrop

Cloudflare-based temporary file sharing built with Nuxt.

## Features

- No auth, anyone can start or join a share
- Share code format: 6 chars using `A-Z` and `2-9` (excluding `I`, `O`, `0`, `1`)
- Upload, list, and download files in a shared link
- Ingest files from email sent to `<share-slug>@0x1.one`
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

## Cloudflare Email Routing

- Configure Email Routing so inbound mail to `*@0x1.one` is delivered to this Worker.
- Recipient local-part is treated as the sharing space slug (example: `ABC234@0x1.one`).
- Attachments are stored as files in that space.
- If email body text contains at least 10 characters after trimming, it is stored as a markdown-formatted `.txt` file.
