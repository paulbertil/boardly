#!/usr/bin/env python3
"""
Backfill the MoonBoard "method" (foot-rule) field onto the committed catalog
snapshots in ../catalog-data/ WITHOUT re-fetching them.

WHY NOT JUST RE-FETCH
---------------------
The committed snapshots are curated *subsets* (benchmark / min-ascents filtered),
and the original filter parameters aren't recorded. A blind re-fetch would reshape
every catalog (and boardsesh's live data drifts over time). So instead we keep each
snapshot's exact problem set and only ADD `method`, matched by boardsesh uuid.

WHAT IT DOES
------------
For each `catalog-data/{slug}_{angle}.json`, page boardsesh's `searchClimbs`
(using the CURRENT setIds from fetch_boardsesh.BOARDS — Mini 2025 now spans
28,29,30,31), build a {uuid -> method} map, and set `method` on every snapshot
problem (a label, or null when the problem has no foot-rule characteristic). Paging
stops early once every snapshot uuid has been located.

This is additive and idempotent: re-running it just recomputes the same values.
After running, re-import to Supabase with import_catalog.py as a separate step.

  python3 scripts/enrich_catalog_methods.py            # all snapshots
  python3 scripts/enrich_catalog_methods.py 2024_40    # one (by filename stem)
"""

import json
import os
import sys
import time
from urllib.request import Request, urlopen
from urllib.error import HTTPError

from fetch_boardsesh import BOARDS, ENDPOINT, HEADERS, METHOD_LABELS, PAGE_SIZE

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "catalog-data")
SIZE_ID = 1
MAX_PAGES = 200  # backstop; we normally stop early once all snapshot uuids are seen

# slug -> (layoutId, setIds) from the shared board table.
SLUG_TO_BOARD = {slug: (lid, set_ids) for lid, (slug, _name, set_ids, _angles) in BOARDS.items()}

QUERY = """
query Search($i: ClimbSearchInput!) {
  searchClimbs(input: $i) {
    hasMore
    climbs { uuid characteristics }
  }
}
"""


def gql(variables, retries=4):
    body = json.dumps({"query": QUERY, "variables": variables}).encode()
    for attempt in range(retries):
        try:
            with urlopen(Request(ENDPOINT, data=body, headers=HEADERS, method="POST"), timeout=60) as r:
                payload = json.loads(r.read().decode())
            if payload.get("errors"):
                sys.exit("GraphQL error: " + json.dumps(payload["errors"][:2]))
            return payload["data"]
        except HTTPError as e:
            if e.code in (429, 502, 503) and attempt < retries - 1:
                time.sleep(2 * (attempt + 1))
                continue
            raise


def method_of(characteristics):
    return next((METHOD_LABELS[c] for c in (characteristics or []) if c in METHOD_LABELS), None)


def fetch_methods(layout, set_ids, angle, want_uuids, delay=0.1):
    """Return {uuid -> method-or-None} for the wanted uuids, paging until all found."""
    found = {}
    for page in range(MAX_PAGES):
        inp = {"boardName": "moonboard", "layoutId": layout, "sizeId": SIZE_ID,
               "setIds": set_ids, "angle": angle, "page": page, "pageSize": PAGE_SIZE}
        res = gql({"i": inp})["searchClimbs"]
        climbs = res["climbs"] or []
        for c in climbs:
            if c["uuid"] in want_uuids:
                found[c["uuid"]] = method_of(c.get("characteristics"))
        if len(found) >= len(want_uuids) or not res.get("hasMore") or not climbs:
            break
        time.sleep(delay)
    return found


# Canonical problem-key order, matching fetch_boardsesh.py's emitted shape
# (method sits just before holds).
KEY_ORDER = ["id", "name", "grade", "userGrade", "setter", "stars", "repeats", "isBenchmark", "method", "holds"]


def reorder(problem):
    """Rebuild a problem dict in canonical key order (keeps any extra keys at the end)."""
    out = {k: problem[k] for k in KEY_ORDER if k in problem}
    for k, v in problem.items():
        if k not in out:
            out[k] = v
    return out


def enrich_file(path):
    slug_angle = os.path.splitext(os.path.basename(path))[0]
    slug, _, angle_s = slug_angle.rpartition("_")
    if slug not in SLUG_TO_BOARD:
        print(f"  skip {slug_angle}: unknown board slug"); return
    layout, set_ids = SLUG_TO_BOARD[slug]
    angle = int(angle_s)

    with open(path) as f:
        catalog = json.load(f)
    problems = catalog["problems"]
    want = {p["id"] for p in problems}

    print(f"{slug_angle}: {len(want)} problems — fetching methods (layout {layout}, sets {set_ids}, {angle}°)…")
    methods = fetch_methods(layout, set_ids, angle, want)

    matched = len(methods)
    tagged = sum(1 for m in methods.values() if m)
    for p in problems:
        p["method"] = methods.get(p["id"])  # label or None
    catalog["problems"] = [reorder(p) for p in problems]

    with open(path, "w") as f:
        json.dump(catalog, f, ensure_ascii=False)
    miss = len(want) - matched
    print(f"  matched {matched}/{len(want)} by uuid ({tagged} with a method)"
          + (f"; {miss} not found live — left method=null" if miss else ""))


def main():
    only = set(sys.argv[1:])
    files = sorted(f for f in os.listdir(DATA_DIR) if f.endswith(".json"))
    if only:
        files = [f for f in files if os.path.splitext(f)[0] in only]
        if not files:
            sys.exit(f"no catalog-data file matches {only}")
    for fn in files:
        enrich_file(os.path.join(DATA_DIR, fn))


if __name__ == "__main__":
    main()
