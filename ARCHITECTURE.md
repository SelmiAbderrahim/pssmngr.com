# Architecture and security model

This document is the source of truth for pssmngr's architecture, trust boundaries, cryptographic profile, and principal data flows. Operational procedures live in `docs/`.

## System overview

pssmngr is a browser application backed by a Node.js API, PostgreSQL, and Redis.

```text
Browser
  ├─ React UI and in-memory vault state
  ├─ @pssmngr/crypto (encryption, key derivation, sharing)
  └─ HTTPS requests containing ciphertext and metadata
          │
          ▼
Host Nginx
  ├─ static client container
  └─ Node.js server (Better Auth + tRPC)
          ├─ PostgreSQL: accounts, metadata, ciphertext
          └─ Redis: rate-limit and transient coordination state
```

Production traffic must use HTTPS. Compose exposes the client and server only on host loopback; the host reverse proxy is the public entry point. PostgreSQL and Redis are not published to the host.

## Zero-knowledge boundary

Encryption and decryption of vault contents happen in the browser. The server must never receive:

- the master password;
- the generated Secret Key;
- the vault key or per-item data keys;
- plaintext vault fields, passwords, notes, card details, identities, or TOTP seeds;
- private sharing/signing keys in plaintext.

The server does receive information required to operate the service. This includes account email and profile data, organization and sharing relationships, device public keys, item type, favorite/deleted state, record identifiers and versions, timestamps, KDF parameters and salt, ciphertext envelopes, session IP/user-agent metadata, and audit events. Zero knowledge protects vault content; it does not hide all account metadata or traffic patterns.

`ENCRYPTION_KEY` is a legacy environment-variable name for a server-side HMAC key used for anti-enumeration responses and signed emergency-access metadata. It cannot decrypt vault data.

## Key derivation and authentication

At registration, the browser generates a random Secret Key and 16-byte salt. It derives a 32-byte vault key with Argon2id over the NFC-normalized master password plus the Secret Key. Current defaults are 128 MiB of memory, three iterations, and four lanes.

The authentication service never receives the master password or vault key. The browser derives a separate, domain-separated 32-byte authentication credential as HMAC-SHA-256 of the vault key with `pssmngr/authentication/v1`, encodes it with base64url, and submits that opaque credential to Better Auth. Better Auth hashes that credential with bcrypt before database storage.

The browser encrypts a fixed verification sentinel with the vault key. On login, it fetches the account's salt and encrypted verification blob, obtains the Secret Key from local IndexedDB or the recovery kit, derives the vault key, and verifies the blob locally before authenticating. Unknown emails receive deterministic same-shape dummy material to reduce account-enumeration differences.

The vault key remains in memory while unlocked. Optional persistent unlock stores only a locally wrapped key in IndexedDB and a server-side expiry timestamp; it does not send the key to the server. The Secret Key and encrypted device-private-key envelopes also use IndexedDB. Browser storage is part of the endpoint trust boundary.

## Vault encryption profile

New encrypted blobs use protocol version 2:

- XChaCha20-Poly1305 via libsodium;
- 32-byte keys;
- random 24-byte nonces;
- 16-byte authentication tags;
- protocol version and caller context bound as associated data.

Version 1 blobs remain decryptable for compatibility but are never produced for new writes. Version 2 detects version-field tampering and downgrade attempts through authenticated associated data.

Each item uses a random data key. The item payload is encrypted with that data key, and the data key is separately wrapped by the vault key. PostgreSQL stores the ciphertext, nonce, tag, wrapped data key, wrapping nonce/tag, and non-secret record metadata.

Cryptographic primitives live in `crypto/src/`. Application code must use those implementations rather than inventing new formats or algorithms.

## Sharing and emergency access

Devices generate X25519 key-agreement and Ed25519 signing key pairs in the browser. Public keys are stored by the server. Private keys are stored locally and may be uploaded only as vault-key-encrypted opaque envelopes.

Item sharing, shared-vault membership, recovery, and emergency-access envelopes are created client-side. Key agreement and HKDF derive recipient-specific wrapping keys; Ed25519 signatures cover recipient-bound, length-prefixed envelope fields. The server authorizes participants and stores or relays envelopes without decrypting them.

Removing a shared-vault member requires rotating the shared vault key and re-wrapping access for the remaining members. Server procedures re-check organization and vault ownership for every identifier supplied by a caller.

## Server responsibilities

The server provides:

- Better Auth sessions, opaque-credential authentication, optional OAuth, passkeys, and TOTP;
- tRPC authorization and active-organization scoping;
- ciphertext persistence, optimistic versions, soft deletion, and history;
- organization, family, sharing, emergency-access, notification, and export workflows;
- PostgreSQL migrations on production startup;
- Redis-backed rate limiting that fails closed on credential-sensitive endpoints;
- localized validation and transactional email through optional SMTP or Resend configuration.

Database access follows a load-then-authorize pattern. Reads and writes are scoped to `ctx.user.id` and the active organization where applicable; input identifiers are never treated as proof of ownership.

## Analytics and third parties

Google Analytics is absent unless `VITE_GA_MEASUREMENT_ID` is set and the user grants analytics consent. Analytics events must not include email, user IDs, vault fields, passwords, hashes, tokens, or ciphertext.

The optional Have I Been Pwned password check runs in the browser and uses the range API: only the first five hexadecimal characters of a SHA-1 hash are sent. Full hashes and plaintext passwords remain local.

SMTP/Resend receives email addresses and transactional message content when configured. Google/GitHub receives normal OAuth data when the operator enables those providers.

## Threat model

The design protects vault confidentiality if the database, backups, or server are read without control of an unlocked client. Authenticated encryption also detects ciphertext modification.

The following are outside that guarantee:

- a compromised browser, operating system, device, extension, or clipboard;
- malicious JavaScript delivered by a compromised deployment or dependency;
- an attacker controlling the page while the vault is unlocked;
- weak master passwords, exposed recovery kits, or stolen authenticated sessions;
- traffic and metadata analysis;
- denial of service;
- cryptographic implementation defects or supply-chain compromise.

TLS, strict asset control, dependency review, backups, patching, and endpoint security remain essential. A server operator can deny service or serve modified client code even though stored ciphertext alone is insufficient to decrypt a vault.

## Recovery limits

The server cannot perform a conventional password reset because it cannot derive or re-wrap the vault key. Email reset endpoints and server-side password-change endpoints are intentionally disabled. Recovery depends on client-held recovery material and the implemented organization/emergency envelope flows. Losing both the master password and necessary Secret Key is not recoverable by an operator.

## Repository boundaries

- `client/`: browser UI, vault state, API client, local storage, and application crypto orchestration
- `crypto/`: reviewed cryptographic primitives and serialized envelope types
- `pssmngr-server/apps/pssmngr/`: HTTP entry point and tRPC routers
- `pssmngr-server/packages/server/`: auth, schemas, email, i18n, jobs, and shared backend utilities
- `docker/`: production containers, Compose, and Nginx configuration

The supported public product is the web application. There is no browser extension, native mobile client, or offline PWA in this release.
