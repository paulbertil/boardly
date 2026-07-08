#!/usr/bin/env python3
"""
Dump the current `public.catalog_problems` table to a local JSON file — a rollback
point to take BEFORE re-importing the catalog (import_catalog.py). If an import goes
wrong, restore by feeding this file back through import_catalog.py (it upserts on the
same primary key), or by re-inserting rows directly.

The dump preserves EVERY column (incl. updated_at and deleted), so a restore is exact.

    fetch_boardsesh.py -> catalog-data/*.json -> [BACKUP] -> import_catalog.py -> Supabase
                                                                                     |
                                                                          [BACKUP again to roll forward]

Environment
-----------
  SUPABASE_URL               e.g. https://abcdefgh.supabase.co
  SUPABASE_SERVICE_ROLE_KEY  service_role key (anon also works — catalog is public-read —
                             but service-role is used for parity with the import step)

Usage
-----
  SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… python3 scripts/backup_catalog_problems.py
  # writes ./catalog_problems_backup_<UTC-timestamp>.json  (override with a path arg)
"""

import json
import os
import sys
from datetime import datetime, timezone
from urllib.request import Request, urlopen
from urllib.error import HTTPError

PAGE = 1000  # rows per PostgREST range request


def _get(url, headers):
    req = Request(url, headers=headers, method="GET")
    try:
        with urlopen(req, timeout=120) as r:
            return json.loads(r.read().decode()), r.headers.get("Content-Range")
    except HTTPError as e:
        sys.exit(f"Read failed ({e.code}): {e.read().decode(errors='replace')}")


def main():
    base_url = (os.environ.get("SUPABASE_URL") or "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not base_url or not key:
        sys.exit("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.")

    out_path = sys.argv[1] if len(sys.argv) > 1 else (
        "catalog_problems_backup_" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + ".json")

    # Order by the PK so paging is stable; ask PostgREST for the total via Range.
    base = f"{base_url}/rest/v1/catalog_problems?select=*&order=source_catalog_id.asc"
    rows, offset = [], 0
    while True:
        headers = {
            "apikey": key, "Authorization": f"Bearer {key}",
            "Range-Unit": "items", "Range": f"{offset}-{offset + PAGE - 1}",
        }
        batch, content_range = _get(base, headers)
        rows.extend(batch)
        total = None
        if content_range and "/" in content_range:
            tail = content_range.split("/")[-1]
            total = int(tail) if tail.isdigit() else None
        print(f"  fetched {len(rows)}" + (f"/{total}" if total else ""))
        if len(batch) < PAGE:
            break
        offset += PAGE

    with open(out_path, "w") as f:
        json.dump({"table": "catalog_problems", "count": len(rows),
                   "dumped_at": datetime.now(timezone.utc).isoformat(), "rows": rows}, f, ensure_ascii=False)
    print(f"\nBacked up {len(rows)} rows -> {os.path.abspath(out_path)}")
    print("Restore (if needed): re-run import_catalog.py against staging, or re-upsert these rows.")


if __name__ == "__main__":
    main()
