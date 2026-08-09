# pssmngr contributor and agent guide

`ARCHITECTURE.md` is the comprehensive source of truth. This file is a concise operational guardrail.

## Project identity

pssmngr is an AGPL-licensed, self-hostable, zero-knowledge web password manager. The browser performs encryption and decryption; the server stores ciphertext and required metadata.

| Path | Purpose |
| --- | --- |
| `client/` | React, TypeScript, TanStack Router/Query, Tailwind, Vite |
| `crypto/` | XChaCha20-Poly1305, Argon2id, X25519, Ed25519 |
| `pssmngr-server/` | Node.js, tRPC, Better Auth, Drizzle, PostgreSQL, Redis |
| `docker/` | Docker Compose, images, and Nginx configuration |

## Critical rules

1. The server, logs, analytics, and third parties must never receive plaintext vault data, the master password, Secret Key, vault key, data keys, or private keys.
2. Vault encryption is XChaCha20-Poly1305 and key derivation is Argon2id. Reuse `crypto/`; never substitute or invent cryptography.
3. Authentication receives only the domain-separated credential derived in `client/src/lib/auth-credential.ts`, never the master password or vault key.
4. Scope database reads and writes to `ctx.user.id` and the active organization, then re-check ownership of every input ID. Follow `vaultScope` / `getOwnedVault` patterns.
5. Backend production images are built artifacts. Run `make rebuild-server` before claiming a server change is live; use `make rebuild-client` for client changes.
6. Make only honest, shipped claims. Do not use “unhackable,” “military-grade,” fake audit claims, or fake social proof.
7. Every feature ships enabled. Do not add payment gates, plans, quotas, or runtime feature flags.
8. Analytics is optional, consent-gated Google Analytics and must contain no PII, identifiers, auth data, hashes, ciphertext, or vault metadata.
9. Never run `git stash`. Never commit secrets; use `.gitleaks.toml` and `.gitignore`.

## Sources of truth

| Concern | File |
| --- | --- |
| Architecture and threat model | `ARCHITECTURE.md` |
| Self-hosting | `docs/SELF-HOSTING.md` |
| Crypto implementation | `crypto/src/` |
| API routers | `pssmngr-server/apps/pssmngr/server/api/routers/` |
| Database schema | `pssmngr-server/packages/server/src/db/schema/` |
| Commands | `Makefile` and `docs/DEVELOPMENT.md` |

## Common commands

```bash
make start-build
make rebuild-server
make rebuild-client
make stop
make logs
make test
make lint
make typecheck
make build
make compose-config
```
