import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { IndexedDbRepository } from './infrastructure/repositories/indexeddb-repository'
import './styles/base.css'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('No se encontró el elemento raíz de la aplicación.')
}

const repository = new IndexedDbRepository()
if (import.meta.hot) import.meta.hot.dispose(() => repository.close())

createRoot(rootElement).render(
  <StrictMode>
    <App repository={repository} />
  </StrictMode>,
)
