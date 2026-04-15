export function formatDateTime(time: number | string | Date): string {
  const date = new Date(time)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${month}-${day} ${hours}:${minutes}`
}

export function formatTimeWithRelative(time: number | string | Date): string {
  const date = new Date(time)
  const ts = date.getTime()
  const diff = ts - Date.now()
  const abs = Math.abs(diff)
  const minutes = Math.round(abs / (1000 * 60))
  
  let rel = ''
  if (minutes < 1) {
    rel = diff >= 0 ? 'in moments' : 'just now'
  } else if (minutes < 60) {
    rel = diff >= 0 ? `in ${minutes}m` : `${minutes}m ago`
  } else {
    const hours = Math.round(minutes / 60)
    if (hours < 24) {
      rel = diff >= 0 ? `in ${hours}h` : `${hours}h ago`
    } else {
      const days = Math.round(hours / 24)
      rel = diff >= 0 ? `in ${days}d` : `${days}d ago`
    }
  }

  const absolute = formatDateTime(date)
  
  return `${rel} (${absolute})`
}
