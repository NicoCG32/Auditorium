export function downloadBackup(text: string, exportedAt: string): void {
  const url = URL.createObjectURL(
    new Blob([text], { type: 'application/json;charset=utf-8' }),
  )
  const link = document.createElement('a')
  link.href = url
  link.download = `auditorium-${exportedAt.replace(/[:.]/g, '-')}.json`
  try {
    document.body.append(link)
    link.click()
  } finally {
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}

export function downloadCompleteBackup(
  bytes: Uint8Array,
  exportedAt: string,
): void {
  const url = URL.createObjectURL(
    new Blob([new Uint8Array(bytes).buffer], { type: 'application/zip' }),
  )
  const link = document.createElement('a')
  link.href = url
  link.download = `auditorium-completo-${exportedAt.replace(/[:.]/g, '-')}.zip`
  try {
    document.body.append(link)
    link.click()
  } finally {
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}
