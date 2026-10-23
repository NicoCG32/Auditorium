import { expect, test } from 'vitest'
import { releaseLabels } from './release-labels'
import { fixtureId, ids } from '../../domain/catalog/catalog.fixture'

test('etiquetas coincidentes se distinguen sin mostrar identificadores técnicos', () => {
  const releases = [1, 2].map((n) => ({
    id: fixtureId(n),
    albumId: ids.album,
    format: 'digital' as const,
    editionLabel: 'Deluxe',
    releaseYear: 2026,
  }))
  const labels = [...releaseLabels(releases).values()]
  expect(labels).toEqual([
    'Deluxe · Digital · 2026 · Edición 1',
    'Deluxe · Digital · 2026 · Edición 2',
  ])
})
