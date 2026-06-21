import React from 'react'
import ReactDOM from 'react-dom/client'
import { ThemeProvider } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import App from './App'
import theme from './theme'
import './index.css'
import './i18n' // Initialize i18n
import { registerSW } from 'virtual:pwa-register'
import { initSentry, Sentry } from './config/sentry'
import ErrorFallback from './components/ErrorFallback'

initSentry();

// Register service worker for PWA
const updateSW = registerSW({
  onNeedRefresh() {
    if (window.confirm('Új verzió elérhető! Frissítsük?')) {
      updateSW(true);
    }
  },
  onOfflineReady() {
    console.log('App ready to work offline');
  },
  onRegistered(r) {
    if (r) console.log('SW registered');
  },
  onRegisterError(error) {
    console.error('SW registration failed:', error);
  },
});

// Graceful recovery from a stale-shell chunk 404. Vite fires
// `vite:preloadError` when a lazy import() fails (e.g. a returning client on an
// old index.html requests a chunk hash removed by a newer deploy). Reload once
// to fetch the fresh shell instead of crashing to the error page. Guarded by a
// short-lived flag so a genuinely-missing chunk can't loop.
window.addEventListener('vite:preloadError', (event) => {
  const last = Number(sessionStorage.getItem('chunkReloadAt') || 0);
  if (Date.now() - last > 10000) {
    sessionStorage.setItem('chunkReloadAt', String(Date.now()));
    event.preventDefault();
    window.location.reload();
  }
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary
      fallback={({ error, resetError, eventId }) => (
        <ErrorFallback error={error} resetError={resetError} eventId={eventId} />
      )}
    >
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <App />
      </ThemeProvider>
    </Sentry.ErrorBoundary>
  </React.StrictMode>,
)
