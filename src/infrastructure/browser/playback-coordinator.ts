let owner: { stop: () => void } | undefined
export function claimPlayback(stop: () => void) {
  const previous = owner
  const current = { stop }
  owner = current
  previous?.stop()
  return () => {
    if (owner === current) owner = undefined
  }
}
