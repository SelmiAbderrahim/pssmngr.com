#!/bin/sh
set -eu

if [ -e .env ]; then
	echo ".env already exists; leaving it unchanged."
	exit 0
fi

if ! command -v openssl >/dev/null 2>&1; then
	echo "openssl is required to generate local secrets." >&2
	exit 1
fi

umask 077
cp .env.example .env

postgres_password=$(openssl rand -hex 32)
redis_password=$(openssl rand -hex 32)
auth_secret=$(openssl rand -hex 32)
metadata_secret=$(openssl rand -hex 32)

sed -i.bak \
	-e "s/replace-with-a-long-url-safe-random-value/$postgres_password/" \
	-e "s/replace-with-a-different-long-random-value/$redis_password/" \
	-e "s/replace-with-at-least-32-random-characters/$auth_secret/" \
	-e "s/replace-with-at-least-32-different-random-characters/$metadata_secret/" \
	.env
rm -f .env.bak

echo "Created .env with unique random secrets."
echo "Local defaults are ready; edit SITE_URL and PASSKEY_* before production use."
