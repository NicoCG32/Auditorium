import type { PersonalLinksInput } from '../../domain/library/personal-links'
import type { UserAlbum } from '../../domain/library/schemas'

export interface LinksDraft {
  links: {
    id: string
    purpose: 'playback' | 'purchase'
    url: string
    label: string
  }[]
  preferredPlaybackLinkId: string
}
export function linksDraftFrom(entry?: UserAlbum): LinksDraft {
  return {
    links: (entry?.links ?? []).map((link) => ({
      id: link.id,
      purpose: link.purpose,
      url: link.url,
      label: link.label ?? '',
    })),
    preferredPlaybackLinkId: entry?.preferredPlaybackLinkId ?? '',
  }
}
export function linksInputFrom(draft: LinksDraft): PersonalLinksInput {
  return {
    links: draft.links.map(({ label, ...link }) => ({
      ...link,
      ...(label.trim() ? { label: label.trim() } : {}),
    })),
    ...(draft.preferredPlaybackLinkId
      ? { preferredPlaybackLinkId: draft.preferredPlaybackLinkId }
      : {}),
  }
}
