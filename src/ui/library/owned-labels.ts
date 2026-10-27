import type { OwnedItem } from '../../domain/library/owned-items'

export const ownedMediumLabels: Record<OwnedItem['medium'], string> = {
  physical: 'Ejemplar físico',
  purchased_digital: 'Compra digital',
}
export const ownedFormatLabels: Record<OwnedItem['format'], string> = {
  vinyl: 'Vinilo',
  cd: 'CD',
  cassette: 'Casete',
  digital_download: 'Descarga digital',
  other: 'Otro',
}
export const conditionLabels: Record<
  NonNullable<OwnedItem['mediaCondition']>,
  string
> = {
  mint: 'Nuevo',
  near_mint: 'Casi nuevo',
  very_good: 'Muy bueno',
  good: 'Bueno',
  fair: 'Regular',
  poor: 'Deteriorado',
}
export function ownedItemLabels(items: OwnedItem[]): Map<string, string> {
  const ordered = items.toSorted(
    (a, b) =>
      a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  )
  const counts = new Map<string, number>(),
    labels = new Map<string, string>()
  for (const item of ordered) {
    const number = (counts.get(item.userAlbumId) ?? 0) + 1
    counts.set(item.userAlbumId, number)
    labels.set(
      item.id,
      `${ownedFormatLabels[item.format]} · ${item.medium === 'physical' ? 'Copia' : 'Adquisición'} ${number}`,
    )
  }
  return labels
}
export function ownedItemLabel(
  item: OwnedItem,
  items: OwnedItem[] = [item],
): string {
  return (
    ownedItemLabels(items).get(item.id) ?? ownedItemLabels([item]).get(item.id)!
  )
}
