import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { consumeSessionFromUrl } from './lib/api'

// Cross-subdomain session handoff: if we were sent here with #session=<jwt> in
// the URL (e.g. an institute admin jumping from the platform apex to their own
// subdomain admin right after signup), adopt that token BEFORE React renders so
// the app boots already signed in instead of flashing the login screen.
consumeSessionFromUrl()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Capture the browser's install prompt as EARLY as possible — it can fire
// before any React component mounts, so we stash it on window and notify any
// Install button (via a custom event) regardless of which route is open.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    window.__deferredInstallPrompt = e
    window.dispatchEvent(new Event('pwa-installable'))
  })
  window.addEventListener('appinstalled', () => {
    window.__deferredInstallPrompt = null
    window.dispatchEvent(new Event('pwa-installed'))
  })
}

// Register the PWA service worker (installable app + offline shell). Kept
// out of the render path and failure-tolerant so it never blocks the app.
if ('serviceWorker' in navigator) {
  // Remember whether a SW already controlled this page BEFORE registering, so we
  // can tell a genuine UPDATE (existing app got a new deploy) apart from the
  // very first install (nothing to reload for).
  const hadController = !!navigator.serviceWorker.controller
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
  // When a freshly-deployed service worker takes control, reload ONCE so the app
  // runs the new assets instead of a stale cached bundle. Without this, a PWA
  // client can keep serving an old build long after a deploy.
  let reloaded = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded || !hadController) return
    reloaded = true
    window.location.reload()
  })
}
