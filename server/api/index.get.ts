import { getRequestHeader } from 'h3'

// Agents that reach Onedrop by guessing usually land on /api first.
// A JSON manifest here is cheaper than making them crawl the HTML.
export default defineEventHandler((event) => {
  const host = getRequestHeader(event, 'host')
  const protocol = host?.includes('localhost') ? 'http' : 'https'
  const origin = host ? `${protocol}://${host}` : 'https://0x1.one'

  return {
    service: 'Onedrop',
    description: 'Temporary file sharing. 6-character share codes, no signup, expiring links.',
    docs: `${origin}/llms.txt`,
    openapi: `${origin}/llms.openapi.json`,
    note: 'Read /llms.txt before making requests. The default upload is a single '
      + 'multipart/form-data POST to /api/spaces/{slug}/upload with a "file" field — no chunking. '
      + 'The chunked flow (action=start|part|complete) is only needed for large files and has '
      + 'strict requirements: exactly 5 MiB chunks and a verbatim uploadedAt round-trip.',
    endpoints: [
      { method: 'POST', path: '/api/spaces/create', summary: 'Create a share space' },
      { method: 'POST', path: '/api/spaces/{slug}/upload', summary: 'Upload in one request: multipart/form-data, field "file"' },
      { method: 'POST', path: '/api/spaces/{slug}/upload?action=start|part|complete', summary: 'Chunked upload (5 MiB chunks, large files only)' },
      { method: 'GET', path: '/api/spaces/{slug}', summary: 'List files in a share' },
      { method: 'GET', path: '/api/spaces/{slug}/files/{key}', summary: 'Download a file (GET, not HEAD)' }
    ],
    emailUpload: 'No HTTP endpoint. Mail attachments to <share-slug>@0x1.one instead.'
  }
})
