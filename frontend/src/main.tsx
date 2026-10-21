import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { SettingsProvider } from './SettingsContext.tsx'

// /live is the full-screen display for a dedicated screen — its own page,
// loaded on demand so the main dashboard bundle doesn't carry it.
const LiveScreen = lazy(() => import('./live/LiveScreen.tsx'))
const isLive = window.location.pathname.replace(/\/+$/, '') === '/live'

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
