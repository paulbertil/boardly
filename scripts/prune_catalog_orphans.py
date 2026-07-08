#!/usr/bin/env python3
"""
Reconcile `public.catalog_problems` against the staged snapshots: SOFT-DELETE (set
`deleted = true`) any live rows whose `source_catalog_id` is no longer in the staging
JSON for that slab. This is the reconcile pass import_catalog.py deliberately omits —
the upsert only adds/updates, so problems dropped by a re-fetch (or removed upstream)
would otherwise linger.

Soft-delete, not hard delete: `deleted` is the schema's tombstone (0002/0006). Clients
filter it out AND it propagates through the normal `updated_at > cursor` sync, so a hard
DELETE would instead leave already-cached clients stale. It's reversible (set it back to
false), so this never destroys data.

Only slabs PRESENT in catalog-data/ are touched — a slab you didn't stage is left alone.
Defaults to a DRY RUN; pass --apply to write.

Environment: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (writes need the service-role key).

Usage
-----
  # preview what would be tombstoned across every staged slab:
  SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… python3 scripts/prune_catalog_orphans.py --all
  # actually apply:
  … python3 scripts/prune_catalog_orphans.py --all --apply
  # one slab:
  … python3 scripts/prune_catalog_orphans.py --layout 3 --angle 25 --apply
"""

import argparse
import glob
import json
import os
import sys
from urllib.request import Request, urlopen
from urllib.error import HTTPError

PAGE = 1000
BATCH = 200  # ids per PATCH (kept well under URL length limits)


def _req(url, key, method, body=None, extra=None):
    headers = {"apikey": key, "Authorization": f"Bearer {key}"}
    if body is not None:
        headers["Content-Type"] = "application/json"
    if extra:
        headers.update(extra)
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urlopen(Request(url, data=data, headers=headers, method=method), timeout=120) as r:
            return r
    except HTTPError as e:
        sys.exit(f"{method} failed ({e.code}): {e.read().decode(errors='replace')}")


def live_ids(base_url, key, layout, angle):
    """All non-deleted source_catalog_ids currently in a slab."""
    ids, offset = set(), 0
    url = (f"{base_url}/rest/v1/catalog_problems?select=source_catalog_id"
           f"&layout_id=eq.{layout}&angle=eq.{angle}&deleted=is.false&order=source_catalog_id.asc")
    while True:
        r = _req(url, key, "GET", extra={"Range-Unit": "items", "Range": f"{offset}-{offset + PAGE - 1}"})
        batch = json.loads(r.read().decode())
        ids.update(row["source_catalog_id"] for row in batch)
        if len(batch) < PAGE:
            return ids
        offset += PAGE


def tombstone(base_url, key, ids):
    for i in range(0, len(ids), BATCH):
        chunk = ids[i:i + BATCH]
        in_list = ",".join(f'"{x}"' for x in chunk)
        url = f"{base_url}/rest/v1/catalog_problems?source_catalog_id=in.({in_list})"
        _req(url, key, "PATCH", body={"deleted": True}, extra={"Prefer": "return=minimal"})
        print(f"    tombstoned {min(i + BATCH, len(ids))}/{len(ids)}")


def staged_slabs(data_dir, layout, angle):
    out = []
    for path in sorted(glob.glob(os.path.join(data_dir, "*.json"))):
        cat = json.load(open(path))
        if "problems" not in cat or "layoutId" not in cat:
            continue
        if layout is not None and cat["layoutId"] != layout:
            continue
        if angle is not None and cat["angle"] != angle:
            continue
        out.append((cat["layoutId"], cat["angle"], {p["id"] for p in cat["problems"] if p.get("id")}))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--layout", type=int)
    ap.add_argument("--angle", type=int, choices=(25, 40))
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--apply", action="store_true", help="write the tombstones (default: dry run)")
    ap.add_argument("--dir", default=os.path.join(os.path.dirname(__file__), "..", "catalog-data"))
    args = ap.parse_args()
    if not args.all and args.layout is None:
        ap.error("pass --all or --layout N")

    base_url = (os.environ.get("SUPABASE_URL") or "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not base_url or not key:
        sys.exit("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.")

    slabs = staged_slabs(os.path.abspath(args.dir), args.layout, args.angle)
    if not slabs:
        sys.exit("No matching staged catalog files.")

    grand = 0
    for layout, angle, valid in slabs:
        live = live_ids(base_url, key, layout, angle)
        orphans = sorted(live - valid)
        print(f"layout {layout} @ {angle}°: {len(live)} live, {len(valid)} staged, {len(orphans)} orphaned")
        if orphans and args.apply:
            tombstone(base_url, key, orphans)
        grand += len(orphans)

    verb = "Tombstoned" if args.apply else "Would tombstone"
    print(f"\n{verb} {grand} orphaned row(s)." + ("" if args.apply else "  Re-run with --apply to write."))


if __name__ == "__main__":
    main()
