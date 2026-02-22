function bytesToBigIntBE(bytes: Uint8Array): bigint {
  let v = 0n;
  for (const b of bytes) {
    v = (v << 8n) | BigInt(b);
  }
  return v;
}

export async function sha256BigInt(text: string): Promise<bigint> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return bytesToBigIntBE(new Uint8Array(digest));
}

