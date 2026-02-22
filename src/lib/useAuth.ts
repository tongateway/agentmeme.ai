/**
 * TonConnect proof-based JWT authentication hook.
 *
 * Flow:
 * 1. On mount, fetch payload from /api/auth/payload
 * 2. Set it as tonProof parameter on TonConnectUI
 * 3. When wallet connects, the proof is included in the wallet response
 * 4. Exchange proof for JWT via /api/auth/check-proof
 * 5. Store JWT in localStorage and return it
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTonConnectUI, useTonWallet } from '@tonconnect/ui-react';
import { getAuthPayload, checkProof, type PublicApiConfig } from './api';

const JWT_STORAGE_KEY = 'ai-trader-race:jwt';
const JWT_ADDR_KEY = 'ai-trader-race:jwt-addr';

/** Read stored JWT from localStorage (only if it matches the current wallet). */
function readStoredJwt(walletAddr: string | null): string | null {
  try {
    const storedAddr = localStorage.getItem(JWT_ADDR_KEY);
    const storedJwt = localStorage.getItem(JWT_STORAGE_KEY);
    if (storedJwt && storedAddr && walletAddr && storedAddr === walletAddr) {
      return storedJwt;
    }
    return null;
  } catch {
    return null;
  }
}

function storeJwt(jwt: string, walletAddr: string): void {
  try {
    localStorage.setItem(JWT_STORAGE_KEY, jwt);
    localStorage.setItem(JWT_ADDR_KEY, walletAddr);
  } catch {
    // ignore
  }
}

function clearStoredJwt(): void {
  try {
    localStorage.removeItem(JWT_STORAGE_KEY);
    localStorage.removeItem(JWT_ADDR_KEY);
  } catch {
    // ignore
  }
}

export function useAuth(baseCfg: PublicApiConfig): {
  jwtToken: string | null;
  authReady: boolean;
} {
  const [tonConnectUI] = useTonConnectUI();
  const wallet = useTonWallet();
  const walletAddr = wallet?.account?.address ?? null;

  // Initialize from localStorage
  const [jwtToken, setJwtToken] = useState<string | null>(() => readStoredJwt(walletAddr));
  const [authReady, setAuthReady] = useState(false);
  const payloadRef = useRef<string | null>(null);
  const proofCheckedRef = useRef(false);

  // Step 1: Fetch payload and set tonProof on TonConnectUI
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const payload = await getAuthPayload(baseCfg);
        if (cancelled) return;
        payloadRef.current = payload;
        tonConnectUI.setConnectRequestParameters({
          state: 'ready',
          value: { tonProof: payload },
        });
      } catch {
        // If payload fetch fails, just connect without proof
        tonConnectUI.setConnectRequestParameters(null);
      } finally {
        if (!cancelled) setAuthReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, [baseCfg, tonConnectUI]);

  // Step 2: When wallet connects with proof, exchange for JWT
  const exchangeProof = useCallback(async () => {
    if (!wallet || proofCheckedRef.current) return;

    const connectItems = wallet.connectItems;
    const tonProofItem = connectItems?.tonProof;

    if (!tonProofItem || tonProofItem.name !== 'ton_proof' || !('proof' in tonProofItem)) return;

    // Already have valid JWT for this address
    const existing = readStoredJwt(wallet.account.address);
    if (existing) {
      setJwtToken(existing);
      proofCheckedRef.current = true;
      return;
    }

    proofCheckedRef.current = true;

    try {
      const proof = tonProofItem.proof;
      const jwt = await checkProof(baseCfg, {
        address: wallet.account.address,
        proof: {
          timestamp: proof.timestamp,
          domain: proof.domain,
          payload: proof.payload,
          signature: proof.signature,
          state_init: wallet.account.walletStateInit ?? '',
        },
        state_init: wallet.account.walletStateInit ?? '',
      });
      setJwtToken(jwt);
      storeJwt(jwt, wallet.account.address);
    } catch {
      // Auth failed — continue without JWT (lower RPS)
    }
  }, [wallet, baseCfg]);

  useEffect(() => {
    void exchangeProof();
  }, [exchangeProof]);

  // Clear JWT when wallet disconnects
  useEffect(() => {
    if (!wallet) {
      setJwtToken(null);
      clearStoredJwt();
      proofCheckedRef.current = false;
    }
  }, [wallet]);

  return { jwtToken, authReady };
}
