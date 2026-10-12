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
export function ownedItemLabel(item: OwnedItem): string {
  return `${ownedFormatLabels[item.format]} · Ejemplar ${item.id.slice(-8)}`
}
