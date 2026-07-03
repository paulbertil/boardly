import Foundation
import SwiftData

/// A saved boulder problem: a named set of holds with a Font grade.
@Model
final class Problem {
    /// Stable identity. Added for cloud logbook sync so an ascent can link to a real
    /// problem record (not just a name) and so the same problem converges across a
    /// user's devices. NOT marked `.unique` at the SwiftData layer: a lightweight
    /// migration that backfills existing rows can transiently share the default, and
    /// a unique constraint would then crash. Uniqueness is enforced by the cloud
    /// primary key + `Problem.backfillSyncIDsIfNeeded` (see R-M1 in the plan).
    var id: UUID = UUID()

    var name: String
    var grade: String
    var createdAt: Date

    /// Stored as a Codable value array. SwiftData persists this as part of the model.
    var holds: [HoldAssignment]

    // MARK: Sync metadata (cloud logbook sync)
    /// Server-authoritative last-write timestamp, mirrored down from the cloud. nil
    /// until the row has round-tripped through sync (legacy/local-only rows).
    var updatedAt: Date?
    /// Soft-delete tombstone. Deleting a problem sets this instead of removing the row,
    /// so the delete propagates across devices; all reads filter `tombstoned == false`.
    var tombstoned: Bool = false
    /// Local dirty flag: set on any local write, cleared once the push is confirmed.
    var needsSync: Bool = false

    init(name: String, grade: String, holds: [HoldAssignment], createdAt: Date = Date()) {
        self.id = UUID()
        self.name = name
        self.grade = grade
        self.holds = holds
        self.createdAt = createdAt
    }

    var startCount: Int { holds.filter { $0.type == .start }.count }
    var endCount: Int { holds.filter { $0.type == .end }.count }
}

/// Font (Fontainebleau) grades, in ascending order. This is the *canonical* scale
/// used for ordering, grade-vote comparison, and the pyramid. Individual boards
/// derive their own picker range (a contiguous span of this list) from the grades
/// their catalog actually contains — see `Board.gradeList`.
enum FontGrade {
    static let all: [String] = [
        "5+", "5B", "5C",
        "6A", "6A+", "6B", "6B+", "6C", "6C+",
        "7A", "7A+", "7B", "7B+", "7C", "7C+",
        "8A", "8A+", "8B", "8B+",
    ]
    static let `default` = "6A+"

    /// Position on the canonical scale; unknown grades sort to the end.
    static func index(of grade: String) -> Int {
        all.firstIndex(of: grade) ?? all.count
    }
}
