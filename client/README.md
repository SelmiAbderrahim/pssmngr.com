# pssmngr web client

The React 18 browser application provides vault, sharing, organization, family, emergency-recovery, generator, watchtower, and settings interfaces. It supports English, Spanish, French, German, and Arabic with RTL layout.

Vault encryption, decryption, key derivation, and sharing envelope creation happen here through `@pssmngr/crypto`. The master password, Secret Key, vault key, item keys, and plaintext vault fields must never cross the API boundary.

```bash
pnpm install --frozen-lockfile
pnpm run dev
pnpm run lint:strict
pnpm run typecheck
pnpm run test
pnpm run build
```

Set `VITE_API_URL` when the backend is not available through the same origin. See the root [development guide](../docs/DEVELOPMENT.md) and [architecture](../ARCHITECTURE.md).
