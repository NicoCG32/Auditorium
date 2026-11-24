import { useEffect, useSyncExternalStore } from 'react'
import type { CloudAccount } from '../../application/cloud-account'
import { NavigationProvider } from '../navigation/NavigationProvider'
import { LibraryPage } from '../library/LibraryPage'
import { AccountPanel } from './AccountPanel'

export function AccountLibrary({ account }: { account: CloudAccount }) {
  const state = useSyncExternalStore(account.subscribe, account.getSnapshot)
  useEffect(() => account.start(), [account])
  if (state.loading) return <p role="status">Abriendo tu biblioteca…</p>
  return (
    <NavigationProvider key={state.user?.id ?? 'local'}>
      {state.notice && (
        <p role="status" className="mb-4">
          {state.notice}
        </p>
      )}
      {state.recovery ? (
        <div className="account-recovery">
          <AccountPanel account={account} />
        </div>
      ) : (
        <LibraryPage repository={state.repository} account={account} />
      )}
    </NavigationProvider>
  )
}
