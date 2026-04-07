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
// Migrate old theme values
const rawTheme = localStorage.getItem('ai-trader-race:theme');
let initialTheme = rawTheme ? JSON.parse(rawTheme) : 'light';
if (initialTheme === 'autumn') {
  initialTheme = 'light';
  localStorage.setItem('ai-trader-race:theme', JSON.stringify('light'));
} else if (initialTheme === 'dark') {
  initialTheme = 'dracula';
  localStorage.setItem('ai-trader-race:theme', JSON.stringify('dracula'));
}
document.documentElement.setAttribute('data-theme', initialTheme);

const manifestUrl =
  import.meta.env.VITE_TONCONNECT_MANIFEST_URL ||
  `${window.location.origin}/tc-manifest.json`;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TonConnectUIProvider manifestUrl={manifestUrl}>
      <App />
    </TonConnectUIProvider>
  </StrictMode>,
);
