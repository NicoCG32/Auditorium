import type { ListeningStatus } from '../../domain/library/schemas'

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
