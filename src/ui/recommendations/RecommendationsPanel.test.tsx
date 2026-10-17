import { useState } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import type { LibraryAlbum } from '../../application/library-query'
import type {
  Recommendation,
  RecommendationProvider,
} from '../../application/recommendations'
import {
  RecommendationRequestError,
  requestRecommendations,
} from '../../infrastructure/ai/recommendation-client'
import { RecommendationsPanel } from './RecommendationsPanel'

const albums: LibraryAlbum[] = [
  {
    id: 'entry-private-one',
    albumId: 'album-private-one',
    title: 'Horizonte ficticio',
    artist: 'Artista ficticio',
    searchText: 'horizonte ficticio artista ficticio',
    listeningStatus: 'queued',
    addedAt: '2026-10-16T01:02:03.000Z',
    originalYear: 2020,
    score: 7.5,
  },
]

const result: Recommendation[] = [
  {
    entryId: albums[0]!.id,
    reason: 'Pendiente reciente que puedes volver a escuchar.',
    action: 'relisten',
  },
]

function Harness({
  request,
  onOpenAlbum = vi.fn(),
  onClose = vi.fn(),
}: {
  request: typeof requestRecommendations
  onOpenAlbum?: (id: string) => void
  onClose?: () => void
}) {
  const [apiKey, setKey] = useState('clave-ficticia-solo-pruebas')
  const [provider, setProvider] = useState<RecommendationProvider>('groq')
  return (
    <RecommendationsPanel
      albums={albums}
      provider={provider}
      apiKey={apiKey}
      onProviderChange={(value) => {
        setProvider(value)
        setKey('')
      }}
      onKeyChange={setKey}
      onOpenAlbum={onOpenAlbum}
      onClose={onClose}
      request={request}
    />
  )
}

function deferredRequest() {
  const pending: Array<(items: Recommendation[]) => void> = []
  const request = vi
    .fn<typeof requestRecommendations>()
    .mockImplementation(() => new Promise((resolve) => pending.push(resolve)))
  return { request, pending }
}

function acceptAndGenerate() {
  fireEvent.click(
    screen.getByRole('checkbox', { name: /Acepto enviar estos datos/u }),
  )
  fireEvent.click(
    screen.getByRole('button', { name: 'Generar recomendaciones' }),
  )
}

afterEach(() => vi.restoreAllMocks())

test('muestra datos acotados y exige una acción explícita con consentimiento', async () => {
  const request = vi
    .fn<typeof requestRecommendations>()
    .mockResolvedValue(result)
  const onOpenAlbum = vi.fn()
  const storage = vi.spyOn(Storage.prototype, 'setItem')
  render(<Harness request={request} onOpenAlbum={onOpenAlbum} />)
  expect(request).not.toHaveBeenCalled()
  expect(
    screen.getByRole('button', { name: 'Generar recomendaciones' }),
  ).toBeDisabled()
  expect(screen.getByLabelText('Clave API de Groq')).toHaveAttribute(
    'type',
    'password',
  )
  expect(screen.getByLabelText('Clave API de Groq')).toHaveAttribute(
    'autocomplete',
    'off',
  )
  fireEvent.click(screen.getByText('Revisar el álbum que se enviará'))
  expect(screen.getByText(/Puntuación: 7,5\/10/u)).toBeVisible()
  expect(document.body.textContent).not.toContain('entry-private-one')
  expect(document.body.textContent).not.toContain('2026-10-16T01:02:03')
  acceptAndGenerate()
  await screen.findByRole('list', { name: 'Orden recomendado' })
  expect(request).toHaveBeenCalledTimes(1)
  expect(request.mock.calls[0]![0]).toMatchObject({
    provider: 'groq',
    apiKey: 'clave-ficticia-solo-pruebas',
    context: { recentReferences: ['a1'] },
  })
  expect(screen.getByText(result[0]!.reason)).toBeVisible()
  expect(onOpenAlbum).not.toHaveBeenCalled()
  fireEvent.click(
    screen.getByRole('button', { name: 'Abrir álbum Horizonte ficticio' }),
  )
  expect(onOpenAlbum).toHaveBeenCalledExactlyOnceWith('entry-private-one')
  expect(storage).not.toHaveBeenCalled()
})

test('cancelar aborta y descarta una respuesta tardía sin reintentar', async () => {
  const { request, pending } = deferredRequest()
  render(<Harness request={request} />)
  acceptAndGenerate()
  expect(
    screen.getByRole('button', { name: 'Generar recomendaciones' }),
  ).toBeDisabled()
  const signal = request.mock.calls[0]![0].signal!
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar solicitud' }))
  expect(signal.aborted).toBe(true)
  await act(async () => {
    pending[0]!(result)
    await Promise.resolve()
  })
  expect(
    screen.queryByRole('list', { name: 'Orden recomendado' }),
  ).not.toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('Solicitud cancelada')
  expect(request).toHaveBeenCalledTimes(1)
})

test('olvidar elimina la clave, cancela y requiere un nuevo consentimiento', async () => {
  const { request, pending } = deferredRequest()
  render(<Harness request={request} />)
  acceptAndGenerate()
  const signal = request.mock.calls[0]![0].signal!
  fireEvent.click(screen.getByRole('button', { name: 'Olvidar clave' }))
  expect(signal.aborted).toBe(true)
  expect(screen.getByLabelText('Clave API de Groq')).toHaveValue('')
  expect(screen.getByRole('checkbox')).not.toBeChecked()
  await act(async () => {
    pending[0]!(result)
    await Promise.resolve()
  })
  expect(
    screen.queryByRole('list', { name: 'Orden recomendado' }),
  ).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Clave API de Groq'), {
    target: { value: 'otra-clave-ficticia' },
  })
  expect(
    screen.getByRole('button', { name: 'Generar recomendaciones' }),
  ).toBeDisabled()
})

test('editar clave invalida resultados y el transporte anterior', async () => {
  const { request, pending } = deferredRequest()
  render(<Harness request={request} />)
  acceptAndGenerate()
  const signal = request.mock.calls[0]![0].signal!
  fireEvent.change(screen.getByLabelText('Clave API de Groq'), {
    target: { value: 'clave-nueva-ficticia' },
  })
  expect(signal.aborted).toBe(true)
  await act(async () => {
    pending[0]!(result)
    await Promise.resolve()
  })
  expect(
    screen.queryByRole('list', { name: 'Orden recomendado' }),
  ).not.toBeInTheDocument()
  expect(screen.getByRole('checkbox')).not.toBeChecked()
})

test('cambiar de proveedor cancela, olvida la clave y explica Gemini gratuito', async () => {
  const { request, pending } = deferredRequest()
  render(<Harness request={request} />)
  acceptAndGenerate()
  const signal = request.mock.calls[0]![0].signal!
  fireEvent.change(screen.getByRole('combobox', { name: 'Proveedor' }), {
    target: { value: 'gemini' },
  })
  expect(signal.aborted).toBe(true)
  expect(screen.getByLabelText('Clave API de Gemini')).toHaveValue('')
  expect(screen.getByRole('checkbox')).not.toBeChecked()
  expect(screen.getByText(/revisión humana/u)).toBeVisible()
  expect(
    screen.getByRole('link', { name: 'Privacidad de Gemini' }),
  ).toHaveAttribute('href', 'https://ai.google.dev/gemini-api/terms')
  await act(async () => {
    pending[0]!(result)
    await Promise.resolve()
  })
  expect(
    screen.queryByRole('list', { name: 'Orden recomendado' }),
  ).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Clave API de Gemini'), {
    target: { value: 'clave-gemini-ficticia' },
  })
  acceptAndGenerate()
  expect(request.mock.calls[1]![0].provider).toBe('gemini')
})

test('cerrar o desmontar aborta sin aceptar una respuesta posterior', async () => {
  const { request, pending } = deferredRequest()
  const onClose = vi.fn()
  const view = render(<Harness request={request} onClose={onClose} />)
  acceptAndGenerate()
  const signal = request.mock.calls[0]![0].signal!
  fireEvent.click(
    screen.getByRole('button', { name: 'Volver a la biblioteca' }),
  )
  expect(signal.aborted).toBe(true)
  expect(onClose).toHaveBeenCalledOnce()
  await act(async () => {
    pending[0]!(result)
    await Promise.resolve()
  })
  expect(
    screen.queryByRole('list', { name: 'Orden recomendado' }),
  ).not.toBeInTheDocument()
  fireEvent.click(
    screen.getByRole('button', { name: 'Generar recomendaciones' }),
  )
  const secondSignal = request.mock.calls[1]![0].signal!
  view.unmount()
  expect(secondSignal.aborted).toBe(true)
  await act(async () => {
    pending[1]!(result)
    await Promise.resolve()
  })
  expect(request).toHaveBeenCalledTimes(2)
})

test.each([
  'invalid_key',
  'quota',
  'offline',
  'timeout',
  'invalid_response',
] as const)(
  'presenta error propio %s sin exponer errores remotos ni repetir llamadas',
  async (code) => {
    const error = new RecommendationRequestError(code)
    error.message = 'clave-o-contenido-remoto-que-no-debe-mostrarse'
    const request = vi
      .fn<typeof requestRecommendations>()
      .mockRejectedValue(error)
    render(<Harness request={request} />)
    acceptAndGenerate()
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        new RecommendationRequestError(code).message,
      ),
    )
    expect(document.body.textContent).not.toContain(error.message)
    expect(request).toHaveBeenCalledTimes(1)
    expect(
      screen.getByRole('button', { name: 'Generar recomendaciones' }),
    ).toBeEnabled()
  },
)

test('un error desconocido se muestra sin su contenido remoto', async () => {
  const request = vi
    .fn<typeof requestRecommendations>()
    .mockRejectedValue(new Error('clave-remota-ficticia'))
  render(<Harness request={request} />)
  acceptAndGenerate()
  await waitFor(() =>
    expect(screen.getByRole('status')).toHaveTextContent(
      'No pudimos obtener recomendaciones',
    ),
  )
  expect(document.body.textContent).not.toContain('clave-remota-ficticia')
})

test('sin álbumes no inicia llamadas ni ofrece enviar un contexto vacío', () => {
  const request = vi.fn<typeof requestRecommendations>()
  render(
    <RecommendationsPanel
      albums={[]}
      provider="groq"
      apiKey="clave-ficticia"
      onProviderChange={vi.fn()}
      onKeyChange={vi.fn()}
      onOpenAlbum={vi.fn()}
      onClose={vi.fn()}
      request={request}
    />,
  )
  expect(screen.getByText(/Guarda algún álbum/u)).toBeVisible()
  expect(
    screen.queryByRole('button', { name: 'Generar recomendaciones' }),
  ).not.toBeInTheDocument()
  expect(request).not.toHaveBeenCalled()
})
