#!/bin/bash
set -e

echo "pssmngr entrypoint starting..."

# Database migrations are handled by server.ts on startup (production mode).

echo "Starting main application..."
exec "$@"
