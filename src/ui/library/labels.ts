import type { ListeningStatus } from '../../domain/library/schemas'
import type { Album } from '../../domain/catalog/schemas'

export const releaseTypeLabels: Record<Album['releaseType'], string> = {
  album: 'Álbum',
  ep: 'EP',
  single: 'Single',
  live: 'En vivo',
  demo: 'Demo',
  compilation: 'Recopilación',
  soundtrack: 'Banda sonora',
  other: 'Otro',
}

export const listeningLabels: Record<ListeningStatus, string> = {
  untracked: 'Sin registrar',
  queued: 'Pendiente',
  in_progress: 'Escuchando',
  completed: 'Escuchado',
}
const scoreFormatter = new Intl.NumberFormat('es', { maximumFractionDigits: 1 })
export function formatScore(score: number) {
  return scoreFormatter.format(score)
}

export function formatCount(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`
}
