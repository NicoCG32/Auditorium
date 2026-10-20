import { z } from 'zod'
import {
  personalAlbumLinkSchema,
  personalLinksInputSchema,
  type PersonalLinksInput,
} from '../domain/library/personal-links'
import type { UserAlbum } from '../domain/library/schemas'

export const personalLinksExpectedSchema = z.strictObject({
  userAlbumId: z.uuid(),
  links: z.array(personalAlbumLinkSchema),
  preferredPlaybackLinkId: z.uuid().optional(),
})
export function personalLinksFrom(
  entry: UserAlbum,
): z.output<typeof personalLinksExpectedSchema> {
  return structuredClone({
    userAlbumId: entry.id,
    links: entry.links ?? [],
    ...(entry.preferredPlaybackLinkId
      ? { preferredPlaybackLinkId: entry.preferredPlaybackLinkId }
      : {}),
  })
}
export function samePersonalLinks(
  a: ReturnType<typeof personalLinksFrom>,
  b: ReturnType<typeof personalLinksFrom>,
) {
  const ordered = (value: typeof a) =>
    JSON.stringify([
      value.userAlbumId,
      value.preferredPlaybackLinkId,
      [...value.links]
        .sort((x, y) => x.id.localeCompare(y.id))
        .map((link) => [
          link.id,
          link.purpose,
          link.url,
          link.label,
          link.createdAt,
          link.updatedAt,
        ]),
    ])
  return ordered(a) === ordered(b)
}
export function updatedPersonalLinks(
  entry: UserAlbum,
  input: PersonalLinksInput,
  timestamp: string,
): UserAlbum {
  const request = personalLinksInputSchema.parse(input)
  const previous = new Map((entry.links ?? []).map((link) => [link.id, link]))
  const links = request.links.map((link) => {
    const old = previous.get(link.id)
    return personalAlbumLinkSchema.parse({
      ...link,
      createdAt: old?.createdAt ?? timestamp,
      updatedAt:
        old &&
        old.purpose === link.purpose &&
        old.url === link.url &&
        old.label === link.label
          ? old.updatedAt
          : timestamp,
    })
  })
  const next = { ...entry, updatedAt: timestamp }
  if (links.length) next.links = links
  else delete next.links
  if (request.preferredPlaybackLinkId)
    next.preferredPlaybackLinkId = request.preferredPlaybackLinkId
  else delete next.preferredPlaybackLinkId
  if (samePersonalLinks(personalLinksFrom(entry), personalLinksFrom(next)))
    return entry
  return next
}
