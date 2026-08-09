/**
 * Mock argon2-browser for unit tests.
 * The real package uses WASM and isn't available in the test container.
 */
const ArgonType = { Argon2id: 2 } as const;

async function hash(params: {
  pass: Uint8Array;
  salt: Uint8Array;
  type: number;
  mem: number;
  time: number;
  parallelism: number;
  hashLen: number;
}) {
  // Deterministic fake hash: XOR pass bytes with salt bytes
  const result = new Uint8Array(params.hashLen);
  for (let i = 0; i < params.hashLen; i++) {
    result[i] =
      (params.pass[i % params.pass.length] ?? 0) ^
      (params.salt[i % params.salt.length] ?? 0) ^
      (i & 0xff);
  }
  return { hash: result };
}

export default { hash, ArgonType };
export { ArgonType, hash };
