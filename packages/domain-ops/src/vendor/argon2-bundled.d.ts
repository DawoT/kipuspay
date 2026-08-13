interface Argon2HashInput {
  pass: string;
  salt: string;
  time?: number;
  mem?: number;
  parallelism?: number;
  hashLen?: number;
  type?: number;
}

interface Argon2HashResult {
  encoded: string;
  hashHex: string;
  hash: Uint8Array;
}

interface Argon2Api {
  ArgonType: { Argon2d: number; Argon2i: number; Argon2id: number };
  hash(input: Argon2HashInput): Promise<Argon2HashResult>;
  verify(input: { pass: string; encoded: string }): Promise<unknown>;
  unloadRuntime(): void;
}

declare const argon2: Argon2Api;
export type { Argon2Api };
export default argon2;
