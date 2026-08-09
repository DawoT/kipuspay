/**
 * Primitivas criptográficas compartidas del monorepo de adaptadores (M6).
 * SHA-256 hex sobre Web Crypto; cero dependencias npm.
 */

/** SHA-256 hex de una cadena (mayúsculas/minúsculas conservadas). */
export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** SHA-256 hex del JSON.stringify canónico de un payload serializable. */
export async function sha256HexOf(payload: unknown): Promise<string> {
  return sha256Hex(JSON.stringify(payload));
}
