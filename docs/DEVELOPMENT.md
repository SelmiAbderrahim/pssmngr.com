# Development

## Toolchain

- Node.js 20.19.x
- pnpm 9.12.x
- Docker Engine and Docker Compose v2
- Make and OpenSSL

The repository has three JavaScript workspaces with independent lockfiles: `crypto/`, `client/`, and `pssmngr-server/`.

```bash
make configure
make install
```

## Production-like local stack

```bash
make start-build
make logs
```

Open <http://localhost:42789>. This uses production builds. Rebuild after source changes with `make rebuild-client`, `make rebuild-server`, or `make start-build`.

## Workspace commands

```bash
make typecheck
make lint
make test
make build
```

Equivalent focused commands:

```bash
cd crypto && pnpm test && pnpm run typecheck && pnpm run build
cd client && pnpm run lint:strict && pnpm run typecheck && pnpm run test && pnpm run build
cd pssmngr-server && pnpm run format-and-lint && pnpm run typecheck && pnpm run test && pnpm run build
```

The client unit suite runs in eight shards to keep memory use predictable. Browser E2E tests use Playwright and may require `pnpm exec playwright install --with-deps chromium` on a new machine.

## Backend integration tests

The family/shared-vault integration suite requires a dedicated migrated PostgreSQL database. Never point it at a database containing data.

```bash
export TEST_DATABASE_URL='postgresql://pssmngr:test-only-password@127.0.0.1:5432/pssmngr_test' # gitleaks:allow -- documented local-only credential
cd pssmngr-server/apps/pssmngr
DATABASE_URL="$TEST_DATABASE_URL" pnpm run migration:run
pnpm run test:integration
```

Use credentials appropriate to your local test database. The suite truncates its target tables.

## Client and server development

Run the backend with `pnpm run dev` from `pssmngr-server/apps/pssmngr` after providing `DATABASE_URL`, `REDIS_URL`, `SITE_URL`, `BETTER_AUTH_SECRET`, and `ENCRYPTION_KEY`. Run `pnpm run dev` from `client/` and set `VITE_API_URL` to the backend origin. The Vite dev server listens on port 5173; the Node server defaults to port 3000.

For same-origin behavior and security-header testing, prefer the production-like Docker stack.

## Database changes

Schemas live in `pssmngr-server/packages/server/src/db/schema/`. Generate a migration from `pssmngr-server/apps/pssmngr`:

```bash
pnpm run migration:generate
```

Review generated SQL and snapshots. Do not use `db:push` for a change intended for release. Production applies committed migrations at startup.

## Translation changes

Update all five server and client locales (`en`, `es`, `fr`, `de`, `ar`) and regenerate server translation types when keys change:

```bash
cd pssmngr-server/packages/server
pnpm run i18n:generate-types
```

Use the actual script name from `package.json` if it changes; CI checks locale parity.

## Security checks

```bash
gitleaks detect --source . --redact --no-banner
pnpm --dir crypto audit --prod --audit-level=high
pnpm --dir client audit --prod --audit-level=high
pnpm --dir pssmngr-server audit --prod --audit-level=high
```

Never place a real credential in a test fixture. If one is committed, revoke it immediately; deleting it in a later commit is not sufficient.
