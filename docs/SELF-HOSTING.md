# Self-hosting pssmngr

This guide deploys the supported four-service stack: PostgreSQL, Redis, the Node.js server, and the static web client. A host Nginx instance terminates TLS and proxies the loopback-only application ports.

## Requirements

- A Linux host with Docker Engine and Docker Compose v2
- Git, Make, and OpenSSL
- A domain whose A/AAAA records point to the host
- A TLS certificate for that domain
- A backup destination outside the Docker host

Only ports 80 and 443 need to be public. Compose binds the client to `127.0.0.1:42789` and the server to `127.0.0.1:39291`; PostgreSQL and Redis have no host ports.

## 1. Install and configure

```bash
git clone https://github.com/SelmiAbderrahim/pssmngr.com
cd pssmngr
make configure
chmod 600 .env
```

`make configure` generates distinct random values for the database password, Redis password, Better Auth secret, and metadata HMAC key. It refuses to replace an existing `.env`.

Do not regenerate `.env` for an existing deployment. Changing `POSTGRES_PASSWORD` in the file does not rotate the password stored inside an existing PostgreSQL volume; restore the original value or deliberately rotate the database role before changing it.

Edit `.env` for production:

```dotenv
SITE_URL=https://vault.example.com
PASSKEY_RP_ID=vault.example.com
PASSKEY_ORIGIN=https://vault.example.com
```

Do not include a trailing slash in `SITE_URL`. Keep `IS_CLOUD=false`; it controls hosted-service email-verification policy, not product features. Keep every secret distinct and store a protected copy with your backups. `POSTGRES_PASSWORD` must remain URL-safe because it is embedded in `DATABASE_URL`.

If the browser will access the API from another origin, add exact comma-separated HTTPS origins to `TRUSTED_ORIGINS`. Same-origin deployment should leave it blank.

Validate and start:

```bash
make compose-config
make start-build
make ps
curl --fail http://127.0.0.1:39291/readyz
curl --fail http://127.0.0.1:42789/healthz
```

The server applies Drizzle migrations before listening in production. A failed migration keeps readiness unhealthy; inspect `make logs-server`.

## 2. Configure HTTPS

Obtain a certificate with your preferred ACME client before enabling the TLS server block. Then copy the example and replace every `vault.example.com` occurrence, including certificate paths:

```bash
sudo cp docker/nginx/pssmngr.conf.example /etc/nginx/sites-available/pssmngr
sudo sed -i 's/vault\.example\.com/your.domain.example/g' /etc/nginx/sites-available/pssmngr
sudo ln -s /etc/nginx/sites-available/pssmngr /etc/nginx/sites-enabled/pssmngr
sudo nginx -t
sudo systemctl reload nginx
```

Distribution layouts differ; place the file in the equivalent Nginx include directory if `sites-available` is not used. Review the generated file before reloading. The example provides HTTP-to-HTTPS redirect, HSTS, CSP, clickjacking and MIME protections, auth/API rate limits, and WebSocket-compatible proxy headers.

Do not expose pssmngr over plaintext HTTP outside localhost. The browser trust boundary depends on receiving the intended JavaScript and WebAssembly without modification.

## 3. Optional email

Self-hosted registration works without email verification. Invitations and other email-dependent actions require a provider.

For SMTP:

```dotenv
EMAIL_PROVIDER=smtp
EMAIL_FROM="pssmngr <vault@example.com>"
SMTP_SERVER=smtp.example.com
SMTP_PORT=587
SMTP_USERNAME=...
SMTP_PASSWORD=...
```

For Resend:

```dotenv
EMAIL_PROVIDER=resend
EMAIL_FROM="pssmngr <vault@example.com>"
RESEND_API_KEY=...
```

Restart the built server after changing server configuration:

```bash
make rebuild-server
```

## 4. Optional OAuth and passkeys

Set both ID and secret for each enabled OAuth provider. Typical callback URLs are:

- `https://vault.example.com/api/auth/callback/google`
- `https://vault.example.com/api/auth/callback/github`

OAuth sign-in does not replace the recovery kit required to unlock encrypted vault data.

Passkeys require HTTPS, except for browser-supported localhost development. `PASSKEY_RP_ID` is the hostname only; `PASSKEY_ORIGIN` includes the scheme and must match the public origin exactly.

## Operations

```bash
make ps                 # container and health status
make logs               # all logs
make logs-server        # backend logs
make stop               # preserve named volumes
make start              # start existing images
make rebuild-server     # apply backend source changes
make rebuild-client     # apply frontend source changes
make start-build        # rebuild and start the complete stack
```

Source edits are not live until the affected production image is rebuilt.

## Updating

1. Read the release notes and migration notes.
2. Create and verify a PostgreSQL backup.
3. Pull the desired tag or commit.
4. Run `make compose-config` and `make start-build`.
5. Confirm `/readyz`, sign-in, vault unlock, and a ciphertext round trip.

Pin a release tag in production instead of deploying an unreviewed moving branch.

## Recovery warning

There is intentionally no email master-password reset. The server cannot derive or replace the vault key. Ensure every user saves their recovery kit, and test the organization's documented recovery and emergency-access procedures before relying on them.

Continue with [backup and restore](BACKUP-RESTORE.md).
