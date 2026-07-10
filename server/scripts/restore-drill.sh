#!/usr/bin/env bash
#
# Restore DRILL — proves a backup actually works, end to end.
# ─────────────────────────────────────────────────────────────────────────────
# A backup you have never restored is not a backup; it's a hope. This script:
#
#   1. Takes a fresh backup of the live database (or uses one you pass in).
#   2. Restores it into a SCRATCH database (never the live one).
#   3. Compares row counts of every table between live and restored.
#   4. Reports PASS/FAIL and cleans up the scratch database.
#
# Run it on a schedule (e.g. weekly) so you find out backups are broken BEFORE
# you need them, not during an emergency.
#
# Requirements:
#   • DATABASE_URL         — the live database (read-only use here: dump + counts)
#   • ADMIN_DATABASE_URL   — a connection allowed to CREATE/DROP DATABASE, on the
#                            same server, e.g. the maintenance "postgres" db.
#                            The scratch db is created and dropped through this.
#
# Usage:
#   DATABASE_URL=postgres://.../sowoccul \
#   ADMIN_DATABASE_URL=postgres://.../postgres \
#   ./scripts/restore-drill.sh [existing-backup.dump]
#
# On a managed host where you can't CREATE DATABASE, run this against a local
# Postgres instead (same Postgres version), or use the host's "fork/restore to
# new instance" feature and point DATABASE_URL/TARGET at that fork.

set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"

if [[ -z "${DATABASE_URL:-}" ]]; then echo "ERROR: DATABASE_URL not set." >&2; exit 1; fi
if [[ -z "${ADMIN_DATABASE_URL:-}" ]]; then echo "ERROR: ADMIN_DATABASE_URL not set." >&2; exit 1; fi

TABLES=(users accounts transactions loan_applications loan_repayments \
        site_content images branches correction_requests issued_statements audit_log)

SCRATCH_DB="sowoccul_drill_$(date -u +%Y%m%d%H%M%S)"

# Derive a TARGET_DATABASE_URL for the scratch db by swapping the db name in
# ADMIN_DATABASE_URL's path.
TARGET_DATABASE_URL="$(printf '%s' "$ADMIN_DATABASE_URL" | sed -E "s#/[^/?]+(\?|\$)#/$SCRATCH_DB\1#")"

echo "[drill] Scratch database: $SCRATCH_DB"

cleanup() {
  echo "[drill] Dropping scratch database ..."
  psql "$ADMIN_DATABASE_URL" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS $SCRATCH_DB;" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# 1. Get a backup.
if [[ -n "${1:-}" && -f "$1" ]]; then
  DUMP="$1"
  echo "[drill] Using existing backup: $DUMP"
else
  DUMP="$(mktemp -t sowoccul-drill-XXXX).dump"
  echo "[drill] Taking a fresh backup ..."
  pg_dump "$DATABASE_URL" -Fc -Z6 --no-owner --no-privileges -f "$DUMP"
fi

# 2. Create scratch db and restore into it.
echo "[drill] Creating scratch database ..."
psql "$ADMIN_DATABASE_URL" -v ON_ERROR_STOP=1 -c "CREATE DATABASE $SCRATCH_DB;" >/dev/null

echo "[drill] Restoring backup into scratch database ..."
TARGET_DATABASE_URL="$TARGET_DATABASE_URL" "$here/restore.sh" "$DUMP" >/dev/null

# 3. Compare row counts table by table.
echo "[drill] Comparing row counts (live vs restored) ..."
FAIL=0
for t in "${TABLES[@]}"; do
  live="$(psql "$DATABASE_URL" -tAc "SELECT COUNT(*) FROM $t" 2>/dev/null || echo "ERR")"
  rest="$(psql "$TARGET_DATABASE_URL" -tAc "SELECT COUNT(*) FROM $t" 2>/dev/null || echo "ERR")"
  if [[ "$live" == "$rest" && "$live" != "ERR" ]]; then
    printf '  ✓ %-22s %s\n' "$t" "$live"
  else
    printf '  ✗ %-22s live=%s restored=%s\n' "$t" "$live" "$rest"
    FAIL=1
  fi
done

echo
if [[ "$FAIL" -eq 0 ]]; then
  echo "[drill] PASS — every table's row count matched. Backups restore cleanly."
else
  echo "[drill] FAIL — counts did not match. Investigate before trusting backups." >&2
  exit 1
fi
