export interface TrackDraft {
  key: string
  occurrenceId?: string
  source: string
  title: string
  variant: string
  version: string
  disc: string
  number: string
  role: string
  displayTitle: string
  duration: string
}
export function emptyTrackDraft(number: number): TrackDraft {
  return {
    key: globalThis.crypto.randomUUID(),
    source: 'new',
    title: '',
    variant: '',
    version: '',
    disc: '1',
    number: String(number),
    role: 'standard',
    displayTitle: '',
    duration: '',
  }
}
export const contentLabels: Record<string, string> = {
  standard: 'Estándar',
  bonus: 'Bonus',
  alternate: 'Alternativa',
  other: 'Otro',
}

export function formatDuration(milliseconds: number | undefined): string {
  if (milliseconds === undefined) return ''
  const minutes = Math.floor(milliseconds / 60000)
  const seconds = Math.floor((milliseconds % 60000) / 1000)
  const fraction = String(milliseconds % 1000)
    .padStart(3, '0')
    .replace(/0+$/, '')
  return `${minutes}:${String(seconds).padStart(2, '0')}${fraction ? `.${fraction}` : ''}`
}

export function parseDuration(value: string): number {
  const match = /^(\d+):([0-5]\d)(?:\.(\d{1,3}))?$/.exec(value.trim())
  if (!match) return NaN
  return (
    Number(match[1]) * 60000 +
    Number(match[2]) * 1000 +
    Number((match[3] ?? '').padEnd(3, '0'))
  )
}
