# pssmngr

Self-hostable, zero-knowledge password management for the web.

[![CI](https://github.com/SelmiAbderrahim/pssmngr.com/actions/workflows/ci.yml/badge.svg)](https://github.com/SelmiAbderrahim/pssmngr.com/actions/workflows/ci.yml)
[![CodeQL](https://github.com/SelmiAbderrahim/pssmngr.com/actions/workflows/codeql.yml/badge.svg)](https://github.com/SelmiAbderrahim/pssmngr.com/actions/workflows/codeql.yml)
[![License: AGPL-3.0-or-later](https://img.shields.io/badge/license-AGPL--3.0--or--later-blue.svg)](LICENSE)

pssmngr encrypts and decrypts vault data in the browser. The backend stores opaque ciphertext and the non-secret metadata needed to synchronize, share, and organize it. The master password, Secret Key, vault key, item keys, and plaintext vault contents are not sent to the server.

## Features

- Logins, secure notes, payment cards, and identities
- Per-item envelope encryption with XChaCha20-Poly1305
- Argon2id key derivation from the master password and a generated Secret Key
- Password generation, history, local security analysis, and opt-in HIBP k-anonymity checks
- Organizations, family membership, shared vaults, item sharing, and signed emergency-recovery envelopes
- TOTP two-factor authentication, passkeys, sessions, and optional Google/GitHub sign-in
- Import/export and server-generated account data exports containing encrypted vault records
- English, Spanish, French, German, and Arabic interfaces, including RTL layout
- Dark mode and responsive browser UI
- Docker Compose deployment with PostgreSQL, Redis, and loopback-only application ports

Every feature in this repository ships enabled. There are no paid tiers, plan gates, or runtime feature flags.

## Important recovery model

Save the recovery kit shown during registration. A new browser needs the Secret Key from that kit in addition to the master password. The server cannot reset the master password or reconstruct either key; losing the required recovery material can make the vault permanently inaccessible.

## Quick start

Prerequisites: Git, Docker Engine with Docker Compose v2, Make, and OpenSSL.

```bash
git clone https://github.com/SelmiAbderrahim/pssmngr.com.git
cd pssmngr
make configure
make start-build
make ps
```

Open <http://localhost:42789>. `make configure` creates a mode-600 `.env` with unique random local secrets and never overwrites an existing file.

For an internet-facing installation, do not use the localhost defaults. Follow [the self-hosting guide](docs/SELF-HOSTING.md) to configure a domain, TLS, backups, email, OAuth, and passkeys.

## Repository layout

| Path | Purpose |
| --- | --- |
| `client/` | React 18 + Vite browser application |
| `crypto/` | `@pssmngr/crypto` client cryptography package |
| `pssmngr-server/` | Node.js, tRPC, Better Auth, Drizzle, and PostgreSQL backend |
| `docker/` | Production images, Compose stack, and Nginx examples |
| `docs/` | Operations and contributor documentation |

The supported distribution is the web application. A browser extension, native mobile application, and offline PWA are not included in this repository.

## Documentation

- [Self-hosting](docs/SELF-HOSTING.md)
- [Backup and restore](docs/BACKUP-RESTORE.md)
- [Development](docs/DEVELOPMENT.md)
- [Architecture and threat model](ARCHITECTURE.md)
- [Security policy](SECURITY.md)
- [Contributing](CONTRIBUTING.md)
- [Support](SUPPORT.md)

## Security status

The cryptographic design and security boundaries are documented in [ARCHITECTURE.md](ARCHITECTURE.md). The project has extensive automated security regression tests, but it has not claimed an independent third-party audit. Review the threat model before protecting high-value data.

Report vulnerabilities through [GitHub private vulnerability reporting](SECURITY.md). Do not open a public issue with exploit details or real user data.

## License

The source is licensed under [GNU AGPL v3.0 or later](LICENSE). If you modify the program and let users interact with it over a network, the license includes source-availability obligations; read the license itself for the controlling terms.

Project names and marks are addressed separately in [TRADEMARK.md](TRADEMARK.md).
