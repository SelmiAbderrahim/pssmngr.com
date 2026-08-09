/**
 * Mock libsodium-wrappers-sumo for unit tests.
 * The real package uses WASM and isn't available in the test container.
 * Implements a simple XOR-based cipher for structural testing.
 */
const NONCE_LEN = 24;
const TAG_LEN = 16;
const KEY_LEN = 32;

function keygen(): Uint8Array {
  const key = new Uint8Array(KEY_LEN);
  crypto.getRandomValues(key);
  return key;
}

function randombytes_buf(len: number): Uint8Array {
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  return buf;
}

/**
 * Fake AEAD encrypt: XOR plaintext with key+nonce, append a simple tag.
 * NOT cryptographically secure — test-only.
 */
function encrypt(
  plaintext: Uint8Array,
  _ad: null,
  _nsec: null,
  nonce: Uint8Array,
  key: Uint8Array,
): Uint8Array {
  const ct = new Uint8Array(plaintext.length + TAG_LEN);
  for (let i = 0; i < plaintext.length; i++) {
    ct[i] = plaintext[i] ^ key[i % key.length] ^ nonce[i % nonce.length];
  }
  // Simple tag based on key and nonce
  for (let i = 0; i < TAG_LEN; i++) {
    ct[plaintext.length + i] = key[i] ^ nonce[i % nonce.length];
  }
  return ct;
}

/**
 * Fake AEAD decrypt: verify tag, XOR ciphertext with key+nonce.
 */
function decrypt(
  _nsec: null,
  combined: Uint8Array,
  _ad: null,
  nonce: Uint8Array,
  key: Uint8Array,
): Uint8Array {
  const ctLen = combined.length - TAG_LEN;
  // Verify tag
  for (let i = 0; i < TAG_LEN; i++) {
    if (combined[ctLen + i] !== (key[i] ^ nonce[i % nonce.length])) {
      throw new Error("decryption failed");
    }
  }
  const plaintext = new Uint8Array(ctLen);
  for (let i = 0; i < ctLen; i++) {
    plaintext[i] = combined[i] ^ key[i % key.length] ^ nonce[i % nonce.length];
  }
  return plaintext;
}

function crypto_box_keypair() {
  return {
    publicKey: randombytes_buf(32),
    privateKey: randombytes_buf(32),
  };
}

function crypto_sign_keypair() {
  // Ed25519: 32-byte public key, 64-byte private (secret) key.
  return {
    publicKey: randombytes_buf(32),
    privateKey: randombytes_buf(64),
  };
}

const sodium = {
  ready: Promise.resolve(),
  crypto_aead_xchacha20poly1305_ietf_keygen: keygen,
  crypto_aead_xchacha20poly1305_ietf_NPUBBYTES: NONCE_LEN,
  crypto_aead_xchacha20poly1305_ietf_ABYTES: TAG_LEN,
  crypto_aead_xchacha20poly1305_ietf_encrypt: encrypt,
  crypto_aead_xchacha20poly1305_ietf_decrypt: decrypt,
  crypto_box_keypair,
  crypto_sign_keypair,
  randombytes_buf,
};

export default sodium;
export {
  keygen as crypto_aead_xchacha20poly1305_ietf_keygen,
  encrypt as crypto_aead_xchacha20poly1305_ietf_encrypt,
  decrypt as crypto_aead_xchacha20poly1305_ietf_decrypt,
  crypto_box_keypair,
  crypto_sign_keypair,
  randombytes_buf,
};
export const ready = Promise.resolve();
export const crypto_aead_xchacha20poly1305_ietf_NPUBBYTES = NONCE_LEN;
export const crypto_aead_xchacha20poly1305_ietf_ABYTES = TAG_LEN;
