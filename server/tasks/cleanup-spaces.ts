import { defineTask } from 'nitropack/runtime/task'
import { listExpiredSpaceSlugs, removeSpace } from '../utils/spaces'

export default defineTask({
  meta: {
    name: 'cleanup-spaces',
    description: 'Delete expired spaces and their files from R2'
  },
  async run({ context }) {
    const bucket = context.cloudflare?.env?.ONEDROP_BUCKET ?? (globalThis as any).ONEDROP_BUCKET

    if (!bucket) {
      return { result: 'R2 bucket not configured' }
    }

    const expiredSlugs = await listExpiredSpaceSlugs(bucket)
    await Promise.all(expiredSlugs.map((slug) => removeSpace(bucket, slug)))

    return {
      result: `Deleted ${expiredSlugs.length} expired spaces`
    }
  }
})
