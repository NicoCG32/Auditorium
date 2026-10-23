import type { Release } from '../../domain/catalog/schemas'

const formats: Record<Release['format'], string> = {
  vinyl: 'Vinilo',
  cd: 'CD',
  cassette: 'Casete',
  digital: 'Digital',
  other: 'Otro',
}
export function releaseLabels(releases: Release[]): Map<string, string> {
  const names = releases.map((release) =>
    [
      release.editionLabel ?? 'Edición sin nombre',
      formats[release.format],
      release.releaseYear,
      release.label,
      release.catalogNumber,
      release.countryCode,
    ]
      .filter((value) => value !== undefined && value !== '')
      .join(' · '),
  )
  return new Map(
    releases.map((release, index) => [
      release.id,
      names.filter((name) => name === names[index]).length > 1
        ? `${names[index]} · Edición ${index + 1}`
        : names[index]!,
    ]),
  )
}
