import { StrictMode, lazy, Suspense } from 'react';
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

const manifestUrl =
  import.meta.env.VITE_TONCONNECT_MANIFEST_URL ||
  `${window.location.origin}/tc-manifest.json`;

// Lazy-load V2 app so it doesn't bloat the v1 bundle
const V2App = lazy(() => import('./v2/App.tsx'));

const isV2 = window.location.pathname.startsWith('/v2');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TonConnectUIProvider manifestUrl={manifestUrl}>
      {isV2 ? (
        <Suspense fallback={null}>
          <V2App />
        </Suspense>
      ) : (
        <App />
      )}
    </TonConnectUIProvider>
  </StrictMode>,
);
