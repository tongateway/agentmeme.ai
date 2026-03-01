#!/usr/bin/env node
/**
 * Generates `public/tonconnect-manifest.json` with environment-specific values.
 *
 * Why:
 * - TonConnect wallets often reject manifests that reference localhost/http in production.
 * - Vite's `public/` files are copied as-is to `dist/`, so we generate before `vite build`.
 *
 * Env:
 * - TONCONNECT_APP_URL (required for `npm run build`; must be https and non-localhost)
 * - TONCONNECT_MANIFEST_NAME (optional)
 * - TONCONNECT_ICON_URL (optional; must be https for most wallets)
 * - TONCONNECT_TERMS_URL (optional)
 * - TONCONNECT_PRIVACY_URL (optional)
 *
 * Escape hatch for local builds:
 * - TONCONNECT_ALLOW_LOCAL_MANIFEST=1
 */

import fs from 'node:fs';
import path from 'node:path';

// Load .env so TONCONNECT_APP_URL is available outside of Vite
const envPath = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([^#=]+?)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
// Use a non-default filename so we can bust stale CDN caches by renaming.
const outPath = path.join(rootDir, 'public', 'tc-manifest.json');

const lifecycle = process.env.npm_lifecycle_event || '';
// Detect build: either running directly as "build" or called from the build script chain
const isBuild = lifecycle === 'build' || lifecycle === 'gen:tonconnect-manifest' && process.env.CI === 'true';

const allowLocal = process.env.TONCONNECT_ALLOW_LOCAL_MANIFEST === '1';

const name = process.env.TONCONNECT_MANIFEST_NAME || 'AI Trader Race';
const iconUrl =
  process.env.TONCONNECT_ICON_URL ||
  'https://raw.githubusercontent.com/ton-blockchain/ton-connect/main/assets/ton-icon-256.png';
const termsUrl = process.env.TONCONNECT_TERMS_URL || 'https://ton.org/terms';
const privacyUrl = process.env.TONCONNECT_PRIVACY_URL || 'https://ton.org/privacy';

function mustUrl(s, label) {
  try {
    return new URL(s);
  } catch {
    throw new Error(`${label} must be a valid URL (got "${s}")`);
  }
}

let appUrlRaw = process.env.TONCONNECT_APP_URL;
if (!appUrlRaw) {
  if (isBuild && !allowLocal) {
    throw new Error(
      'TONCONNECT_APP_URL is required for `npm run build` (set it to your production https origin, e.g. "https://your-domain.com"). ' +
        'If you really want a local/dev manifest during build, set TONCONNECT_ALLOW_LOCAL_MANIFEST=1.'
    );
  }
  appUrlRaw = 'http://localhost:5173';
}

const appUrl = mustUrl(appUrlRaw, 'TONCONNECT_APP_URL/manifest.url');
const icon = mustUrl(iconUrl, 'TONCONNECT_ICON_URL/manifest.iconUrl');
mustUrl(termsUrl, 'TONCONNECT_TERMS_URL/manifest.termsOfUseUrl');
mustUrl(privacyUrl, 'TONCONNECT_PRIVACY_URL/manifest.privacyPolicyUrl');

if (isBuild && !allowLocal) {
  if (appUrl.protocol !== 'https:') {
    throw new Error(`TONCONNECT_APP_URL must start with https:// for production builds (got "${appUrlRaw}")`);
  }
  if (appUrl.hostname === 'localhost' || appUrl.hostname === '127.0.0.1') {
    throw new Error(`TONCONNECT_APP_URL must not be localhost for production builds (got "${appUrlRaw}")`);
  }
}

// Most wallets require https for iconUrl too.
if (icon.protocol !== 'https:') {
  // Do not hard-fail because some dev setups still work, but warn loudly.
  // eslint-disable-next-line no-console
  console.warn(`[tonconnect-manifest] WARNING: iconUrl is not https ("${iconUrl}")`);
}

const manifest = {
  name,
  url: appUrl.origin,
  iconUrl,
  termsOfUseUrl: termsUrl,
  privacyPolicyUrl: privacyUrl,
};

const json = JSON.stringify(manifest, null, 2) + '\n';

fs.mkdirSync(path.dirname(outPath), { recursive: true });
if (fs.existsSync(outPath)) {
  const prev = fs.readFileSync(outPath, 'utf8');
  if (prev === json) process.exit(0);
}
fs.writeFileSync(outPath, json, 'utf8');
// eslint-disable-next-line no-console
console.log(`[tonconnect-manifest] wrote ${path.relative(process.cwd(), outPath)} (url=${manifest.url})`);

