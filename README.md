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
- [`/llms.txt`](public/llms.txt) — machine-readable protocol for AI agents
- [`/llms.openapi.json`](public/llms.openapi.json) — OpenAPI 3.1 spec

## Agent discovery

AI agents should be able to find the machine-readable docs without being told
where they are. Every response carries a `Link: </llms.txt>` header, and the
following all resolve:

| Path | Result |
| --- | --- |
| `/llms.txt` | Protocol guide (served as `text/markdown`) |
| `/llms.openapi.json` | OpenAPI 3.1 spec |
| `/api` | JSON index pointing at both |
| `/.well-known/llms.txt`, `/.well-known/ai.txt`, `/llms-full.txt`, `/agents.md` | 308 → `/llms.txt` |
| `/openapi.json`, `/.well-known/openapi.json` | 308 → `/llms.openapi.json` |

`robots.txt` and `sitemap.xml` both reference `llms.txt`. Single-segment paths
that are not valid share codes return a real 404 instead of rendering the share
page with HTTP 200.

## Upload modes

- **Simple (default):** `POST /api/spaces/{slug}/upload` with
  `multipart/form-data` field `file`. One request.
- **Chunked:** `?action=start|part|complete`, required only for large files.
  Chunks must be exactly 5 MiB and `uploadedAt` must round-trip verbatim.

Email upload has no HTTP endpoint — it runs through Cloudflare Email Routing
(`<share-slug>@0x1.one`).

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
