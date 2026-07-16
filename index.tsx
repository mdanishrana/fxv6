import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ThemeProvider } from './services/ThemeContext';
import { BrowserRouter } from 'react-router-dom';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

// A lazy-loaded route chunk can 404 if the tab was open across a deploy (the
// chunk's content hash changed and the old filename no longer exists on the
// server). Reload once to pick up the current build instead of leaving the
// user stuck on a blank/broken page.
window.addEventListener('vite:preloadError', () => {
  const key = 'fxv6_chunk_reload_at';
  const last = Number(sessionStorage.getItem(key) || 0);
  if (Date.now() - last > 10000) {
    sessionStorage.setItem(key, String(Date.now()));
    window.location.reload();
  }
});

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
);
