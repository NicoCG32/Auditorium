import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { IndexedDbRepository } from './infrastructure/repositories/indexeddb-repository'
import './styles/base.css'
import { createOfflineController } from './infrastructure/browser/offline-controller'
import {
  cloudConfiguration,
  createCloudClient,
} from './infrastructure/supabase/client'
import { CloudAccount } from './application/cloud-account'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('No se encontró el elemento raíz de la aplicación.')
}

const repository = new IndexedDbRepository()
const cloud = cloudConfiguration()
let account: CloudAccount | undefined
try {
  account = cloud
    ? new CloudAccount(
        createCloudClient(cloud),
        repository,
        new URL(cloud.url).hostname,
      )
    : undefined
} catch {
  // Restricted browser session storage still permits the independent local UI.
  account = undefined
}
const offline = createOfflineController()
offline.start()
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    repository.close()
    offline.stop()
  })

createRoot(rootElement).render(
  <StrictMode>
    <App
      repository={repository}
      offline={offline}
      {...(account ? { account } : {})}
    />
  </StrictMode>,
)
