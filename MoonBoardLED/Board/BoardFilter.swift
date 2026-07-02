import SwiftUI

/// Shared, persisted "which boards to include" selection, used by both the
/// logbook and the home grade pyramid. Stored as a "|"-joined list of layout ids
/// in `@AppStorage(BoardFilter.storageKey)`; empty = all *added* boards.
///
/// The filter is scoped to the boards the user has added (`AddedBoards`), not every
/// supported board. A selection is always intersected with the added set, so
/// removing a board silently drops it from the filter; re-adding it brings it back.
enum BoardFilter {
    static let storageKey = "logbookBoardFilter"

    /// The currently added board ids (app-global). "All" is defined relative to
    /// this set, so the filter tracks the boards you actually own.
    private static var addedIDs: Set<Int> { Set(AddedBoards.ids(from: AddedBoards.currentCSV)) }

    /// Selected board ids, intersected with the added boards. Empty (or a selection
    /// that no longer matches any added board) → all added boards.
    static func selected(from csv: String) -> Set<Int> {
        let added = addedIDs
        let ids = Set(csv.split(separator: "|").compactMap { Int($0) }).intersection(added)
        return ids.isEmpty ? added : ids
    }

    static func csv(from ids: Set<Int>) -> String {
        if ids.count >= addedIDs.count { return "" }  // covers all added → "all"
        return ids.sorted().map(String.init).joined(separator: "|")
    }

    /// Short summary for the menu label.
    static func label(from csv: String) -> String {
        let ids = selected(from: csv)
        if ids.count >= addedIDs.count { return "All boards" }
        if ids.count == 1, let board = Board.all.first(where: { ids.contains($0.id) }) {
            return board.name
        }
        return "\(ids.count) boards"
    }
}

/// A multiselect menu that toggles which added boards are included, bound to the
/// shared `BoardFilter` selection. Deselecting the last board falls back to all
/// added boards. Observes `AddedBoards` so it re-renders as boards are added/removed.
struct BoardFilterMenu: View {
    @AppStorage(BoardFilter.storageKey) private var csv = ""
    @AppStorage(AddedBoards.storageKey) private var addedCSV = ""

    private var addedBoards: [Board] { AddedBoards.boards(from: addedCSV) }

    var body: some View {
        Menu {
            ForEach(addedBoards) { board in
                let selected = BoardFilter.selected(from: csv)
                Button { toggle(board.id, in: selected) } label: {
                    if selected.contains(board.id) {
                        Label(board.name, systemImage: "checkmark")
                    } else {
                        Text(board.name)
                    }
                }
            }
        } label: {
            Label(BoardFilter.label(from: csv), systemImage: "line.3.horizontal.decrease.circle")
                .font(.subheadline)
        }
    }

    private func toggle(_ id: Int, in selected: Set<Int>) {
        var ids = selected
        if ids.contains(id) { ids.remove(id) } else { ids.insert(id) }
        if ids.isEmpty { ids = Set(AddedBoards.ids(from: addedCSV)) }  // never show nothing
        csv = BoardFilter.csv(from: ids)
    }
}

/// A horizontal row of filter pills bound to the shared `BoardFilter` selection —
/// one pill per *added* board, highlighted when included. By default (never
/// filtered) all added boards are selected, so every pill starts highlighted.
/// Tapping a pill toggles that board; deselecting the last one falls back to all
/// (never show nothing). Observes `AddedBoards` so it tracks added/removed boards.
struct BoardFilterPills: View {
    @AppStorage(BoardFilter.storageKey) private var csv = ""
    @AppStorage(AddedBoards.storageKey) private var addedCSV = ""

    private var selected: Set<Int> { BoardFilter.selected(from: csv) }
    private var addedBoards: [Board] { AddedBoards.boards(from: addedCSV) }

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(addedBoards) { board in
                    pill(title: board.name, isOn: selected.contains(board.id)) {
                        toggle(board.id)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func pill(title: String, isOn: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.subheadline.weight(isOn ? .semibold : .regular))
                .padding(.horizontal, 14)
                .padding(.vertical, 7)
                .background(isOn ? Color.accentColor : Color(.secondarySystemFill),
                            in: Capsule())
                .foregroundStyle(isOn ? Color.white : Color.primary)
        }
        .buttonStyle(.plain)
    }

    private func toggle(_ id: Int) {
        var ids = selected
        if ids.contains(id) { ids.remove(id) } else { ids.insert(id) }
        if ids.isEmpty { ids = Set(AddedBoards.ids(from: addedCSV)) }  // never show nothing
        csv = BoardFilter.csv(from: ids)
    }
}
