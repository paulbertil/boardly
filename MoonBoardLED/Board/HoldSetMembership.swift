import Foundation

/// Which hold set each Mini MoonBoard 2025 grid position belongs to, loaded from
/// the bundled `MiniMoonBoard2025HoldSets.json` (produced by
/// `scripts/derive_holdset_membership.py`).
///
/// Used to answer "can I climb this problem with only these hold sets installed?"
/// — a problem is climbable iff every one of its holds is owned by an active set.
struct HoldSetMembership: Decodable {
    /// "col-row" (col 0–10, row 1–12) → hold-set id.
    let membership: [String: Int]

    static let empty = HoldSetMembership(membership: [:])

    /// Loaded once from the bundle. Empty if the JSON hasn't been generated yet.
    static let shared: HoldSetMembership = load()

    private static func load() -> HoldSetMembership {
        guard let url = Bundle.main.url(forResource: "MiniMoonBoard2025HoldSets", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let decoded = try? JSONDecoder().decode(HoldSetMembership.self, from: data)
        else { return .empty }
        return decoded
    }

    /// Hold-set id owning the hold at this position, or nil if no set does.
    func setID(col: Int, row: Int) -> Int? { membership["\(col)-\(row)"] }

    /// True if every hold is owned by one of `activeSetIDs`. An empty membership
    /// map (JSON not generated) never filters — every problem is climbable.
    func isClimbable(holds: [CatalogHold], activeSetIDs: Set<Int>) -> Bool {
        guard !membership.isEmpty else { return true }
        return holds.allSatisfy { hold in
            guard let id = setID(col: hold.c, row: hold.r) else { return false }
            return activeSetIDs.contains(id)
        }
    }
}

/// Reads/writes the user's active hold sets for a setup, persisted as a
/// "|"-joined id string in `@AppStorage`. Empty (or all-active) means the board is
/// full — no filtering. Kept as free functions so the same rules apply in the
/// Home row, the editor sheet, and the catalog.
enum ActiveHoldSets {
    /// `@AppStorage` key for the Mini 2025 active hold sets.
    static let miniStorageKey = "miniActiveHoldSets"

    /// Parse the stored string into set ids. Empty string → all sets active.
    static func ids(from csv: String, in setup: MoonBoardSetup) -> Set<Int> {
        let stored = Set(csv.split(separator: "|").compactMap { Int($0) })
        let valid = stored.intersection(Set(setup.holdSets.map(\.id)))
        return valid.isEmpty ? Set(setup.holdSets.map(\.id)) : valid
    }

    /// Canonical storage string for a selection. All sets active → "" (the
    /// filter-off canonical form).
    static func csv(from ids: Set<Int>, in setup: MoonBoardSetup) -> String {
        if ids.count == setup.holdSets.count { return "" }
        return ids.sorted().map(String.init).joined(separator: "|")
    }

    static func isAllActive(_ ids: Set<Int>, in setup: MoonBoardSetup) -> Bool {
        ids.count >= setup.holdSets.count
    }

    /// "All hold sets" when the board is full, else a comma list of set names in
    /// board order ("Hold Set F, Wooden Holds B").
    static func subtitle(_ ids: Set<Int>, in setup: MoonBoardSetup) -> String {
        if isAllActive(ids, in: setup) { return "All hold sets" }
        return setup.holdSets.filter { ids.contains($0.id) }
            .map(\.name).joined(separator: ", ")
    }
}
