import PostalMime, { decodeWords } from 'postal-mime'
import { assertValidSlug, getFileObjectKey, getSpaceMeta, sanitizeFilename, saveSpaceFileMeta } from '../utils/spaces'

type CloudflareEmailHookPayload = {
  message: any
  env: any
}

const MIN_BODY_TEXT_LENGTH = 10

function createFileKey() {
  return crypto.randomUUID()
}

function toArrayBuffer(content: ArrayBuffer | Uint8Array | string) {
  if (typeof content === 'string') {
    return new TextEncoder().encode(content).buffer
  }

  if (content instanceof Uint8Array) {
    return content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength)
  }

  return content
}

function normalizeEmailTextContent(text?: string, html?: string) {
  const fallbackText = html
    ? html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
    : ''

  return (text ?? fallbackText).trim()
}

function decodeLatin1Mojibake(value: string) {
  if (!/^[\u0000-\u00FF]+$/.test(value) || !/[\u0080-\u00FF]/.test(value)) {
    return value
  }

  try {
    const bytes = new Uint8Array(value.length)
    for (let charIndex = 0; charIndex < value.length; charIndex++) {
      bytes[charIndex] = value.charCodeAt(charIndex)
    }
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes).trim()
    return decoded || value
  }
  catch {
    return value
  }
}

function decodeAttachmentFilename(rawFilename?: string | null) {
  const source = (rawFilename || '').trim()
  if (!source) {
    return null
  }

  let decoded = source

  try {
    decoded = decodeWords(decoded)
  }
  catch {}

  const rfc5987 = decoded.match(/^[A-Za-z0-9_-]+'[^']*'(.+)$/)
  if (rfc5987) {
    try {
      decoded = decodeURIComponent(rfc5987[1])
    }
    catch {}
  }
  else if (/%[0-9A-Fa-f]{2}/.test(decoded)) {
    try {
      decoded = decodeURIComponent(decoded)
    }
    catch {}
  }

  return decodeLatin1Mojibake(decoded)
}

function getSpaceSlugFromRecipient(to: string) {
  const trimmed = (to || '').trim().toLowerCase()
  const [localPart, domain] = trimmed.split('@')

  if (!localPart || domain !== '0x1.one') {
    return null
  }

  return assertValidSlug(localPart)
}

async function storeFileInSpace(bucket: any, slug: string, filename: string, contentType: string, content: ArrayBuffer) {
  const key = createFileKey()
  const uploadedAt = new Date().toISOString()

  await bucket.put(getFileObjectKey(slug, key), content, {
    httpMetadata: {
      contentType: contentType || 'application/octet-stream'
    },
    customMetadata: {
      name: filename,
      uploadedAt
    }
  })

  await saveSpaceFileMeta(bucket, slug, key, {
    name: filename,
    uploadedAt
  })
}

function formatEmailAsMarkdown(payload: { subject?: string, from?: string, to?: string, body: string }) {
  const subject = payload.subject?.trim() || '(no subject)'
  const from = payload.from?.trim() || '(unknown sender)'
  const to = payload.to?.trim() || '(unknown recipient)'

  return [
    `# ${subject}`,
    '',
    `- From: ${from}`,
    `- To: ${to}`,
    `- Received: ${new Date().toISOString()}`,
    '',
    '---',
    '',
    payload.body
  ].join('\n')
}

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('cloudflare:email', async ({ message, env }: CloudflareEmailHookPayload) => {
    const slug = getSpaceSlugFromRecipient(message?.to || '')
    if (!slug) {
      message?.setReject?.('Invalid recipient. Use share-slug@0x1.one format.')
      return
    }

    const bucket = env?.ONEDROP_BUCKET
    if (!bucket) {
      message?.setReject?.('Storage is not configured.')
      return
    }

    const spaceMeta = await getSpaceMeta(bucket, slug)
    if (!spaceMeta) {
      message?.setReject?.('Share not found.')
      return
    }
    if (spaceMeta.expiresAt <= Date.now()) {
      message?.setReject?.('Share has expired.')
      return
    }

    const parsedEmail = await PostalMime.parse(message.raw)
    const attachments = parsedEmail.attachments || []

    for (const attachment of attachments) {
      const decodedAttachmentName = decodeAttachmentFilename(attachment.filename)
      const baseName = decodedAttachmentName || `attachment-${crypto.randomUUID()}.dat`
      const filename = sanitizeFilename(baseName)
      const contentType = attachment.mimeType || 'application/octet-stream'
      const content = toArrayBuffer(attachment.content as ArrayBuffer | Uint8Array | string)

      await storeFileInSpace(bucket, slug, filename, contentType, content)
    }

    const normalizedBodyText = normalizeEmailTextContent(parsedEmail.text, parsedEmail.html)
    if (normalizedBodyText.length >= MIN_BODY_TEXT_LENGTH) {
      const markdownText = formatEmailAsMarkdown({
        subject: parsedEmail.subject,
        from: message?.from,
        to: message?.to,
        body: normalizedBodyText
      })

      const bodyFilenameBase = parsedEmail.subject
        ? `email-${crypto.randomUUID()}-${parsedEmail.subject}.txt`
        : `email-${crypto.randomUUID()}.txt`
      const bodyFilename = sanitizeFilename(bodyFilenameBase)
      const content = new TextEncoder().encode(markdownText).buffer
      await storeFileInSpace(bucket, slug, bodyFilename, 'text/plain; charset=utf-8', content)
    }
  })
})
