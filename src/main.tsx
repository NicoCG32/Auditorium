import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { IndexedDbRepository } from './infrastructure/repositories/indexeddb-repository'
import './styles/base.css'
import { createOfflineController } from './infrastructure/browser/offline-controller'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('No se encontró el elemento raíz de la aplicación.')
}

const repository = new IndexedDbRepository()
const offline = createOfflineController()
offline.start()
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    repository.close()
    offline.stop()
  })

createRoot(rootElement).render(
  <StrictMode>
    <App repository={repository} offline={offline} />
  </StrictMode>,
)
