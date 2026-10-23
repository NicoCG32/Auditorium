import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { PersonalAlbumLinks } from './PersonalAlbumLinks'
import {
  connectYouTubePlayer,
  type YouTubeEvents,
} from '../../infrastructure/streaming/youtube-player'
import { fetchSpotifyResource } from '../../infrastructure/streaming/spotify-resource'
import { userAlbumSchema } from '../../domain/library/schemas'
import {
  libraryIds,
  makeLibrary,
  times,
} from '../../domain/library/library.fixture'

vi.mock('../../infrastructure/streaming/youtube-player', () => ({
  connectYouTubePlayer: vi.fn(),
}))
vi.mock('../../infrastructure/streaming/spotify-resource', () => ({
  fetchSpotifyResource: vi.fn(),
}))
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.clearAllMocks()
})
const spotify = `https://open.spotify.com/album/${'a'.repeat(22)}`
const youtube = 'https://youtu.be/ficticio_01'
function entry() {
  return userAlbumSchema.parse({
    ...makeLibrary().userAlbums[0],
    links: [
      {
        id: libraryIds.entry,
        purpose: 'playback',
        url: spotify,
        label: 'Original',
        createdAt: times.added,
        updatedAt: times.added,
      },
      {
        id: libraryIds.otherEntry,
        purpose: 'playback',
        url: youtube,
        label: 'Vídeo',
        createdAt: times.added,
        updatedAt: times.added,
      },
      {
        id: libraryIds.otherTrack,
        purpose: 'purchase',
        url: spotify,
        label: 'Compra',
        createdAt: times.added,
        updatedAt: times.added,
      },
    ],
    preferredPlaybackLinkId: libraryIds.entry,
  })
}
function show(value = entry()) {
  return render(
    <PersonalAlbumLinks entry={value} onEdit={vi.fn()} disabled={false} />,
  )
}
test('elige favorito sin conexión automática y mantiene Comprar fuera del selector', () => {
  const value = entry(),
    before = structuredClone(value)
  const view = show(value)
  expect(
    screen.getByRole('combobox', { name: 'Enlace para escuchar' }),
  ).toHaveValue(libraryIds.entry)
  expect(screen.getAllByRole('option')).toHaveLength(2)
  expect(view.container.querySelector('iframe')).toBeNull()
  expect(connectYouTubePlayer).not.toHaveBeenCalled()
  expect(fetchSpotifyResource).not.toHaveBeenCalled()
  expect(screen.getByRole('link', { name: 'Compra' })).toBeVisible()
  fireEvent.click(
    screen.getByRole('button', { name: 'Cargar reproductor de Spotify' }),
  )
  const frame = view.container.querySelector('iframe')!
  expect(frame.src).toBe(
    `https://open.spotify.com/embed/album/${'a'.repeat(22)}`,
  )
  expect(frame).toHaveAttribute(
    'referrerpolicy',
    'strict-origin-when-cross-origin',
  )
  fireEvent.load(frame)
  expect(screen.getByText(/Esto no confirma/)).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar reproductor' }))
  expect(frame.isConnected).toBe(false)
  expect(value).toEqual(before)
})

test('un error de YouTube no es ocultado por load, ready o callbacks de una instancia cerrada', async () => {
  const calls: {
    events: YouTubeEvents
    signal: AbortSignal
    dispose: ReturnType<typeof vi.fn>
  }[] = []
  vi.mocked(connectYouTubePlayer).mockImplementation(
    (_frame, events, signal) => {
      const dispose = vi.fn()
      calls.push({ events, signal, dispose })
      return Promise.resolve(dispose)
    },
  )
  const view = show()
  fireEvent.change(screen.getByRole('combobox'), {
    target: { value: libraryIds.otherEntry },
  })
  fireEvent.click(
    screen.getByRole('button', { name: 'Cargar reproductor de YouTube' }),
  )
  await waitFor(() => expect(calls).toHaveLength(1))
  act(() => calls[0]!.events.error(153))
  fireEvent.load(view.container.querySelector('iframe')!)
  act(() => {
    calls[0]!.events.ready()
    calls[0]!.events.state(1)
  })
  expect(screen.getByText(/no recibió la identificación/)).toBeVisible()
  fireEvent.click(
    screen.getByRole('button', { name: 'Reintentar reproductor de YouTube' }),
  )
  await waitFor(() => expect(calls).toHaveLength(2))
  expect(calls[0]!.signal.aborted).toBe(true)
  expect(calls[0]!.dispose).toHaveBeenCalled()
  act(() => calls[0]!.events.error(100))
  expect(screen.queryByText(/fue retirado/)).not.toBeInTheDocument()
  act(() => {
    calls[1]!.events.ready()
    calls[1]!.events.state(1)
  })
  expect(screen.getByText('Reproducción iniciada en YouTube.')).toBeVisible()
  fireEvent.change(screen.getByRole('combobox'), {
    target: { value: libraryIds.entry },
  })
  expect(calls[1]!.signal.aborted).toBe(true)
  expect(view.container.querySelector('iframe')).toBeNull()
  view.unmount()
})

test('metadatos cancelados o tardíos no reaparecen ni cambian el álbum; éxito sólo temporal', async () => {
  let resolve:
    ((value: { title: string; thumbnail?: string }) => void) | undefined
  vi.mocked(fetchSpotifyResource).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  const value = entry(),
    before = structuredClone(value),
    view = show(value)
  fireEvent.click(
    screen.getByRole('button', { name: 'Cargar reproductor de Spotify' }),
  )
  fireEvent.click(screen.getByText('Revisar los datos del recurso (opcional)'))
  fireEvent.click(
    screen.getByRole('button', { name: 'Consultar referencia de Spotify' }),
  )
  const signal = vi.mocked(fetchSpotifyResource).mock.calls[0]![1]
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar consulta' }))
  expect(signal.aborted).toBe(true)
  await act(async () => {
    resolve?.({ title: 'Título Tardío' })
    await Promise.resolve()
  })
  expect(screen.queryByText('Título Tardío')).not.toBeInTheDocument()
  vi.mocked(fetchSpotifyResource).mockResolvedValueOnce({
    title: '<b>Recurso Ficticio</b>',
    thumbnail: 'https://i.scdn.co/image/ficticia',
  })
  fireEvent.click(
    screen.getByRole('button', { name: 'Consultar referencia de Spotify' }),
  )
  expect(await screen.findByText('<b>Recurso Ficticio</b>')).toBeVisible()
  expect(view.container.querySelector('b')).toBeNull()
  fireEvent.error(screen.getByRole('img'))
  expect(screen.getByText('Miniatura no disponible.')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar reproductor' }))
  expect(screen.queryByText('<b>Recurso Ficticio</b>')).not.toBeInTheDocument()
  expect(value).toEqual(before)
})

test('Spotify cargado no acaba en timeout y un timeout previo no es ocultado por load', () => {
  vi.useFakeTimers()
  const view = show()
  fireEvent.click(
    screen.getByRole('button', { name: 'Cargar reproductor de Spotify' }),
  )
  fireEvent.load(view.container.querySelector('iframe')!)
  act(() => {
    vi.advanceTimersByTime(21000)
  })
  expect(screen.queryByText(/no confirmó la carga/)).not.toBeInTheDocument()
  fireEvent.click(
    screen.getByRole('button', { name: 'Reintentar reproductor de Spotify' }),
  )
  act(() => {
    vi.advanceTimersByTime(21000)
  })
  fireEvent.load(view.container.querySelector('iframe')!)
  expect(screen.getByText(/no confirmó la carga/)).toBeVisible()
})

test('sin conexión no crea un marco y un enlace genérico conserva la salida externa', () => {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
  const value = entry(),
    view = show(value)
  fireEvent.click(
    screen.getByRole('button', { name: 'Cargar reproductor de Spotify' }),
  )
  expect(view.container.querySelector('iframe')).toBeNull()
  expect(screen.getByText(/No hay conexión/)).toBeVisible()
  view.unmount()
  value.links![0]!.url = 'https://spotify.link/ficticia'
  show(value)
  expect(
    screen.queryByRole('button', { name: /Cargar reproductor/ }),
  ).not.toBeInTheDocument()
  expect(
    screen.getByRole('link', { name: /Abrir en el servicio/ }),
  ).toHaveAttribute('href', 'https://spotify.link/ficticia')
})
