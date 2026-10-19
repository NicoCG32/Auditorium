import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { cloudAuthStorage } from './auth-browser'
import {
  BACKUP_SCHEMA_VERSION,
  MAX_BACKUP_BYTES,
  localSnapshotSchema,
} from '../../domain/backup'
import {
  remoteLibrarySchema,
  SyncConflict,
  type PendingSync,
  type RemoteLibrary,
  type RemoteLibraryRepository,
} from '../../domain/sync'

export interface CloudConfiguration {
  url: string
  publishableKey: string
}
export function cloudConfiguration(): CloudConfiguration | undefined {
  const url: unknown = import.meta.env.VITE_SUPABASE_URL
  const publishableKey: unknown = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (
    typeof url !== 'string' ||
    typeof publishableKey !== 'string' ||
    !publishableKey.startsWith('sb_publishable_')
  )
    return
  try {
    const parsed = new URL(url)
    if (
      parsed.protocol !== 'https:' ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash
    )
      return
    return { url: parsed.origin, publishableKey }
  } catch {
    return
  }
}

export function createCloudClient(config: CloudConfiguration) {
  const project = new URL(config.url).hostname
  const tabKey = `auditorium-auth-tab:${project}`
  const tabId = sessionStorage.getItem(tabKey) ?? crypto.randomUUID()
  sessionStorage.setItem(tabKey, tabId)
  return createClient(config.url, config.publishableKey, {
    auth: {
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: cloudAuthStorage(project, tabId),
      storageKey: `auditorium-auth:${project}:${tabId}`,
    },
  })
}

export class SupabaseLibraryRepository implements RemoteLibraryRepository {
  private cached: RemoteLibrary | null = null
  private readonly client: SupabaseClient
  private readonly accountId: string
  constructor(client: SupabaseClient, accountId: string) {
    this.client = client
    this.accountId = accountId
  }
  async load() {
    if (this.cached) {
      const probe = await this.client
        .from('library_snapshots')
        .select('revision')
        .eq('owner_id', this.accountId)
        .maybeSingle()
      if (probe.error) throw probe.error
      if (probe.data?.revision === this.cached.revision) return this.cached
    }
    const { data, error } = await this.client
      .from('library_snapshots')
      .select('revision,snapshot')
      .eq('owner_id', this.accountId)
      .maybeSingle()
    if (error) throw error
    this.cached = data === null ? null : remoteLibrarySchema.parse(data)
    return this.cached
  }
  async save(pending: PendingSync) {
    const snapshot = localSnapshotSchema.parse(pending.snapshot)
    if (
      new TextEncoder().encode(JSON.stringify(snapshot)).byteLength >
      MAX_BACKUP_BYTES
    )
      throw new Error(
        'La biblioteca supera el límite de sincronización de 20 MiB.',
      )
    const response = await this.client.rpc('save_library_snapshot', {
      account_id: this.accountId,
      expected_revision: pending.expectedRevision,
      operation_id: pending.operationId,
      document: snapshot,
      schema_version: BACKUP_SCHEMA_VERSION,
    })
    const data: unknown = response.data
    const error = response.error
    if (error?.code === '40001') throw new SyncConflict()
    if (error) throw error
    this.cached = remoteLibrarySchema.parse(data)
    return this.cached
  }
}
