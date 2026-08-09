# @pssmngr/crypto

Client-side cryptography for [pssmngr](https://github.com/SelmiAbderrahim/pssmngr.com). This package is the canonical implementation for vault encryption, key derivation, envelope wrapping, sharing, recovery, and secure random generation.

## Profile

| Purpose | Primitive |
| --- | --- |
| Vault and envelope encryption | XChaCha20-Poly1305, 32-byte key, 24-byte nonce, 16-byte tag |
| Master-key derivation | Argon2id, default 128 MiB / 3 iterations / 4 lanes |
| Key agreement | X25519 |
| Signatures | Ed25519 |
| Randomness | Web Crypto and libsodium CSPRNGs |

New blobs use protocol version 2 with the version bound into authenticated associated data. Version 1 is supported for decryption only.

## Install and use

```bash
npm install @pssmngr/crypto
```

```ts
import {
  deriveVaultKey,
  generateSalt,
  generateSecretKey,
} from "@pssmngr/crypto";

const secretKey = generateSecretKey();
const salt = generateSalt();
const { vaultKey, kdfParams } = await deriveVaultKey({
  masterPassword,
  secretKey,
  salt,
});
```

Subpath exports include `key-derivation`, `vault`, `envelope`, `keypair`, `sharing`, `ephemeral`, `shared-vault`, `recovery`, `escrow`, `random`, and `types`.

```bash
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm test
pnpm run build
```

The resource-intensive Argon2id timing benchmark is separate from the unit suite:

```bash
pnpm run benchmark:kdf
```

Do not create new cryptographic formats outside this package. See the root [architecture and threat model](../ARCHITECTURE.md).

Licensed under AGPL-3.0-or-later; see the root [LICENSE](../LICENSE).
