#!/bin/sh
# Clean E2E test data before running tests.
# Removes test users and rate-limit keys so tests start fresh.

echo "[e2e-cleanup] Flushing Redis rate-limit keys..."
docker exec pssmngr-redis redis-cli EVAL "local k = redis.call('KEYS','rl:*') if #k > 0 then return redis.call('DEL',unpack(k)) end return 0" 0 2>/dev/null

echo "[e2e-cleanup] Removing E2E test users from database..."
docker exec pssmngr-postgres psql -U pssmngr -d pssmngr -c "
  DELETE FROM account WHERE user_id IN (SELECT id FROM \"user\" WHERE email LIKE 'e2e-%@test.local');
  DELETE FROM member WHERE user_id IN (SELECT id FROM \"user\" WHERE email LIKE 'e2e-%@test.local');
  DELETE FROM \"user\" WHERE email LIKE 'e2e-%@test.local';
" 2>/dev/null

echo "[e2e-cleanup] Done."
