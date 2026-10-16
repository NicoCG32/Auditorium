import type { Poster } from './use-poster-preview'

export function PosterBackdrop({
  poster,
  visible = true,
}: {
  poster: Poster | null
  visible?: boolean
}) {
  if (!poster || !visible) return null
  return (
    <div
      className="appearance-poster"
      aria-hidden="true"
      style={{
        backgroundImage: `url("${poster.url}")`,
        opacity: poster.opacity,
        backgroundPosition: `${poster.position} center`,
      }}
    />
  )
}
