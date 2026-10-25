import { StrictMode, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/index.css'
import App from './app/App.tsx'

const Overview = import.meta.env.DEV ? lazy(() => import('./dev/Overview.tsx')) : null

createRoot(document.getElementById('root')!).render(
  <StrictMode>{Overview && location.pathname === '/__overview' ? <Overview /> : <App />}</StrictMode>,
)
