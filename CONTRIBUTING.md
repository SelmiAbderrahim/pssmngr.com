# Contributing

Thanks for helping improve pssmngr. Because this is a security-sensitive project, small, reviewable changes with explicit tests are strongly preferred.

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md). Vulnerabilities belong in [private security reports](SECURITY.md), not issues or pull requests.

## Set up the repository

Use Node.js 20.19.x, pnpm 9.12.x, Docker Compose v2, Make, and OpenSSL.

```bash
git clone https://github.com/SelmiAbderrahim/pssmngr.git
cd pssmngr
make configure
make install
make start-build
```

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for hot-reload setup, integration tests, and workspace-specific commands.

## Non-negotiable security rules

- Never send or log a master password, Secret Key, vault key, item key, or plaintext vault field.
- Vault encryption is XChaCha20-Poly1305 and key derivation is Argon2id. Reuse `crypto/`; do not design application-specific cryptography in a feature patch.
- Scope every database operation to the caller and active organization, then re-check ownership of input IDs.
- Keep analytics free of PII, credentials, key material, hashes, tokens, ciphertext, and vault metadata.
- Every shipped feature must be available without a plan, payment, or runtime feature flag.
- Never commit `.env`, credentials, private keys, user exports, database dumps, logs, or local agent/prompt state.

Read [ARCHITECTURE.md](ARCHITECTURE.md) before changing authentication, cryptography, sharing, recovery, persistence, CSP, or authorization.

## Workflow

1. Create a focused branch from `main`.
2. Add or update tests with the implementation.
3. Run the checks relevant to every touched workspace; `make test`, `make typecheck`, `make lint`, and `make build` are the full local gates.
4. Run `gitleaks detect --source . --redact --no-banner` when Gitleaks is installed.
5. Open a pull request describing behavior, security impact, migration impact, and verification performed.

Use Conventional Commit messages where practical, for example `fix(server): scope vault lookup to organization`.

## Code and translations

- Preserve SPDX license headers on source files.
- Follow the existing TypeScript style; the client uses ESLint and the server uses Biome.
- Add user-facing strings to all five locales: `en`, `es`, `fr`, `de`, and `ar`.
- Verify Arabic layout in RTL as well as LTR languages.
- Do not claim an unshipped feature, external audit, performance result, or security guarantee in documentation.

## Pull-request checklist

- The zero-knowledge boundary is unchanged or explicitly analyzed.
- New queries enforce user and organization ownership.
- Failure paths fail closed for auth and authorization.
- Tests cover success, denial, malformed input, and cross-user access where relevant.
- Database and environment changes include migration and self-hosting notes.
- Documentation and examples contain placeholders only.

Maintainers may ask for a smaller patch or additional threat analysis before reviewing security-critical changes.
