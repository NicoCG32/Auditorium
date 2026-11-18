import { expect, test } from 'vitest'
import { parseRoute, routeHash } from './routes'

const id = '11111111-1111-4111-8111-111111111111'

test.each(['', '#', '#/', '#contenido', '#/biblioteca'])(
  'inicio compatible: %s',
  (hash) => {
    expect(parseRoute(hash)).toEqual({ kind: 'library' })
  },
)

test.each([
  '#/anadir',
  '#/calificaciones',
  '#/coleccion',
  '#/opciones/respaldos',
  '#/opciones/retirados',
  '#/opciones/recomendaciones',
  '#/opciones/deseos',
  `#/album/${id}`,
  `#/artista/${id}`,
  `#/album/${id}/editar`,
  `#/album/${id}/experiencia`,
  `#/coleccion/nueva?album=${id}`,
])('rutas internas reversibles: %s', (hash) => {
  expect(routeHash(parseRoute(hash))).toBe(hash)
})

test.each([
  '#/album/no-existe',
  '#/artista/no-existe',
  '#/artista/11111111-1111-4111-8111-111111111111?guardar=true',
  '#/album/%zz/editar',
  '#/album/11111111-1111-4111-8111-111111111111/eliminar',
  '#/opciones/desconocida',
  '#/anadir?key=valor',
])('rutas no admitidas no se interpretan como comandos: %s', (hash) => {
  expect(parseRoute(hash)).toEqual({ kind: 'unknown' })
})
