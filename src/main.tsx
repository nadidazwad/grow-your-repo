import { StrictMode, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/index.css'
import App from './app/App.tsx'

const dev = import.meta.env.DEV
  ? { '/__overview': lazy(() => import('./dev/Overview.tsx')), '/__grown': lazy(() => import('./dev/Grown.tsx')) }
  : null
const Dev = dev?.[location.pathname as keyof typeof dev]

createRoot(document.getElementById('root')!).render(<StrictMode>{Dev ? <Dev /> : <App />}</StrictMode>)
