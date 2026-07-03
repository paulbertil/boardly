import Foundation

/// Wire shapes for the cloud logbook tables (`ascents`, `user_problems`), mirroring
/// the SwiftData models. snake_case `CodingKeys` match the Postgres columns (same
/// convention as `ProfileUpsert` in AuthManager).
///
/// Dates travel as ISO-8601 **strings** rather than `Date`, so we don't depend on the
/// PostgREST decoder's date strategy — `SyncDate` parses/formats them tolerantly.
/// `updated_at` is server-authoritative: we send it on insert-seed but always read the
/// server's value back (via `returning: .representation`) to advance the pull cursor.

struct AscentRow: Codable {
    var id: UUID
    var user_id: UUID
    var date: String
    var source_catalog_id: String?
    var user_problem_id: UUID?
    var problem_name: String
    var problem_grade: String
    var voted_grade: String
    var tries: Int
    var stars: Int
    var comment: String
    var sent: Bool
    var board_layout_id: Int
    var updated_at: String?
    var deleted: Bool

    init(ascent: Ascent, userID: UUID) {
        self.id = ascent.id
        self.user_id = userID
        self.date = SyncDate.string(ascent.date)
        self.source_catalog_id = ascent.sourceCatalogID
        self.user_problem_id = ascent.userProblemID
        self.problem_name = ascent.problemName
        self.problem_grade = ascent.problemGrade
        self.voted_grade = ascent.votedGrade
        self.tries = ascent.tries
        self.stars = ascent.stars
        self.comment = ascent.comment
        self.sent = ascent.sent
        self.board_layout_id = ascent.boardLayoutId
        self.updated_at = ascent.updatedAt.map(SyncDate.string)
        self.deleted = ascent.tombstoned
    }
}

struct UserProblemRow: Codable {
    var id: UUID
    var user_id: UUID
    var name: String
    var grade: String
    var holds: [HoldAssignment]
    var created_at: String
    var updated_at: String?
    var deleted: Bool

    init(problem: Problem, userID: UUID) {
        self.id = problem.id
        self.user_id = userID
        self.name = problem.name
        self.grade = problem.grade
        self.holds = problem.holds
        self.created_at = SyncDate.string(problem.createdAt)
        self.updated_at = problem.updatedAt.map(SyncDate.string)
        self.deleted = problem.tombstoned
    }
}

/// Tolerant ISO-8601 <-> Date conversion for wire timestamps. Postgres `timestamptz`
/// serializes with fractional seconds and a `+00:00` offset; parse with and without
/// fractional seconds so we don't drop rows on a formatting quirk.
enum SyncDate {
    static func string(_ date: Date) -> String {
        withFractional.string(from: date)
    }

    static func date(_ string: String?) -> Date? {
        guard let string else { return nil }
        return withFractional.date(from: string) ?? withoutFractional.date(from: string)
    }

    private static let withFractional: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private static let withoutFractional: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()
}
