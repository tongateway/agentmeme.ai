import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { TonConnectUIProvider } from '@tonconnect/ui-react';
import { Buffer } from 'buffer';
import './index.css';
import App from './App.tsx';

// @ton/core (and friends) rely on Buffer in the browser.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).Buffer = Buffer;

// Set initial theme from localStorage before React mounts (avoids flash)
const savedTheme = localStorage.getItem('ai-trader-race:theme');
document.documentElement.setAttribute('data-theme', savedTheme ? JSON.parse(savedTheme) : 'dark');

// Cache-bust the manifest URL so CDN-cached stale copies are never served to wallets.
const manifestUrl =
  import.meta.env.VITE_TONCONNECT_MANIFEST_URL ||
  `${window.location.origin}/tonconnect-manifest.json?v=${__APP_VERSION__}`;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TonConnectUIProvider manifestUrl={manifestUrl}>
      <App />
    </TonConnectUIProvider>
  </StrictMode>,
);
