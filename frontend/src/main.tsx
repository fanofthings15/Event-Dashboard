import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { SettingsProvider } from './SettingsContext.tsx'

// /live is the full-screen display for a dedicated screen — its own page,
// loaded on demand so the main dashboard bundle doesn't carry it.
const LiveScreen = lazy(() => import('./live/LiveScreen.tsx'))
// /beta is the redesign's working copy, also loaded on demand; / stays the
// current dashboard until it's swapped over.
const BetaApp = lazy(() => import('./beta/BetaApp.tsx'))
const path = window.location.pathname.replace(/\/+$/, '')
const isLive = path === '/live'
const isBeta = path === '/beta'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SettingsProvider>
      {isLive ? (
        <Suspense fallback={null}>
          <LiveScreen />
        </Suspense>
      ) : isBeta ? (
        <Suspense fallback={null}>
          <BetaApp />
        </Suspense>
      ) : (
        <App />
      )}
    </SettingsProvider>
  </StrictMode>,
)
