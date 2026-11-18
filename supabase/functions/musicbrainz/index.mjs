import { createCatalogStore } from './store.mjs'
import { createMusicBrainzGateway } from './gateway.mjs'

function values(name) {
  try {
    return Object.values(JSON.parse(Deno.env.get(name) ?? '{}')).filter(
      (value) => typeof value === 'string' && value,
    )
  } catch {
    return []
  }
}
const secret =
  values('SUPABASE_SECRET_KEYS')[0] ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const apiKeys = [
  ...values('SUPABASE_PUBLISHABLE_KEYS'),
  Deno.env.get('SUPABASE_ANON_KEY'),
  Deno.env.get('CATALOG_PUBLISHABLE_KEY'),
].filter(Boolean)
const store = createCatalogStore(Deno.env.get('SUPABASE_URL'), secret)
const origins = (
  Deno.env.get('CATALOG_ALLOWED_ORIGINS') ?? 'https://nicocg32.github.io'
)
  .split(',')
  .map((value) => new URL(value.trim()).origin)
Deno.serve(createMusicBrainzGateway({ store, apiKeys, origins }))
