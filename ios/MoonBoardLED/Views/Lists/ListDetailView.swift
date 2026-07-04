import SwiftUI

/// A single collaborative list: its members, its shared problem pile with per-person
/// send/try badges, and leave/delete actions. Group status is refresh-first (fetched on
/// open + pull-to-refresh). Catalog names are resolved locally from the list's board.
///
/// (The "Browse & add" entry point and share/invite live in U8 and U7 respectively.)
struct ListDetailView: View {
    let listId: UUID

    @EnvironmentObject private var lists: ListsManager
    @Environment(\.dismiss) private var dismiss
    @Environment(TabRouter.self) private var router
    /// The Search tab's active board — "Browse together" points it at this list's board.
    @AppStorage(ActiveBoard.storageKey) private var activeBoardId = ActiveBoard.default

    @State private var catalogByID: [String: CatalogProblem] = [:]
    @State private var actionError: String?
    /// True once *this* view's `loadDetail` has resolved. `lists.members` is a single shared
    /// array on the manager that still holds the previously-viewed list's roster until then,
    /// so member-count-derived UI must not trust it before this flips.
    @State private var membersLoaded = false

    private var list: ListRow? {
        lists.currentList?.id == listId ? lists.currentList : lists.myLists.first { $0.id == listId }
    }

    private var isOwner: Bool {
        guard let list, let me = lists.myUserID else { return false }
        return list.owner_id == me
    }

    /// The owner is auto-seated as a member (DB trigger), so `members.count <= 1` means
    /// nobody else has joined. Leaving a list you own with no other members is nonsensical —
    /// the menu offers Delete only in that case. Gated on `membersLoaded` so a stale roster
    /// from a previously-viewed list can't hide "Leave" (or worse, let a solo owner leave and
    /// orphan) during the load window.
    private var isSoloOwner: Bool { membersLoaded && isOwner && lists.members.count <= 1 }

    var body: some View {
        List {
            browseSection
            membersSection
            inviteSection
            pileSection
        }
        .navigationTitle(list.map { $0.name.isEmpty ? "List" : $0.name } ?? "List")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Menu {
                    // A solo owner (only member) can't meaningfully "leave" — offer Delete only.
                    if !isSoloOwner {
                        Button(role: .destructive) {
                            Task { await leave() }
                        } label: {
                            Label("Leave list", systemImage: "rectangle.portrait.and.arrow.right")
                        }
                    }
                    if isOwner {
                        Button(role: .destructive) {
                            Task { await deleteList() }
                        } label: {
                            Label("Delete list", systemImage: "trash")
                        }
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
            }
        }
        .refreshable { await refresh() }
        .task {
            await refresh()
            await loadCatalog()
        }
        .alert("Something went wrong", isPresented: .constant(actionError != nil)) {
            Button("OK") { actionError = nil }
        } message: {
            Text(actionError ?? "")
        }
    }

    // MARK: - Sections

    private var browseSection: some View {
        Section {
            Button {
                Task { await browseTogether() }
            } label: {
                Label("Browse & add problems", systemImage: "square.grid.2x2")
            }
        } footer: {
            Text("Opens the catalog on this list's board — swipe to add problems and see each member's send/try status.")
        }
    }

    /// Activate the group lens for this list and jump to the catalog: refresh the
    /// group's status, point the Search tab at the list's board, set the active list,
    /// and switch tabs. The catalog board-scopes the lens, so it only lights up on the
    /// matching board.
    private func browseTogether() async {
        do {
            try await lists.loadDetail(listId)
            try await lists.refreshGroupStatus(listId: listId)
        } catch {
            // Don't drop the user onto an active lens with empty/stale data.
            actionError = error.localizedDescription
            return
        }
        if let list { activeBoardId = list.board_layout_id }
        lists.activeListId = listId
        router.selection = .search
    }

    @ViewBuilder
    private var inviteSection: some View {
        if let list, let url = ListInviteLink.url(for: list.invite_token) {
            Section {
                ShareLink(item: url) {
                    Label("Share invite link", systemImage: "square.and.arrow.up")
                }
            } footer: {
                Text("Anyone with this link can join this list and share their send/try status.")
            }
        }
    }

    private var membersSection: some View {
        Section("Members") {
            if lists.members.isEmpty {
                Text("No members yet").foregroundStyle(.secondary)
            } else {
                ForEach(lists.members) { member in
                    HStack {
                        MemberInitial(handle: member.handle)
                        Text("@\(member.handle)")
                        Spacer()
                        if member.id == list?.owner_id {
                            Text("owner").font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
    }

    private var pileSection: some View {
        Section("Problems") {
            if lists.pile.isEmpty {
                Text("No problems added yet.")
                    .foregroundStyle(.secondary)
            } else {
                ForEach(lists.pile) { item in
                    Group {
                        if let problem = catalogByID[item.source_catalog_id] {
                            // Same row component as the catalog's problem list, with the same
                            // per-person group badges.
                            CatalogProblemRow(
                                problem: problem,
                                isSent: myStatus?.sent.contains(item.source_catalog_id) ?? false,
                                setup: board.setup,
                                groupBadges: pileBadges(for: item.source_catalog_id)
                            )
                        } else {
                            // Catalog not resolved yet — fall back to the raw id.
                            Text(item.source_catalog_id).foregroundStyle(.secondary)
                        }
                    }
                    // Any member can curate the pile (all members equal) — swipe to remove.
                    .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                        Button(role: .destructive) {
                            Task { await removePileItem(item) }
                        } label: {
                            Label("Delete", systemImage: "trash")
                        }
                    }
                }
            }
        }
    }

    /// The list's board (for row rendering); defaults to Mini 2025 if unresolved.
    private var board: Board { Board.with(layoutId: list?.board_layout_id ?? 7) }

    /// The current user's own folded status, to light the row's "sent" indicator like the
    /// catalog does for your own sends.
    private var myStatus: MemberStatus? { lists.myUserID.flatMap { lists.groupStatus[$0] } }

    /// Per-person status badges for a pile row (handle + color) — green = sent,
    /// orange = tried, gray = untouched — matching the catalog's group-lens rows.
    private func pileBadges(for catalogID: String) -> [(handle: String, color: Color)] {
        lists.members.map {
            (handle: $0.handle, color: memberStatusColor(lists.groupStatus[$0.id], catalogID: catalogID))
        }
    }

    // MARK: - Actions

    private func refresh() async {
        do {
            try await lists.loadDetail(listId)
            membersLoaded = true
            try await lists.refreshGroupStatus(listId: listId)
        } catch {
            actionError = error.localizedDescription
        }
    }

    private func loadCatalog() async {
        guard let list else { return }
        let board = Board.with(layoutId: list.board_layout_id)
        let resource = board.catalogResource(angle: board.defaultAngle)
        let catalog = await Task.detached { Catalog.load(resource: resource) }.value
        var map: [String: CatalogProblem] = [:]
        for problem in catalog.problems { map[problem.id] = problem }
        catalogByID = map
    }

    /// Soft-delete a problem from the shared pile, then reload — `removeProblem` doesn't
    /// refresh published state on its own (unlike `addProblem`), so the row must be
    /// re-fetched for it to disappear.
    private func removePileItem(_ item: ListProblemRow) async {
        do {
            try await lists.removeProblem(item.id)
            try await lists.reloadPile(listId)
        } catch {
            actionError = error.localizedDescription
        }
    }

    private func leave() async {
        do { try await lists.leaveList(listId); dismiss() }
        catch { actionError = error.localizedDescription }
    }

    private func deleteList() async {
        do { try await lists.deleteList(listId); dismiss() }
        catch { actionError = error.localizedDescription }
    }
}
