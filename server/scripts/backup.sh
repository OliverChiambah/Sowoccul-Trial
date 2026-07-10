#!/usr/bin/env bash
#
# Backup the SOWOCCUL Postgres database to a timestamped, compressed dump.
# ─────────────────────────────────────────────────────────────────────────────
# Uses pg_dump's custom format (-Fc), which is compressed and can be restored
# selectively with pg_restore. This is the format you want for real backups.
#
# Usage:
#   DATABASE_URL=postgres://... ./scripts/backup.sh [output_dir]
#
# Defaults to ./backups. Keeps the last $KEEP dumps (default 14) and deletes
# older ones, so a daily cron gives you two weeks of history without filling
# the disk.
#
# Cron example (daily 02:15, log to file):
#   15 2 * * *  cd /app/server && DATABASE_URL=... ./scripts/backup.sh >> /var/log/sowoccul-backup.log 2>&1
#
# NOTE: On a managed host like Render you ALSO get automatic daily backups from
# the provider. This script is your own independent copy — belt and braces. A
# cooperative should never rely on a single backup mechanism.

set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL is not set." >&2
  exit 1
fi

OUT_DIR="${1:-./backups}"
KEEP="${KEEP:-14}"
mkdir -p "$OUT_DIR"

STAMP="$(date -u +%Y%m%d-%H%M%SZ)"
OUT_FILE="$OUT_DIR/sowoccul-$STAMP.dump"

echo "[backup] Dumping database to $OUT_FILE ..."
# -Fc custom format, -Z6 compression level, --no-owner so it restores cleanly
# into a differently-named role on another host.
pg_dump "$DATABASE_URL" -Fc -Z6 --no-owner --no-privileges -f "$OUT_FILE"

# Basic integrity check: pg_restore --list should parse the archive.
if ! pg_restore --list "$OUT_FILE" > /dev/null 2>&1; then
  echo "[backup] ERROR: produced dump failed pg_restore --list check. Removing." >&2
  rm -f "$OUT_FILE"
  exit 1
fi

SIZE="$(du -h "$OUT_FILE" | cut -f1)"
echo "[backup] OK — $OUT_FILE ($SIZE)"

# Prune old dumps, keeping the newest $KEEP.
mapfile -t OLD < <(ls -1t "$OUT_DIR"/sowoccul-*.dump 2>/dev/null | tail -n +$((KEEP + 1)) || true)
if [[ ${#OLD[@]} -gt 0 ]]; then
  echo "[backup] Pruning ${#OLD[@]} old dump(s) beyond the newest $KEEP."
  for f in "${OLD[@]}"; do rm -f "$f"; echo "  removed $f"; done
fi

echo "[backup] Done."
