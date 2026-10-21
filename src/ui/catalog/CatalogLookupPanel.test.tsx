import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import {
  CatalogLookupError,
  type CatalogCandidate,
  type CatalogLookupClient,
} from '../../application/catalog-lookup'
import { CatalogLookupPanel } from './CatalogLookupPanel'

const candidate: CatalogCandidate = {
  id: 'Q900000001',
  title: 'Horizonte ficticio',
  artists: ['Artista ficticio', 'Colaborador ficticio'],
  primaryType: 'full_length',
  categories: [],
  publicationStatus: 'unknown' as const,
  catalogReference: {
    provider: 'wikidata',
    entityId: 'Q900000001',
    retrievedAt: '2026-10-16T00:00:00.000Z',
  },
  coverUrl:
    'https://coverartarchive.org/release-group/00000000-0000-4000-8000-000000000001/front-500',
}

function deferredClient() {
  const pending: Array<(candidates: CatalogCandidate[]) => void> = []
  const search = vi
    .fn<CatalogLookupClient['search']>()
    .mockImplementation(() => new Promise((resolve) => pending.push(resolve)))
  return { client: { search }, search, pending }
}

async function resolvePending(
  resolve: ((candidates: CatalogCandidate[]) => void) | undefined,
  candidates: CatalogCandidate[],
) {
  await act(async () => {
    resolve?.(candidates)
    await Promise.resolve()
  })
}

test('consulta explícita y revisión seleccionan sin guardar ni cargar portadas', async () => {
  const search = vi
    .fn<CatalogLookupClient['search']>()
    .mockResolvedValue([candidate])
  const onSelect = vi.fn()
  render(
    <CatalogLookupPanel
      title="Horizonte ficticio"
      artist="Artista ficticio"
      client={{ search }}
      onSelect={onSelect}
    />,
  )
  expect(search).not.toHaveBeenCalled()
  expect(screen.getByText(/se envía el título/u)).not.toBeVisible()
  fireEvent.click(screen.getByText('Buscar referencia en Wikidata (opcional)'))
  fireEvent.click(screen.getByRole('button', { name: 'Buscar en Wikidata' }))
  await screen.findByRole('button', { name: 'Revisar Horizonte ficticio' })
  expect(onSelect).not.toHaveBeenCalled()
  expect(
    screen.getByText('Artista ficticio · Colaborador ficticio'),
  ).toBeVisible()
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
  expect(
    screen.getByRole('link', { name: /Ver fuente Wikidata/u }),
  ).toHaveAttribute('href', 'https://www.wikidata.org/wiki/Q900000001')
  fireEvent.click(
    screen.getByRole('button', { name: 'Revisar Horizonte ficticio' }),
  )
  expect(onSelect).toHaveBeenCalledExactlyOnceWith(candidate)
})

test('cero coincidencias no declara inexistencia y conserva la opción manual', async () => {
  const search = vi.fn<CatalogLookupClient['search']>().mockResolvedValue([])
  render(
    <CatalogLookupPanel
      title="Horizonte ficticio"
      artist="Artista ficticio"
      client={{ search }}
      onSelect={vi.fn()}
    />,
  )
  fireEvent.click(screen.getByText('Buscar referencia en Wikidata (opcional)'))
  fireEvent.click(screen.getByRole('button', { name: 'Buscar en Wikidata' }))
  await waitFor(() =>
    expect(screen.getByRole('status')).toHaveTextContent(
      'No encontramos referencias en esta consulta',
    ),
  )
  expect(
    screen.getByRole('button', { name: 'Continuar con el registro manual' }),
  ).toBeEnabled()
})

test('una caída del catálogo no bloquea continuar sin referencia ni expone texto remoto', async () => {
  const search = vi
    .fn<CatalogLookupClient['search']>()
    .mockRejectedValue(new Error('contenido remoto desconocido'))
  render(
    <CatalogLookupPanel
      title="Horizonte ficticio"
      artist="Artista ficticio"
      client={{ search }}
      onSelect={vi.fn()}
    />,
  )
  fireEvent.click(screen.getByText('Buscar referencia en Wikidata (opcional)'))
  fireEvent.click(screen.getByRole('button', { name: 'Buscar en Wikidata' }))
  await waitFor(() =>
    expect(screen.getByRole('status')).toHaveTextContent(
      'No pudimos consultar Wikidata',
    ),
  )
  expect(
    screen.queryByText('contenido remoto desconocido'),
  ).not.toBeInTheDocument()
  fireEvent.click(
    screen.getByRole('button', { name: 'Continuar con el registro manual' }),
  )
  expect(screen.getByRole('status')).toHaveTextContent(
    'Puedes continuar con el registro manual',
  )
})

test('muestra la espera del proveedor y permite reintentar explícitamente', async () => {
  const search = vi
    .fn<CatalogLookupClient['search']>()
    .mockRejectedValueOnce(new CatalogLookupError('rate_limited'))
    .mockResolvedValueOnce([candidate])
  render(
    <CatalogLookupPanel
      title="Horizonte ficticio"
      artist="Artista ficticio"
      client={{ search }}
      onSelect={vi.fn()}
    />,
  )
  fireEvent.click(screen.getByText('Buscar referencia en Wikidata (opcional)'))
  fireEvent.click(screen.getByRole('button', { name: 'Buscar en Wikidata' }))
  await waitFor(() =>
    expect(screen.getByRole('status')).toHaveTextContent(
      'Wikidata solicita esperar',
    ),
  )
  expect(search).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByText('Buscar referencia en Wikidata (opcional)'))
  fireEvent.click(screen.getByRole('button', { name: 'Buscar en Wikidata' }))
  await screen.findByRole('button', { name: 'Revisar Horizonte ficticio' })
  expect(search).toHaveBeenCalledTimes(2)
})

test('cancelar invalida una respuesta tardía de un transporte que ignore abort', async () => {
  const { client, search, pending } = deferredClient()
  const onSelect = vi.fn()
  render(
    <CatalogLookupPanel
      title="Horizonte ficticio"
      artist="Artista ficticio"
      client={client}
      onSelect={onSelect}
    />,
  )
  fireEvent.click(screen.getByText('Buscar referencia en Wikidata (opcional)'))
  fireEvent.click(screen.getByRole('button', { name: 'Buscar en Wikidata' }))
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar búsqueda' }))
  expect(search.mock.calls[0]?.[0].signal?.aborted).toBe(true)
  await resolvePending(pending[0], [candidate])
  expect(
    screen.queryByRole('button', { name: 'Revisar Horizonte ficticio' }),
  ).not.toBeInTheDocument()
  expect(onSelect).not.toHaveBeenCalled()
})

test('cambiar título o artista descarta resultados anteriores y permite una nueva consulta', async () => {
  const { client, search, pending } = deferredClient()
  const onSelect = vi.fn()
  const view = render(
    <CatalogLookupPanel
      title="Horizonte ficticio"
      artist="Artista ficticio"
      client={client}
      onSelect={onSelect}
    />,
  )
  fireEvent.click(screen.getByText('Buscar referencia en Wikidata (opcional)'))
  fireEvent.click(screen.getByRole('button', { name: 'Buscar en Wikidata' }))
  view.rerender(
    <CatalogLookupPanel
      title="Otro horizonte ficticio"
      artist="Otro artista ficticio"
      client={client}
      onSelect={onSelect}
    />,
  )
  expect(search.mock.calls[0]?.[0].signal?.aborted).toBe(true)
  fireEvent.click(screen.getByText('Buscar referencia en Wikidata (opcional)'))
  fireEvent.click(screen.getByRole('button', { name: 'Buscar en Wikidata' }))
  await resolvePending(pending[0], [candidate])
  expect(
    screen.queryByRole('button', { name: 'Revisar Horizonte ficticio' }),
  ).not.toBeInTheDocument()
  await resolvePending(pending[1], [])
  expect(screen.getByRole('status')).toHaveTextContent(
    'No encontramos referencias',
  )
  expect(onSelect).not.toHaveBeenCalled()
})

test('desmontar cancela la consulta y no selecciona su respuesta tardía', async () => {
  const { client, search, pending } = deferredClient()
  const onSelect = vi.fn()
  const view = render(
    <CatalogLookupPanel
      title="Horizonte ficticio"
      artist="Artista ficticio"
      client={client}
      onSelect={onSelect}
    />,
  )
  fireEvent.click(screen.getByText('Buscar referencia en Wikidata (opcional)'))
  fireEvent.click(screen.getByRole('button', { name: 'Buscar en Wikidata' }))
  view.unmount()
  expect(search.mock.calls[0]?.[0].signal?.aborted).toBe(true)
  await resolvePending(pending[0], [candidate])
  expect(onSelect).not.toHaveBeenCalled()
})

test('artista discordante y advertencias requieren revisión visible', async () => {
  const search = vi
    .fn<CatalogLookupClient['search']>()
    .mockResolvedValue([
      { ...candidate, warnings: ['La fecha necesita revisión manual.'] },
    ])
  render(
    <CatalogLookupPanel
      title="Horizonte ficticio"
      artist="Otro artista ficticio"
      client={{ search }}
      onSelect={vi.fn()}
    />,
  )
  fireEvent.click(screen.getByText('Buscar referencia en Wikidata (opcional)'))
  fireEvent.click(screen.getByRole('button', { name: 'Buscar en Wikidata' }))
  await screen.findByRole('button', { name: 'Revisar Horizonte ficticio' })
  expect(screen.getByText(/El artista no coincide/u)).toBeVisible()
  expect(screen.getByText('La fecha necesita revisión manual.')).toBeVisible()
})

test('deshabilitar cancela una búsqueda y al habilitar se puede consultar de nuevo', async () => {
  const { client, search, pending } = deferredClient()
  const props = {
    title: 'Horizonte ficticio',
    artist: 'Artista ficticio',
    client,
    onSelect: vi.fn(),
  }
  const view = render(<CatalogLookupPanel {...props} />)
  fireEvent.click(screen.getByText('Buscar referencia en Wikidata (opcional)'))
  fireEvent.click(screen.getByRole('button', { name: 'Buscar en Wikidata' }))
  view.rerender(<CatalogLookupPanel {...props} disabled />)
  expect(search.mock.calls[0]?.[0].signal?.aborted).toBe(true)
  expect(
    screen.getByRole('button', { name: 'Buscar en Wikidata' }),
  ).toBeDisabled()
  await resolvePending(pending[0], [candidate])
  view.rerender(<CatalogLookupPanel {...props} />)
  expect(
    screen.getByRole('button', { name: 'Buscar en Wikidata' }),
  ).toBeEnabled()
  fireEvent.click(screen.getByText('Buscar referencia en Wikidata (opcional)'))
  fireEvent.click(screen.getByRole('button', { name: 'Buscar en Wikidata' }))
  await resolvePending(pending[1], [])
  expect(search).toHaveBeenCalledTimes(2)
  expect(screen.getByRole('status')).toHaveTextContent(
    'No encontramos referencias',
  )
  expect(props.onSelect).not.toHaveBeenCalled()
})
