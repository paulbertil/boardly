#!/usr/bin/env python3
"""
Restore `public.catalog_problems` from a backup_catalog_problems.py dump — the rollback
step for a bad import or prune.

Upserts every row from the dump verbatim on the primary key (source_catalog_id),
INCLUDING the `deleted` column — so this also UN-tombstones rows a prune soft-deleted
(which import_catalog.py cannot, since it never writes `deleted`). `updated_at` is NOT
sent: the server trigger re-stamps it, which is what makes clients re-sync the restored
state on their next pull.

This does not DELETE rows that exist now but were absent from the backup (a restore is a
roll-back-to-snapshot for the rows it contains, not a table replace). If the failure you're
undoing added spurious rows, prune them separately.

Environment: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (service-role bypasses RLS to write).

Usage
-----
  SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… \
    python3 scripts/restore_catalog_problems.py catalog_problems_backup_<ts>.json
"""

import json
import os
import sys
from urllib.request import Request, urlopen
from urllib.error import HTTPError

BATCH = 500
# Columns to write back. `updated_at` is intentionally excluded (trigger-managed); every
# other column — including `deleted` — is restored so the snapshot is reproduced exactly.
COLUMNS = ("source_catalog_id", "layout_id", "angle", "name", "grade", "user_grade",
           "setter", "stars", "repeats", "is_benchmark", "method", "holds", "deleted")


def _upsert(base_url, key, rows):
    url = f"{base_url}/rest/v1/catalog_problems"
    headers = {
        "Content-Type": "application/json", "apikey": key, "Authorization": f"Bearer {key}",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }
    req = Request(url, data=json.dumps(rows).encode(), headers=headers, method="POST")
    try:
        with urlopen(req, timeout=120) as r:
            return r.status
    except HTTPError as e:
        sys.exit(f"Upsert failed ({e.code}): {e.read().decode(errors='replace')}")


def main():
    if len(sys.argv) < 2:
        sys.exit("Usage: restore_catalog_problems.py <backup.json>")
    base_url = (os.environ.get("SUPABASE_URL") or "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not base_url or not key:
        sys.exit("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.")

    with open(sys.argv[1]) as f:
        dump = json.load(f)
    src = dump.get("rows")
    if not isinstance(src, list):
        sys.exit("Not a backup_catalog_problems.py dump (no `rows` array).")
    rows = [{c: r.get(c) for c in COLUMNS} for r in src if r.get("source_catalog_id")]
    print(f"Restoring {len(rows)} rows from {os.path.basename(sys.argv[1])}…")

    for i in range(0, len(rows), BATCH):
        _upsert(base_url, key, rows[i:i + BATCH])
        print(f"  restored {min(i + BATCH, len(rows))}/{len(rows)}")
    print(f"\nDone. Restored {len(rows)} rows (deleted flags included; updated_at re-stamped).")


if __name__ == "__main__":
    main()
