# Changelog

Notable project changes are documented here. The format follows Keep a Changelog and versions follow Semantic Versioning.

## [Unreleased]

### Added

- Initial public web release of the pssmngr zero-knowledge password manager.
- React browser client, tRPC backend, PostgreSQL/Redis persistence, and Docker Compose deployment.
- XChaCha20-Poly1305 vault encryption, Argon2id key derivation, item envelope encryption, signed sharing envelopes, and recovery kit flow.
- Organizations, families, shared vaults, emergency access, passkeys, TOTP, data export, five languages, and RTL support.
- Self-hosting, backup/restore, architecture, security, governance, and contribution documentation.

### Security

- Authentication uses a domain-separated secret derived from the client vault key; the master password and vault key are never submitted to the authentication service.
- Password reset and server-side password-change endpoints are disabled because they cannot safely re-key a zero-knowledge vault.
- Authentication and TOTP endpoints are rate limited through Redis and fail closed if rate-limit state is unavailable.
- Queries and mutations enforce caller and active-organization ownership.
- New ciphertext uses version-bound associated data; legacy version-1 blobs remain decryptable.

[Unreleased]: https://github.com/SelmiAbderrahim/pssmngr.com/commits/main
