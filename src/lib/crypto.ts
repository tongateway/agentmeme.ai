import nacl from 'tweetnacl';

export type AgentKeypair = {
  publicKeyHex: string; // 32 bytes, hex
  secretKeyHex: string; // 64 bytes, hex (tweetnacl secret key)
};

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array | null {
  if (!/^[0-9a-fA-F]*$/.test(hex)) return null;
  if (hex.length % 2 !== 0) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    const byte = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    if (!Number.isFinite(byte)) return null;
    out[i] = byte;
  }
  return out;
}

export function generateAgentKeypair(): AgentKeypair {
  const kp = nacl.sign.keyPair();
  return {
    publicKeyHex: bytesToHex(kp.publicKey),
    secretKeyHex: bytesToHex(kp.secretKey),
  };
}

// Accepts either:
// - 32-byte seed (64 hex chars), or
// - tweetnacl secret key (64 bytes, 128 hex chars; seed||publicKey).
export function agentKeypairFromSecretOrSeedHex(secretOrSeedHex: string): AgentKeypair | null {
  const s = secretOrSeedHex.trim();
  if (s.length !== 64 && s.length !== 128) return null;

  const bytes = hexToBytes(s);
  if (!bytes) return null;

  try {
    const kp = s.length === 64 ? nacl.sign.keyPair.fromSeed(bytes) : nacl.sign.keyPair.fromSecretKey(bytes);
    return {
      publicKeyHex: bytesToHex(kp.publicKey),
      // Keep caller's input shape (seed vs secret) outside; this function returns the full secret key.
      secretKeyHex: bytesToHex(kp.secretKey),
    };
  } catch {
    return null;
  }
}
