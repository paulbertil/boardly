import Foundation
import Supabase

/// The collaborative-lists hub, injected app-wide as a `@StateObject` alongside
/// `AuthManager` / `LogbookSyncManager`. Mirrors `AuthManager`'s shape: it owns the
/// Supabase calls for lists so the rest of the app never talks to the SDK directly,
/// and it stays inert (`isConfigured == false`) when the app is built without backend
/// config — the Lists surface then simply doesn't appear.
///
/// **Cloud-only in v1 (KTD2):** lists, members, pile, and group status are read-through
/// from Supabase (fetch on open + pull-to-refresh); there is deliberately no SwiftData
/// mirror and no offline sync spine. The user's own logbook stays local-first as before;
/// only this social layer requires connectivity.
@MainActor
final class ListsManager: ObservableObject {

    /// The lists the current user belongs to (owner or member), newest first.
    @Published private(set) var myLists: [ListRow] = []

    /// Loaded detail for the currently-open list.
    @Published private(set) var currentList: ListRow?
    @Published private(set) var members: [Profile] = []
    @Published private(set) var pile: [ListProblemRow] = []

    var isConfigured: Bool { client != nil }

    /// nil when the app is built without Supabase config — see SupabaseClientProvider.
    private let client = SupabaseClientProvider.shared

    // MARK: - Lists

    /// Loads the lists the signed-in user can see. RLS already restricts `lists` to rows
    /// the caller owns or is a member of, so a plain select returns exactly those.
    func loadMyLists() async throws {
        let client = try requireClient()
        myLists = try await client
            .from("lists")
            .select()
            .eq("deleted", value: false)
            .order("updated_at", ascending: false)
            .execute()
            .value
    }

    /// Creates a list and returns it. A DB trigger seats the creator as the first member
    /// (0003), so the caller immediately satisfies the membership-scoped policies.
    @discardableResult
    func createList(name: String, boardLayoutId: Int) async throws -> ListRow {
        let client = try requireClient()
        let userID = try currentUserID()
        let payload = ListInsert(
            owner_id: userID,
            name: name.trimmingCharacters(in: .whitespacesAndNewlines),
            board_layout_id: boardLayoutId
        )
        let row: ListRow = try await client
            .from("lists")
            .insert(payload)
            .select()
            .single()
            .execute()
            .value
        try await loadMyLists()
        return row
    }

    /// Soft-deletes a list (owner only; RLS enforces). Members see it disappear on their
    /// next refresh (loadMyLists filters `deleted`).
    func deleteList(_ listId: UUID) async throws {
        let client = try requireClient()
        try await client
            .from("lists")
            .update(["deleted": true])
            .eq("id", value: listId)
            .execute()
        try await loadMyLists()
    }

    // MARK: - Detail (members + pile)

    /// Loads a list's roster (as profiles) and its live problem pile into published
    /// state. Members and profiles are fetched separately because there is no direct FK
    /// between `list_members` and `profiles` for PostgREST to embed across.
    func loadDetail(_ listId: UUID) async throws {
        let client = try requireClient()

        currentList = myLists.first { $0.id == listId }

        let memberRows: [ListMemberRow] = try await client
            .from("list_members")
            .select()
            .eq("list_id", value: listId)
            .execute()
            .value

        let ids = memberRows.map(\.user_id)
        members = ids.isEmpty ? [] : try await client
            .from("profiles")
            .select()
            .in("id", values: ids)
            .execute()
            .value

        pile = try await client
            .from("list_problems")
            .select()
            .eq("list_id", value: listId)
            .eq("deleted", value: false)
            .order("created_at", ascending: true)
            .execute()
            .value
    }

    // MARK: - Pile edits (all members equal)

    /// Adds a catalog problem to a list's pile. The DB unique index keeps it to one live
    /// row per (list, catalog id), so a duplicate add is rejected server-side.
    func addProblem(listId: UUID, sourceCatalogID: String, boardLayoutId: Int) async throws {
        let client = try requireClient()
        let userID = try currentUserID()
        let payload = ListProblemInsert(
            list_id: listId,
            source_catalog_id: sourceCatalogID,
            board_layout_id: boardLayoutId,
            added_by: userID
        )
        try await client.from("list_problems").insert(payload).execute()
    }

    /// Removes a problem from the pile (soft-delete, so re-adding stays clean).
    func removeProblem(_ listProblemId: UUID) async throws {
        let client = try requireClient()
        try await client
            .from("list_problems")
            .update(["deleted": true])
            .eq("id", value: listProblemId)
            .execute()
    }

    // MARK: - Membership

    /// Leaves a list (deletes the caller's own membership; RLS allows only `user_id =
    /// auth.uid()`). Revokes both the caller's exposure and their read access.
    func leaveList(_ listId: UUID) async throws {
        let client = try requireClient()
        let userID = try currentUserID()
        try await client
            .from("list_members")
            .delete()
            .eq("list_id", value: listId)
            .eq("user_id", value: userID)
            .execute()
        try await loadMyLists()
    }

    // MARK: - Internal

    private func requireClient() throws -> SupabaseClient {
        guard let client else { throw ListsError.notConfigured }
        return client
    }

    private func currentUserID() throws -> UUID {
        guard let id = client?.auth.currentUser?.id else { throw ListsError.notSignedIn }
        return id
    }
}

enum ListsError: LocalizedError {
    case notConfigured
    case notSignedIn

    var errorDescription: String? {
        switch self {
        case .notConfigured:
            return "Lists aren't set up in this build — see docs/social-accounts-login-SETUP.md."
        case .notSignedIn:
            return "You need to be signed in to use lists."
        }
    }
}
