import Foundation

/// Wire shape for `public.catalog_problems` — the server-distributed MoonBoard catalog.
/// snake_case field names match the Postgres columns (same convention as `LogbookDTO`).
///
/// `holds` is a jsonb array of `{c,r,t}`; `updated_at` is server-authoritative and drives
/// the per-slab pull cursor. Decode-only: a client never writes the catalog (imports run
/// with the service-role key). Rows convert to the `JSONSerialization` dict shape the
/// on-disk slab uses, so `Catalog.parse` reads them with no change.
struct CatalogProblemSyncRow: Decodable {
    var source_catalog_id: String
    var layout_id: Int
    var angle: Int
    var name: String
    var grade: String
    var user_grade: String?
    var setter: String
    var stars: Int
    var repeats: Int
    var is_benchmark: Bool
    var method: String?
    var holds: [Hold]
    var updated_at: String?
    var deleted: Bool

    struct Hold: Decodable {
        var c: Int
        var r: Int
        var t: String
    }

    /// As a bundle-file problem dict (`{id,name,grade,…,holds:[{c,r,t}]}`) — the shape
    /// `Catalog.writeSlab` persists and `CatalogProblem(json:)` parses.
    var problemDict: [String: Any] {
        var dict: [String: Any] = [
            "id": source_catalog_id,
            "name": name,
            "grade": grade,
            "setter": setter,
            "stars": stars,
            "repeats": repeats,
            "isBenchmark": is_benchmark,
            "holds": holds.map { ["c": $0.c, "r": $0.r, "t": $0.t] },
        ]
        if let user_grade { dict["userGrade"] = user_grade }
        if let method { dict["method"] = method }
        return dict
    }
}
