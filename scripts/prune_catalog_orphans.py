#!/usr/bin/env python3
"""
Reconcile `public.catalog_problems` against the staged snapshots: SOFT-DELETE (set
`deleted = true`) any live rows whose `source_catalog_id` is no longer in the staging
JSON for that slab. This is the reconcile pass import_catalog.py deliberately omits —
the upsert only adds/updates, so problems dropped by a re-fetch (or removed upstream)
would otherwise linger.

Soft-delete, not hard delete: `deleted` is the schema's tombstone (0002/0006). Clients
filter it out AND it propagates through the normal `updated_at > cursor` sync, so a hard
DELETE would instead leave already-cached clients stale. It's reversible — restore with
restore_catalog_problems.py — so this never destroys data.

SAFETY. Tombstoning is driven by "in Supabase but not in staging", so a bad staging set
(an interrupted/failed fetch that wrote `"problems": []`, or a reduced boardsesh slice)
would orphan an entire slab. Guards: a slab whose staged set is EMPTY is never tombstoned,
and a slab whose orphan fraction exceeds --max-orphan-fraction is skipped. Both refusals
are overridable with --force. Multiple staged files for the same (layout, angle) are
UNIONED, not treated as competing slabs. Defaults to a DRY RUN; pass --apply to write.

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
import re
import sys
import time
from urllib.request import Request, urlopen
from urllib.error import HTTPError

PAGE = 1000
BATCH = 200  # ids per PATCH (kept well under URL length limits)
MAX_ORPHAN_FRACTION = 0.20  # default cap; a slab losing >20% of its rows needs --force
# source_catalog_id is a boardsesh UUIDv5 string. We interpolate ids into a PostgREST
# `in.(...)` filter, so anything outside this charset (a quote/comma/paren) could break or
# broaden the filter — refuse rather than build a filter we can't trust.
ID_RE = re.compile(r"^[A-Za-z0-9-]+$")


def _req(url, key, method, body=None, extra=None, retries=4):
    headers = {"apikey": key, "Authorization": f"Bearer {key}"}
    if body is not None:
        headers["Content-Type"] = "application/json"
    if extra:
        headers.update(extra)
    data = json.dumps(body).encode() if body is not None else None
    for attempt in range(retries):
        try:
            # Read the body INSIDE the context manager — returning the response object would
            # hand back an already-closed stream (r.read() → b''). Also return Content-Range
            # so paged GETs can terminate on the reported total (see live_ids).
            with urlopen(Request(url, data=data, headers=headers, method=method), timeout=120) as r:
                return r.read(), r.headers.get("Content-Range")
        except HTTPError as e:
            if e.code in (429, 502, 503) and attempt < retries - 1:
                time.sleep(2 * (attempt + 1))
                continue
            sys.exit(f"{method} failed ({e.code}): {e.read().decode(errors='replace')}")


def live_ids(base_url, key, layout, angle):
    """All non-deleted source_catalog_ids currently in a slab."""
    ids, offset, total = set(), 0, None
    url = (f"{base_url}/rest/v1/catalog_problems?select=source_catalog_id"
           f"&layout_id=eq.{layout}&angle=eq.{angle}&deleted=is.false&order=source_catalog_id.asc")
    # Terminate on the Content-Range total, advancing by the rows actually returned — so a
    # server capping responses below PAGE neither under-reads (misreading a short page as the
    # last) nor over-reads past the end (a 416 on an out-of-range offset).
    while total is None or offset < total:
        raw, content_range = _req(url, key, "GET",
                                  extra={"Range-Unit": "items", "Range": f"{offset}-{offset + PAGE - 1}"})
        batch = json.loads(raw.decode())
        ids.update(row["source_catalog_id"] for row in batch)
        if content_range and "/" in content_range:
            tail = content_range.rsplit("/", 1)[-1]
            if tail.isdigit():
                total = int(tail)
        if not batch:
            break
        offset += len(batch)
    return ids


def tombstone(base_url, key, ids):
    bad = [x for x in ids if not ID_RE.match(x)]
    if bad:
        sys.exit(f"Refusing to tombstone: {len(bad)} id(s) are not plain UUID-shaped, e.g. {bad[0]!r}")
    for i in range(0, len(ids), BATCH):
        chunk = ids[i:i + BATCH]
        in_list = ",".join(f'"{x}"' for x in chunk)
        url = f"{base_url}/rest/v1/catalog_problems?source_catalog_id=in.({in_list})"
        _req(url, key, "PATCH", body={"deleted": True}, extra={"Prefer": "return=minimal"})
        print(f"    tombstoned {min(i + BATCH, len(ids))}/{len(ids)}")


def staged_slabs(data_dir, layout, angle):
    """Union staged ids per (layout, angle) — multiple files for one slab must not
    compete (each would treat the other's ids as orphans)."""
    by_slab = {}
    for path in sorted(glob.glob(os.path.join(data_dir, "*.json"))):
        cat = json.load(open(path))
        if "problems" not in cat or "layoutId" not in cat:
            continue
        if layout is not None and cat["layoutId"] != layout:
            continue
        if angle is not None and cat["angle"] != angle:
            continue
        key = (cat["layoutId"], cat["angle"])
        by_slab.setdefault(key, set()).update(p["id"] for p in cat["problems"] if p.get("id"))
    return [(lay, ang, ids) for (lay, ang), ids in sorted(by_slab.items())]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--layout", type=int)
    ap.add_argument("--angle", type=int, choices=(25, 40))
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--apply", action="store_true", help="write the tombstones (default: dry run)")
    ap.add_argument("--force", action="store_true",
                    help="override the empty-staging and max-orphan-fraction safety refusals")
    ap.add_argument("--max-orphan-fraction", type=float, default=MAX_ORPHAN_FRACTION,
                    help=f"skip a slab whose orphan share exceeds this (default {MAX_ORPHAN_FRACTION})")
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

    found = applied = 0
    for layout, angle, valid in slabs:
        live = live_ids(base_url, key, layout, angle)
        orphans = sorted(live - valid)
        frac = (len(orphans) / len(live)) if live else 0.0
        print(f"layout {layout} @ {angle}°: {len(live)} live, {len(valid)} staged, "
              f"{len(orphans)} orphaned ({frac:.0%})")
        found += len(orphans)
        if not (orphans and args.apply):
            continue
        if not valid and not args.force:
            print("  SKIP: staged set is EMPTY — refusing to tombstone the whole slab "
                  "(a failed re-fetch looks like this). Re-run with --force if intended.")
            continue
        if live and frac > args.max_orphan_fraction and not args.force:
            print(f"  SKIP: orphan share {frac:.0%} exceeds --max-orphan-fraction "
                  f"{args.max_orphan_fraction:.0%}; refusing. Re-run with --force if intended.")
            continue
        tombstone(base_url, key, orphans)
        applied += len(orphans)

    if args.apply:
        print(f"\nTombstoned {applied} row(s)."
              + (f" ({found - applied} skipped by safety guard — see above.)" if found != applied else ""))
    else:
        print(f"\nWould tombstone {found} orphaned row(s).  Re-run with --apply to write.")


if __name__ == "__main__":
    main()
