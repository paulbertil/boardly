import Foundation

/// Read-only catalog of official MoonBoard problems for one board+angle "slab",
/// loaded from a synced on-disk cache (`Catalog.cacheDirectory`) that
/// `CatalogSyncManager` populates from Supabase. The catalog is server-distributed —
/// no longer bundled — so every client stays in sync (see docs/catalog-data-pipeline.md).
///
/// This is deliberately kept separate from the user's own SwiftData `Problem`s:
/// the catalog is browse-and-light only, never edited or persisted.
struct Catalog: Decodable {
    var setup: String
    /// Mini catalogs carry `holdsetup`; the standard-board catalogs don't.
    var holdsetup: Int?
    var count: Int
    var problems: [CatalogProblem]

    static let empty = Catalog(setup: "", holdsetup: nil, count: 0, problems: [])

    /// Cache so each bundled catalog JSON is decoded at most once. Guarded by a
    /// lock because `load` is called from background decode tasks.
    private static var cache: [String: Catalog] = [:]
    private static let cacheLock = NSLock()

    /// Load a catalog slab by resource name (e.g. "MiniMoonBoard2025Catalog",
    /// "MoonBoardMasters2019Catalog_40") from the synced disk cache. Returns an empty
    /// catalog if the slab hasn't synced yet (first launch / offline / unconfigured) —
    /// a later `CatalogSyncManager` pull writes it and invalidates this entry.
    /// Decoding is heavy (thousands of problems) — call it off the main thread.
    static func load(resource: String) -> Catalog {
        cacheLock.lock()
        let cached = cache[resource]
        cacheLock.unlock()
        if let cached { return cached }

        let catalog: Catalog
        if let data = try? Data(contentsOf: cacheURL(for: resource)) {
            catalog = parse(data) ?? .empty
        } else {
            // Slab not synced yet; return empty. Not an error now that the catalog is
            // server-distributed — the first sync populates the cache.
            catalog = .empty
        }
        cacheLock.lock()
        cache[resource] = catalog
        cacheLock.unlock()
        return catalog
    }

    // MARK: - Synced disk cache

    /// Directory holding synced catalog slabs, one JSON file per board+angle resource
    /// (e.g. `Application Support/CatalogCache/MoonBoard2016Catalog_40.json`). Replaces
    /// the app bundle as the catalog source now that the catalog is server-distributed.
    static let cacheDirectory: URL = {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        let dir = base.appendingPathComponent("CatalogCache", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }()

    static func cacheURL(for resource: String) -> URL {
        cacheDirectory.appendingPathComponent("\(resource).json")
    }

    /// Drop a slab's in-memory cache so the next `load` re-reads it from disk. Called by
    /// `CatalogSyncManager` after it writes fresh rows.
    static func invalidate(resource: String) {
        cacheLock.lock()
        cache[resource] = nil
        cacheLock.unlock()
    }

    /// A slab's problems as raw `JSONSerialization` dicts (`{id,name,…,holds:[{c,r,t}]}`),
    /// or `[]` if the slab isn't on disk yet. Lets `CatalogSyncManager` merge deltas in
    /// the dict domain the parser already speaks, with no Codable round-trip.
    static func rawProblems(resource: String) -> [[String: Any]] {
        guard let data = try? Data(contentsOf: cacheURL(for: resource)),
              let root = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else {
            return []
        }
        return root["problems"] as? [[String: Any]] ?? []
    }

    /// Atomically write a slab's problems to disk in the same shape the bundle files used
    /// (so `parse` reads them unchanged), then invalidate the in-memory cache.
    static func writeSlab(problems: [[String: Any]], setup: String, resource: String) {
        let root: [String: Any] = ["setup": setup, "count": problems.count, "problems": problems]
        guard let data = try? JSONSerialization.data(withJSONObject: root) else { return }
        try? data.write(to: cacheURL(for: resource), options: .atomic)
        invalidate(resource: resource)
    }

    /// Warm the in-process cache for a catalog on a background thread so the first
    /// tap into its list is instant (no parse spinner). Safe to call repeatedly —
    /// a warm cache returns immediately. Call from a screen shown before the list
    /// (e.g. Home) so decoding overlaps the user's reading/scrolling time.
    static func preload(resource: String) {
        cacheLock.lock()
        let warm = cache[resource] != nil
        cacheLock.unlock()
        guard !warm else { return }
        Task.detached(priority: .utility) { _ = load(resource: resource) }
    }

    /// Parse with `JSONSerialization` (C-backed) rather than `Codable`. Codable's
    /// synthesized decoding of thousands of problems is very slow in debug builds
    /// (several seconds); this keeps it well under a second.
    private static func parse(_ data: Data) -> Catalog? {
        guard let root = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else {
            assertionFailure("Undecodable catalog JSON")
            return nil
        }
        let raw = root["problems"] as? [[String: Any]] ?? []
        let problems = raw.map(CatalogProblem.init(json:))
        return Catalog(setup: root["setup"] as? String ?? "",
                       holdsetup: root["holdsetup"] as? Int,
                       count: root["count"] as? Int ?? problems.count,
                       problems: problems)
    }
}

/// One official problem. The current MoonBoard API encodes start / left / right /
/// end roles, which map directly onto `HoldType` (no `match` appears in the data).
struct CatalogProblem: Decodable, Identifiable, Hashable {
    var id: String
    var name: String
    var grade: String
    var userGrade: String?
    var setter: String
    var stars: Int
    var repeats: Int
    var isBenchmark: Bool
    /// MoonBoard foot-rule method (e.g. "Footless", "No kickboard"); nil for
    /// standard problems. Optional so older bundled catalogs still decode.
    var method: String?
    var holds: [CatalogHold]

    /// Convert to the app's hold model so it can be rendered and lit on the board.
    var holdAssignments: [HoldAssignment] {
        holds.map { HoldAssignment(col: $0.col, row: $0.row, type: $0.holdType) }
    }

    /// Build from a `JSONSerialization` dictionary (fast path — see `Catalog.parse`).
    init(json: [String: Any]) {
        id = json["id"] as? String ?? ""
        name = json["name"] as? String ?? "Untitled"
        grade = json["grade"] as? String ?? ""
        userGrade = json["userGrade"] as? String
        setter = json["setter"] as? String ?? ""
        stars = json["stars"] as? Int ?? 0
        repeats = json["repeats"] as? Int ?? 0
        isBenchmark = json["isBenchmark"] as? Bool ?? false
        method = json["method"] as? String
        holds = (json["holds"] as? [[String: Any]] ?? []).map(CatalogHold.init(json:))
    }
}

struct CatalogHold: Decodable, Hashable {
    var c: Int   // column 0...10 (A...K)
    var r: Int   // row 1 (bottom) upward
    var t: String  // "start" | "left" | "right" | "match" | "end"

    var col: Int { c }
    var row: Int { r }

    var holdType: HoldType {
        switch t {
        case "start": return .start
        case "left":  return .left
        case "match": return .match
        case "end":   return .end
        default:      return .right
        }
    }

    init(json: [String: Any]) {
        c = json["c"] as? Int ?? 0
        r = json["r"] as? Int ?? 1
        t = json["t"] as? String ?? "right"
    }
}
