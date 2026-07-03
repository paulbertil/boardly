import Foundation

/// One-time normalization of the persisted catalog status-filter selection after the
/// filter rework (U1): "My ascents" → "Completed", the old "Not logged" is dropped
/// (its problems now fall under the widened "Not completed" = `!sent`), and the
/// "Not completed" token is kept (its *meaning* changed, but the stored raw value did
/// not). "Projects" is new, so no legacy token maps onto it.
///
/// The selection lives in a single global `@AppStorage("catalogFilters")` key as a
/// "|"-joined list of `CatalogFilter` raw values (see `CatalogListView`). Leaving stale
/// tokens ("My ascents"/"Not logged") in that string would silently drop those
/// selections (they no longer decode to a case) — this rewrites them once instead.
///
/// Idempotent and guarded by a UserDefaults flag, mirroring `LogbookMigration`. Touches
/// only UserDefaults, so it needs no ModelContext; call it at launch.
enum CatalogFilterMigration {

    private static let doneKey = "catalogFilterRenameV1Done"
    private static let storageKey = "catalogFilters"

    /// Old raw value → new raw value. A value mapping to `nil` is dropped.
    private static let rename: [String: String?] = [
        "My ascents": "Completed",
        "Not logged": nil,
    ]

    static func runIfNeeded() {
        let defaults = UserDefaults.standard
        guard !defaults.bool(forKey: doneKey) else { return }

        if let csv = defaults.string(forKey: storageKey), !csv.isEmpty {
            let migrated = csv
                .split(separator: "|")
                .map(String.init)
                .compactMap { token -> String? in
                    // Present-but-nil in `rename` = drop; absent = keep unchanged.
                    if let mapped = rename[token] { return mapped }
                    return token
                }
            // De-dupe in case a mapping collided with an existing token, preserving order.
            var seen = Set<String>()
            let deduped = migrated.filter { seen.insert($0).inserted }
            defaults.set(deduped.joined(separator: "|"), forKey: storageKey)
        }

        defaults.set(true, forKey: doneKey)
    }
}
