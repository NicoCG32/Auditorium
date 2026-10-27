import { entityIdSchema } from '../../domain/shared/scalars'

export type Route =
  | { kind: 'library' | 'add' | 'ratings' | 'collection' }
  | { kind: 'album'; id: string; editor?: 'edit' | 'experience' | 'collection' }
  | {
      kind: 'options'
      section: 'backups' | 'removed' | 'recommendations' | 'wishes' | 'account'
    }
  | { kind: 'unknown' }

const options = {
  respaldos: 'backups',
  retirados: 'removed',
  recomendaciones: 'recommendations',
  deseos: 'wishes',
  cuenta: 'account',
} as const

export function parseRoute(hash: string): Route {
  if (
    !hash ||
    hash === '#' ||
    hash === '#/' ||
    hash === '#contenido' ||
    hash === '#/biblioteca'
  )
    return { kind: 'library' }
  if (hash === '#/anadir') return { kind: 'add' }
  if (hash === '#/calificaciones') return { kind: 'ratings' }
  if (hash === '#/coleccion') return { kind: 'collection' }
  const option = /^#\/opciones\/([^/?#]+)$/u.exec(hash)?.[1]
  if (option && Object.hasOwn(options, option))
    return { kind: 'options', section: options[option as keyof typeof options] }
  const album = /^#\/album\/([^/?#]+)(?:\/(editar|experiencia))?$/u.exec(hash)
  if (album && entityIdSchema.safeParse(album[1]).success) {
    const editor =
      album[2] === 'editar'
        ? 'edit'
        : album[2] === 'experiencia'
          ? 'experience'
          : undefined
    return { kind: 'album', id: album[1]!, ...(editor ? { editor } : {}) }
  }
  const copy = /^#\/coleccion\/nueva\?album=([^&#]+)$/u.exec(hash)
  if (copy && entityIdSchema.safeParse(copy[1]).success)
    return { kind: 'album', id: copy[1]!, editor: 'collection' }
  return { kind: 'unknown' }
}

export function routeHash(route: Route): string {
  switch (route.kind) {
    case 'library':
      return '#/biblioteca'
    case 'add':
      return '#/anadir'
    case 'ratings':
      return '#/calificaciones'
    case 'collection':
      return '#/coleccion'
    case 'album':
      return route.editor === 'collection'
        ? `#/coleccion/nueva?album=${route.id}`
        : `#/album/${route.id}${route.editor === 'edit' ? '/editar' : route.editor === 'experience' ? '/experiencia' : ''}`
    case 'options':
      return `#/opciones/${Object.entries(options).find(([, value]) => value === route.section)![0]}`
    case 'unknown':
      return '#/ruta-desconocida'
  }
}

export function routeTitle(route: Route) {
  switch (route.kind) {
    case 'library':
      return 'Tu biblioteca'
    case 'add':
      return 'Añadir álbum'
    case 'ratings':
      return 'Calificaciones'
    case 'collection':
      return 'Mi colección'
    case 'album':
      return route.editor === 'edit'
        ? 'Editar datos del álbum'
        : route.editor === 'experience'
          ? 'Mi experiencia'
          : route.editor === 'collection'
            ? 'Mi colección del álbum'
            : 'Ficha del álbum'
    case 'options':
      return {
        backups: 'Respaldos',
        removed: 'Álbumes retirados',
        recommendations: 'Recomendaciones',
        wishes: 'Deseos de compra',
        account: 'Cuenta y dispositivos',
      }[route.section]
    case 'unknown':
      return 'Página no encontrada'
  }
}
