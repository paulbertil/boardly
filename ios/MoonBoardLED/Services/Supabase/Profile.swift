import Foundation

/// A row of the `profiles` table — the app's user identity (see 0001_profiles.sql).
///
/// Minimal by design: `handle` + `displayName` only. `avatarURL` mirrors the reserved
/// column but avatar upload is deferred. `createdAt` is kept as a raw string so profile
/// loading never fails on a timestamp-decoding mismatch.
struct Profile: Codable, Identifiable, Equatable {
    let id: UUID
    var handle: String
    var displayName: String
    var avatarURL: String?
    var createdAt: String?

    enum CodingKeys: String, CodingKey {
        case id, handle
        case displayName = "display_name"
        case avatarURL = "avatar_url"
        case createdAt = "created_at"
    }
}

/// Handle rules, shared by the DB check constraint and the client's live validation:
/// 3–20 chars, lowercase `a–z` / `0–9` / underscore. Uniqueness is case-insensitive
/// (enforced by the `citext` column); the client always lowercases before saving.
enum HandleRules {
    static let minLength = 3
    static let maxLength = 20

    /// The canonical form we store and compare: trimmed + lowercased.
    static func normalize(_ raw: String) -> String {
        raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    /// Whether `handle` (already normalized) satisfies the format constraint.
    static func isValidFormat(_ handle: String) -> Bool {
        handle.range(of: "^[a-z0-9_]{\(minLength),\(maxLength)}$", options: .regularExpression) != nil
    }
}
