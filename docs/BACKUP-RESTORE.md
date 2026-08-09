# Backup and restore

Backups protect availability, not plaintext confidentiality. A PostgreSQL dump contains encrypted vault records but also account metadata, email addresses, sessions, OAuth records, device public keys, and sharing relationships. Store and transport it as sensitive data.

## What to back up

Required:

- PostgreSQL;
- the exact `.env` secrets used by the instance;
- the deployed pssmngr release or commit identifier.

Optional:

- the `data_exports` volume if active, time-limited account exports must survive host loss;
- Nginx configuration and certificate-renewal configuration.

Redis contains transient rate-limit and coordination state and can normally be recreated. It is persisted for restart continuity but is not the vault system of record.

User recovery kits are not stored by the server and must be backed up by each user separately.

## Create a PostgreSQL dump

From the repository directory while PostgreSQL is running:

```bash
umask 077
docker compose --file docker/compose/docker-compose.yml --env-file .env \
  exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' \
  > pssmngr.dump
```

Copy `pssmngr.dump`, `.env`, and a text file containing the deployed Git commit to encrypted storage on another system. Apply your normal retention policy and periodically perform a test restore.

Validate the dump structure without restoring it:

```bash
pg_restore --list pssmngr.dump >/dev/null
```

This requires PostgreSQL client tools on the host.

## Restore into an empty instance

The following operation replaces the target database. Verify the host, repository directory, `.env`, and database name before proceeding.

1. Check out the same pssmngr version used to create the backup.
2. Restore the backed-up `.env` with mode `600`.
3. Start PostgreSQL and Redis only.
4. Restore the dump.
5. Start the application and let it apply any migrations required by the checked-out version.

```bash
docker compose --file docker/compose/docker-compose.yml --env-file .env up -d postgres redis
docker compose --file docker/compose/docker-compose.yml --env-file .env \
  exec -T postgres sh -c 'dropdb --if-exists -U "$POSTGRES_USER" "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
docker compose --file docker/compose/docker-compose.yml --env-file .env \
  exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-privileges' \
  < pssmngr.dump
make start-build
```

The `dropdb` command is destructive and targets the database named by the container's `POSTGRES_DB`. Do not run it against an instance that contains data you still need.

Verify readiness, user authentication, vault unlock, shared-vault access, and a new encrypted item write. A database-only restore with different `BETTER_AUTH_SECRET` invalidates existing sessions. Losing `ENCRYPTION_KEY` can invalidate signed metadata flows. Neither server secret can decrypt vault ciphertext.

## Volume-level backups

If your platform snapshots Docker volumes, quiesce PostgreSQL or use storage snapshots that are explicitly database-consistent. A copied live data directory is not a substitute for a tested `pg_dump` unless the snapshot system guarantees consistency.

Account export files expire and are purged by the server. They should not be treated as the primary backup format.
