import { z } from 'zod'
import { entityIdSchema, utcTimestampSchema } from '../shared/scalars'

export const MAX_PERSONAL_LINKS = 20
export const personalLinkUrlSchema = z
  .string()
  .max(2048)
  .refine((value) => {
    if (
      /[\s<>"]/u.test(value) ||
      [...value].some(
        (character) =>
          character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
      )
    )
      return false
    try {
      const url = new URL(value)
      return (
        url.protocol === 'https:' &&
        Boolean(url.hostname) &&
        !url.username &&
        !url.password
      )
    } catch {
      return false
    }
  }, 'Usa una URL HTTPS válida, sin credenciales ni HTML.')

export function normalizedLinkUrl(value: string): string {
  return new URL(value).href
}

export const personalLinkInputSchema = z.strictObject({
  id: entityIdSchema,
  purpose: z.enum(['playback', 'purchase']),
  url: z
    .string()
    .trim()
    .pipe(personalLinkUrlSchema)
    .transform(normalizedLinkUrl),
  label: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .refine(
      (value) => !/[<>]/u.test(value),
      'Usa una etiqueta de texto, sin HTML.',
    )
    .optional(),
})
export const personalAlbumLinkSchema = z
  .strictObject({
    ...personalLinkInputSchema.shape,
    url: personalLinkUrlSchema,
    createdAt: utcTimestampSchema,
    updatedAt: utcTimestampSchema,
  })
  .refine((link) => link.updatedAt >= link.createdAt, {
    path: ['updatedAt'],
    message: 'La actualización no puede preceder al alta del enlace.',
  })

type LinkChoice = {
  links?: { id: string; purpose: string; url: string }[] | undefined
  preferredPlaybackLinkId?: string | undefined
}
export function checkPersonalLinks(
  value: LinkChoice,
  context: z.RefinementCtx,
) {
  const ids = new Set<string>(),
    urls = new Set<string>()
  for (const [index, link] of (value.links ?? []).entries()) {
    if (ids.has(link.id))
      context.addIssue({
        code: 'custom',
        path: ['links', index, 'id'],
        message: 'Un enlace no puede repetir su identificador.',
      })
    ids.add(link.id)
    if (!personalLinkUrlSchema.safeParse(link.url).success) continue
    const key = `${link.purpose}:${normalizedLinkUrl(link.url)}`
    if (urls.has(key))
      context.addIssue({
        code: 'custom',
        path: ['links', index, 'url'],
        message: 'Este enlace ya está añadido con el mismo propósito.',
      })
    urls.add(key)
  }
  if (
    value.preferredPlaybackLinkId &&
    !(value.links ?? []).some(
      (link) =>
        link.id === value.preferredPlaybackLinkId &&
        link.purpose === 'playback',
    )
  )
    context.addIssue({
      code: 'custom',
      path: ['preferredPlaybackLinkId'],
      message: 'El favorito debe ser un enlace de escucha de este álbum.',
    })
}
export const personalLinksInputSchema = z
  .strictObject({
    links: z.array(personalLinkInputSchema).max(MAX_PERSONAL_LINKS),
    preferredPlaybackLinkId: entityIdSchema.optional(),
  })
  .superRefine(checkPersonalLinks)
export type PersonalAlbumLink = z.output<typeof personalAlbumLinkSchema>
export type PersonalLinksInput = z.output<typeof personalLinksInputSchema>

export function linkProvider(value: string): string {
  const host = new URL(value).hostname.toLowerCase()
  if (
    ['open.spotify.com', 'www.spotify.com', 'spotify.com', 'spoti.fi'].includes(
      host,
    )
  )
    return 'Spotify'
  if (
    [
      'youtube.com',
      'www.youtube.com',
      'm.youtube.com',
      'music.youtube.com',
      'youtu.be',
    ].includes(host)
  )
    return 'YouTube'
  if (host === 'bandcamp.com' || host.endsWith('.bandcamp.com'))
    return 'Bandcamp'
  return host
}
