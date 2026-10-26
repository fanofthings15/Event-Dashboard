import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './dashboard/App.tsx'
import { SettingsProvider } from './SettingsContext.tsx'

// /live is the full-screen display for a dedicated screen — its own page,
// loaded on demand so the main dashboard bundle doesn't carry it. Every other
// path (including the old /beta link) is the dashboard.
const LiveScreen = lazy(() => import('./live/LiveScreen.tsx'))
const path = window.location.pathname.replace(/\/+$/, '')
const isLive = path === '/live'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SettingsProvider>
      {isLive ? (
        <Suspense fallback={null}>
          <LiveScreen />
        </Suspense>
      ) : (
        <App />
      )}
    </SettingsProvider>
  </StrictMode>,
)
