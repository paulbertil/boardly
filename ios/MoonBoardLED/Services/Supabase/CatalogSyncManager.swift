import Foundation
import Supabase

/// Downloads the server catalog into a local per-slab disk cache, so browsing stays fast
/// and works offline *after* a sync. Distribution-only: unlike `LogbookSyncManager` there
/// is no auth, no push, and no reconciliation — the catalog is public, read-only, and
/// identical for everyone.
///
/// Lazy per board: a "slab" (one board+angle) syncs only when the user needs it — when a
/// board is added/activated or when its catalog list opens (and, once collaborative lists
/// land, when a list scoped to it opens, so its `list_problems` ids resolve). Reuses the
/// high-water-mark spine
/// from migration 0002: pull `updated_at > cursor`, apply `deleted` tombstones. The cursor
/// is per resource in `UserDefaults` — no per-user scoping, since the catalog isn't owned.
@MainActor
final class CatalogSyncManager {
    static let shared = CatalogSyncManager()

    private let client: SupabaseClient?
    /// Slabs with a pull in flight, so overlapping triggers (add + warm loop + list open)
    /// don't duplicate the same request.
    private var inFlight: Set<String> = []

    init(client: SupabaseClient? = SupabaseClientProvider.shared) {
        self.client = client
    }

    /// Sync every angle of a board — the add/activate and Home warm-loop entry point.
    func syncBoard(_ board: Board) async {
        for angle in board.angles { await syncSlab(layoutId: board.id, angle: angle) }
    }

    /// Sync one `(layout, angle)` slab: pull rows newer than the cursor, merge them into
    /// the on-disk slab, advance the cursor. No-op when unconfigured; on an offline/transient
    /// failure it leaves the cursor and cached slab untouched so the next trigger retries.
    func syncSlab(layoutId: Int, angle: Int) async {
        guard let client else { return }
        let board = Board.with(layoutId: layoutId)
        let resource = board.catalogResource(angle: angle)
        guard !inFlight.contains(resource) else { return }
        inFlight.insert(resource)
        defer { inFlight.remove(resource) }

        let cursor = cursorString(resource)
        do {
            let rows: [CatalogProblemSyncRow] = try await client
                .from("catalog_problems").select()
                .eq("layout_id", value: layoutId)
                .eq("angle", value: angle)
                .gt("updated_at", value: cursor)
                .order("updated_at", ascending: true)
                .execute().value
            guard !rows.isEmpty else { return }

            // Merge by id into the existing slab dicts (upsert live rows, drop tombstones).
            var byID: [String: [String: Any]] = [:]
            for p in Catalog.rawProblems(resource: resource) {
                if let id = p["id"] as? String { byID[id] = p }
            }
            var newest = SyncDate.date(cursor) ?? .distantPast
            for row in rows {
                byID[row.source_catalog_id] = row.deleted ? nil : row.problemDict
                if let ts = SyncDate.date(row.updated_at), ts > newest { newest = ts }
            }

            // Sort by (grade, name) to match the fetch script's on-disk ordering.
            let problems = byID.values.sorted {
                let g0 = $0["grade"] as? String ?? "", g1 = $1["grade"] as? String ?? ""
                if g0 != g1 { return g0 < g1 }
                return ($0["name"] as? String ?? "") < ($1["name"] as? String ?? "")
            }
            Catalog.writeSlab(problems: Array(problems), setup: board.name, resource: resource)
            setCursor(SyncDate.string(newest), resource)
            CatalogIndex.invalidate()   // newly-synced ids now resolve in the logbook / lists
        } catch {
            // Offline or transient: leave the cursor + slab as-is; a later trigger retries.
        }
    }

    // MARK: - Cursor (per-slab high-water mark)

    private func cursorKey(_ resource: String) -> String { "catalogSyncCursor.\(resource)" }

    private func cursorString(_ resource: String) -> String {
        UserDefaults.standard.string(forKey: cursorKey(resource)) ?? SyncDate.string(.distantPast)
    }

    private func setCursor(_ value: String, _ resource: String) {
        UserDefaults.standard.set(value, forKey: cursorKey(resource))
    }
}
