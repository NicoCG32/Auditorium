import { expect, test } from 'vitest'
import {
  inspectPlaybackLink,
  playbackEmbedUrl,
  youtubePlaybackError,
} from './playback-links'

test('normaliza sólo recursos reconocidos y conserva la identidad en el embed', () => {
  for (const kind of ['album', 'track', 'playlist']) {
    const target = inspectPlaybackLink(
      `https://open.spotify.com/intl-es/${kind}/${'A'.repeat(22)}?si=discarded`,
    )!
    expect(target.provider).toBe('spotify')
    expect(playbackEmbedUrl(target, 'https://example.org')).toBe(
      `https://open.spotify.com/embed/${kind}/${'A'.repeat(22)}`,
    )
  }
  for (const url of [
    'https://youtu.be/ficticio_01?t=5',
    'https://www.youtube.com/watch?v=ficticio_01&list=PLignored123',
    'https://music.youtube.com/watch?v=ficticio_01',
    'https://www.youtube.com/shorts/ficticio_01',
    'https://www.youtube.com/embed/ficticio_01',
  ]) {
    const embed = new URL(
      playbackEmbedUrl(inspectPlaybackLink(url)!, 'https://example.org'),
    )
    expect(embed.pathname).toBe('/embed/ficticio_01')
    expect(embed.searchParams.get('origin')).toBe('https://example.org')
    expect(embed.searchParams.get('autoplay')).toBe('0')
    expect(embed.searchParams.get('enablejsapi')).toBe('1')
    expect(embed.searchParams.has('list')).toBe(false)
  }
  const list = new URL(
    playbackEmbedUrl(
      inspectPlaybackLink(
        'https://www.youtube.com/playlist?list=PLficticia12345',
      )!,
      'http://127.0.0.1:4179',
    ),
  )
  expect(list.searchParams.get('list')).toBe('PLficticia12345')
  expect(list.searchParams.get('listType')).toBe('playlist')
})

test('genéricos, acortadores, hosts engañosos y entradas peligrosas no crean frames', () => {
  for (const value of [
    'https://spotify.link/example',
    'https://open.spotify.com.evil.example/album/' + 'a'.repeat(22),
    'https://www.youtube.com.evil.example/watch?v=ficticio_01',
    'https://youtube.com@evil.example/watch?v=ficticio_01',
    'https://www.youtube.com:8443/watch?v=ficticio_01',
    'http://youtu.be/ficticio_01',
    'javascript:alert(1)',
    '<iframe>',
    'https://youtu.be/ficticio_01\n',
    'https://youtu.be/ficticio_01/extra',
    'https://www.youtube.com/watch?v=short',
    'https://shop.example/album',
    'https://open.spotify.com/artist/' + 'a'.repeat(22),
  ])
    expect(inspectPlaybackLink(value), value).toBeUndefined()
  const target = inspectPlaybackLink('https://youtu.be/ficticio_01')!
  expect(() =>
    playbackEmbedUrl({ ...target, id: 'anotherId11' }, 'https://example.org'),
  ).toThrow()
  expect(() => playbackEmbedUrl(target, 'https://example.org/path')).toThrow()
})

test('los errores de YouTube distinguen restricciones e identificación sin deducir una causa privada concreta', () => {
  expect(youtubePlaybackError(100)).toMatch(
    /privado.*retirado.*no está disponible/,
  )
  expect(youtubePlaybackError(101)).toEqual(youtubePlaybackError(150))
  expect(youtubePlaybackError(153)).toContain('origen')
  expect(youtubePlaybackError(5)).toContain('navegador')
  expect(youtubePlaybackError(2)).toContain('parámetros')
  expect(youtubePlaybackError(999)).toContain('no pudo')
})
