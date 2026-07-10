#!/usr/bin/env bash
#
# Restore the SOWOCCUL Postgres database from a pg_dump custom-format file.
# ─────────────────────────────────────────────────────────────────────────────
# This OVERWRITES the target database's objects. Never point it at your live
# production database unless you are deliberately recovering from data loss.
# The normal, safe use is restoring INTO A SEPARATE database to test that your
# backups actually work (see scripts/restore-drill.sh).
#
# Usage:
#   TARGET_DATABASE_URL=postgres://... ./scripts/restore.sh path/to/backup.dump
#
# We use a separate variable name (TARGET_DATABASE_URL) on purpose, so you can't
# fat-finger a restore over production by having DATABASE_URL in your shell.

set -euo pipefail

DUMP_FILE="${1:-}"
if [[ -z "$DUMP_FILE" || ! -f "$DUMP_FILE" ]]; then
  echo "Usage: TARGET_DATABASE_URL=postgres://... $0 path/to/backup.dump" >&2
  exit 1
fi

if [[ -z "${TARGET_DATABASE_URL:-}" ]]; then
  echo "ERROR: TARGET_DATABASE_URL is not set (kept separate from DATABASE_URL on purpose)." >&2
  exit 1
fi

echo "[restore] Verifying dump archive ..."
pg_restore --list "$DUMP_FILE" > /dev/null

echo "[restore] Restoring $DUMP_FILE into target database ..."
# --clean --if-exists drops existing objects first so the restore is idempotent.
# --no-owner / --no-privileges so it lands cleanly under whatever role owns the
# target. --exit-on-error so a partial/corrupt restore fails loudly.
pg_restore \
  --clean --if-exists \
  --no-owner --no-privileges \
  --exit-on-error \
  --dbname "$TARGET_DATABASE_URL" \
  "$DUMP_FILE"

echo "[restore] Done. Verify row counts and try logging in before trusting it."
