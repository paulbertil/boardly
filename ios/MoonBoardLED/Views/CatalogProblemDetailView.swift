import SwiftUI
import SwiftData

/// View a single official problem: header (grade, stars, setter, "sent")
/// and the board. Read-only and purely presentational — the light-up / log /
/// navigation actions live on the hosting `CatalogProblemPager`.
struct CatalogProblemDetailView: View {
    @AppStorage("showBeta") private var showBeta = true

    let problem: CatalogProblem
    /// Board art to render with.
    var setup: MoonBoardSetup = .mini2025
    /// Hold sets to show (nil = all). The catalog passes the board's active sets;
    /// the logbook leaves it nil so ascents always show the full board.
    var visibleHoldSetIDs: Set<Int>? = nil
    /// Positions ("col-row") ringed yellow — the active holds filter, if any.
    var selectedHolds: Set<String> = []

    /// Past ascents of this exact catalog problem, to show the "Sent" indicator.
    @Query(filter: #Predicate<Ascent> { !$0.tombstoned }) private var ascents: [Ascent]
    @Query private var favorites: [FavoriteProblem]

    init(problem: CatalogProblem, setup: MoonBoardSetup = .mini2025,
         visibleHoldSetIDs: Set<Int>? = nil, selectedHolds: Set<String> = []) {
        self.problem = problem
        self.setup = setup
        self.visibleHoldSetIDs = visibleHoldSetIDs
        self.selectedHolds = selectedHolds
        let id: String? = problem.id
        _ascents = Query(filter: #Predicate<Ascent> { $0.sourceCatalogID == id })
        let favID = problem.id
        _favorites = Query(filter: #Predicate<FavoriteProblem> { $0.catalogID == favID })
    }

    private var holds: [HoldAssignment] { problem.holdAssignments }

    var body: some View {
        VStack(spacing: 12) {
            CatalogProblemRow(problem: problem,
                              isSent: ascents.contains { $0.sent },
                              isFavorite: !favorites.isEmpty,
                              setup: setup,
                              visibleHoldSetIDs: visibleHoldSetIDs)
                .padding(.horizontal)

            BoardImageView(setup: setup, visibleHoldSetIDs: visibleHoldSetIDs,
                           holds: holds, selectedHolds: selectedHolds, showBeta: showBeta)
                .padding(.horizontal, 8)
            Spacer(minLength: 0)
        }
        .padding(.top, 8)
    }
}

/// The shared problem summary used both in the catalog list and as the header
/// on the detail page: name (+ benchmark seal), setter/holds, stars, repeats,
/// and the grade pill.
struct CatalogProblemRow: View {
    let problem: CatalogProblem
    /// Whether to show a "Sent" indicator after the name (and benchmark icon).
    var isSent: Bool = false
    /// Whether to show the favorite (heart) indicator after the name.
    var isFavorite: Bool = false
    /// Whether to show the small board thumbnail on the left.
    var showPreview: Bool = false
    /// Board art to render the thumbnail with.
    var setup: MoonBoardSetup = .mini2025
    /// Hold sets to show in the thumbnail (nil = all). The catalog passes the
    /// board's active sets; the logbook leaves it nil.
    var visibleHoldSetIDs: Set<Int>? = nil
    /// Per-person group status badges (handle + color), shown under the row in the
    /// collaborative-list lens (U2). nil in solo mode — the row renders exactly as before.
    var groupBadges: [(handle: String, color: Color)]? = nil
    /// Whether this problem is already in the active list's shared pile (shows a glyph).
    var inPile: Bool = false

    var body: some View {
        if let groupBadges, !groupBadges.isEmpty {
            VStack(alignment: .leading, spacing: 5) {
                problemRow
                HStack(spacing: 6) {
                    ForEach(Array(groupBadges.enumerated()), id: \.offset) { _, badge in
                        MemberInitial(handle: badge.handle, color: badge.color, compact: true)
                    }
                }
            }
        } else {
            problemRow
        }
    }

    private var problemRow: some View {
        ProblemRow(
            name: problem.name,
            isBenchmark: problem.isBenchmark,
            isSent: isSent,
            isFavorite: isFavorite,
            inPile: inPile,
            holds: showPreview ? problem.holdAssignments : nil,
            setup: setup,
            visibleHoldSetIDs: visibleHoldSetIDs,
            meta: metaLine,
            subtitle: problem.setter.isEmpty ? "\(problem.holds.count) holds"
                                             : "by \(problem.setter)"
        ) {
            GradePill(grade: problem.grade)
        }
    }

    /// Rating · repeats · method, dot-separated. nil when there's nothing to show.
    private var metaLine: Text? {
        var parts: [Text] = []
        if problem.stars > 0 {
            parts.append(Text("\(Image(systemName: "star.fill")) \(problem.stars)")
                .foregroundColor(.secondary))
        }
        if problem.repeats > 0 {
            parts.append(Text("\(Image(systemName: "arrow.triangle.2.circlepath")) \(problem.repeats)")
                .foregroundColor(.secondary))
        }
        if let method = problem.method {
            parts.append(Text(method).foregroundColor(.indigo))
        }
        return parts.isEmpty ? nil : .dotJoined(parts)
    }
}

/// The standard accent grade pill (the problem's consensus grade).
struct GradePill: View {
    let grade: String
    var body: some View {
        Text(grade)
            .font(.subheadline.weight(.semibold))
            .padding(.horizontal, 10).padding(.vertical, 4)
            .background(Color.accentColor.opacity(0.15), in: Capsule())
    }
}

/// Hosts the catalog detail view in a horizontally swipeable, lazily-rendered
/// pager so swiping left/right moves to the next/previous problem in the same
/// (already filtered & sorted) list. Owns the per-problem actions: light up
/// (toolbar), and the bottom bar (previous · log ascent · next).
struct CatalogProblemPager: View {
    @EnvironmentObject private var ble: MoonBoardBLEManager
    @EnvironmentObject private var sync: LogbookSyncManager
    @EnvironmentObject private var lists: ListsManager
    @Environment(\.modelContext) private var context
    @Query private var favorites: [FavoriteProblem]
    @AppStorage private var flipped: Bool
    @AppStorage("showBeta") private var showBeta = true
    @AppStorage("autoLightOnSwipe") private var autoLightOnSwipe = false

    /// Where this pager was opened from. Determines whether swiping records a
    /// "Recently viewed" problem: browsing a board's catalog does, the logbook
    /// (which spans boards/angles) doesn't.
    enum Source {
        case catalog(angle: Int)
        case logbook
    }

    let problems: [CatalogProblem]
    /// Board these problems belong to (LED row count, per-board flip, logging).
    let board: Board
    /// Hold sets to show (nil = all). Threaded to each detail view.
    var visibleHoldSetIDs: Set<Int>? = nil
    /// Positions ("col-row") ringed yellow — the active holds filter, if any.
    var selectedHolds: Set<String> = []
    /// UserDefaults key under which to record the last problem shown, or nil when
    /// this pager shouldn't record (logbook). Derived from `Source`.
    private let recentKey: String?
    /// The collaborative list whose pile this pager can add/remove the current problem to,
    /// when opened in a list context (catalog lens or a list's pile). nil = no pile button
    /// (e.g. the logbook, or the solo catalog with no active list).
    let pileListId: UUID?
    @State private var currentID: String?
    @State private var showingLog = false
    /// Un-saved tries tapped via "Add try", and the problem they belong to.
    /// Saved as an attempt (`sent: false`) when leaving that problem.
    @State private var pendingTries = 0
    @State private var pendingProblemID: String?
    @State private var showingConnection = false
    /// The problem currently lit on the board (set when we light up, cleared on
    /// disconnect). Drives the lightbulb's "active" state.
    @State private var litProblemID: String?

    init(problems: [CatalogProblem], current: CatalogProblem, board: Board, source: Source,
         visibleHoldSetIDs: Set<Int>? = nil, selectedHolds: Set<String> = [],
         pileListId: UUID? = nil) {
        self.problems = problems
        self.board = board
        self.visibleHoldSetIDs = visibleHoldSetIDs
        self.selectedHolds = selectedHolds
        self.pileListId = pileListId
        switch source {
        case .catalog(let angle): self.recentKey = "catalogRecentProblems_\(board.id)_\(angle)"
        case .logbook:            self.recentKey = nil
        }
        _flipped = AppStorage(wrappedValue: false, board.flippedKey)
        _currentID = State(initialValue: current.id)
    }

    private var currentIndex: Int? {
        problems.firstIndex { $0.id == currentID }
    }

    private var currentProblem: CatalogProblem? {
        currentIndex.map { problems[$0] } ?? problems.first
    }

    /// The list this pager can add/remove to — only when a `pileListId` was passed AND the
    /// loaded detail slot matches it on this board, so `lists.pile` genuinely reflects it.
    private var pileList: ListRow? {
        guard let id = pileListId,
              let current = lists.currentList,
              current.id == id,
              current.board_layout_id == board.id else { return nil }
        return current
    }

    /// Whether the on-screen problem is already in `pileList`'s shared pile.
    private var currentInPile: Bool {
        guard let pid = currentProblem?.id else { return false }
        return lists.pile.contains { $0.source_catalog_id == pid }
    }

    /// Toggle the on-screen problem in the list's pile (add when absent, remove when present),
    /// then reload the pile so the button and any list view reflect it.
    private func togglePile(_ list: ListRow) async {
        guard let p = currentProblem else { return }
        do {
            if let row = lists.pile.first(where: { $0.source_catalog_id == p.id }) {
                // removeProblem soft-deletes without refreshing published state; reload so the
                // button (and any list view) reflects it. addProblem already reloads internally
                // when currentList matches — which pileList's guard guarantees — so the add
                // branch needs no explicit reload.
                try await lists.removeProblem(row.id)
                try await lists.reloadPile(list.id)
            } else {
                try await lists.addProblem(listId: list.id, sourceCatalogID: p.id,
                                           boardLayoutId: board.id)
            }
        } catch {
            // A failed pile edit is non-fatal here; the button state just stays as-is.
        }
    }

    var body: some View {
        GeometryReader { geo in
            ScrollView(.horizontal) {
                LazyHStack(spacing: 0) {
                    ForEach(problems) { problem in
                        CatalogProblemDetailView(problem: problem, setup: board.setup,
                                                 visibleHoldSetIDs: visibleHoldSetIDs,
                                                 selectedHolds: selectedHolds)
                            .frame(width: geo.size.width)
                            .id(problem.id)
                    }
                }
                .scrollTargetLayout()
            }
            .scrollTargetBehavior(.paging)
            .scrollPosition(id: $currentID)
            .scrollIndicators(.hidden)
        }
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .safeAreaInset(edge: .bottom) { bottomBar }
        .onChange(of: ble.isConnected) { _, connected in
            if !connected { litProblemID = nil }
        }
        .onChange(of: currentID) { _, id in
            flushPending()
            recordRecent(id)   // remember the last problem shown here
            if autoLightOnSwipe && ble.isConnected { lightUp() }
        }
        // The initial `currentID` (set via State(initialValue:)) doesn't fire
        // onChange, so record the first-shown problem here too.
        .onAppear { recordRecent(currentID) }
        .onDisappear { flushPending() }
        .sheet(isPresented: $showingLog) {
            if let p = currentProblem {
                LogAscentSheet(sourceCatalogID: p.id,
                               problemName: p.name,
                               problemGrade: p.grade,
                               tries: max(currentTries, 1),
                               sent: true,
                               boardLayoutId: board.id,
                               onComplete: { pendingTries = 0; pendingProblemID = nil })
            }
        }
        .sheet(isPresented: $showingConnection) {
            ConnectionView()
        }
    }

    private var bottomBar: some View {
        VStack(spacing: 12) {
            // Row 1: navigate · light · favorite.
            HStack(spacing: 20) {
                circleButton(systemName: "chevron.left") { go(by: -1) }
                    .disabled((currentIndex ?? 0) <= 0)

                Spacer()

                circleButton(systemName: ble.isConnected ? "lightbulb.fill" : "lightbulb",
                             tint: lightIsActive ? .blue : .primary,
                             active: lightIsActive) {
                    if ble.isConnected { lightUp() } else { showingConnection = true }
                }

                circleButton(systemName: isCurrentFavorite ? "heart.fill" : "heart",
                             tint: isCurrentFavorite ? .pink : .primary,
                             active: isCurrentFavorite) {
                    toggleFavorite()
                }
                .disabled(currentProblem == nil)

                // Add/remove the on-screen problem to the active list's shared pile — only
                // shown when opened in a list context (catalog lens or a list's pile).
                if let pileList {
                    circleButton(systemName: currentInPile ? "tray.and.arrow.down.fill" : "tray.and.arrow.down",
                                 tint: currentInPile ? .accentColor : .primary,
                                 active: currentInPile) {
                        Task { await togglePile(pileList) }
                    }
                    .disabled(currentProblem == nil)
                }

                Spacer()

                circleButton(systemName: "chevron.right") { go(by: 1) }
                    .disabled((currentIndex ?? problems.count - 1) >= problems.count - 1)
            }

            // Row 2: logging.
            HStack(spacing: 16) {
                TryStepper(count: currentTries, onRemove: removeTry, onAdd: addTry)

                Button { showingLog = true } label: {
                    Label("Log ascent", systemImage: "checkmark.circle.fill")
                        .lineLimit(1)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
            }
        }
        .padding(.horizontal)
        .padding(.vertical, 10)
        .background(Color(.systemBackground).ignoresSafeArea(edges: .bottom))
    }

    /// True when the board is connected and lit with the problem on screen.
    private var lightIsActive: Bool {
        ble.isConnected && litProblemID != nil && litProblemID == currentProblem?.id
    }

    private func circleButton(systemName: String,
                              tint: Color = .primary,
                              active: Bool = false,
                              action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.headline)
                .foregroundStyle(tint)
                .frame(width: 48, height: 48)
                .background((active ? tint.opacity(0.25) : Color.primary.opacity(0.1)), in: Circle())
        }
        .buttonStyle(.plain)
    }

    private func lightUp() {
        guard let p = currentProblem else { return }
        ble.send(holds: p.holdAssignments, rows: board.rows, flipped: flipped, showBeta: showBeta)
        litProblemID = p.id
    }

    /// Pending tries that belong to the problem currently on screen (0 if the
    /// pending count is for some other problem).
    private var currentTries: Int {
        pendingProblemID == currentID ? pendingTries : 0
    }

    private func addTry() {
        if pendingProblemID != currentID {
            flushPending()
            pendingProblemID = currentID
            pendingTries = 0
        }
        pendingTries += 1
    }

    /// Undo an accidental "Log try" tap.
    private func removeTry() {
        guard currentTries > 0 else { return }
        pendingTries -= 1
        if pendingTries == 0 { pendingProblemID = nil }
    }

    /// Save any pending tries for `pendingProblemID` as an attempt, then reset.
    /// Tries logged on the same problem earlier the same day are merged into that
    /// existing attempt rather than creating a second entry.
    /// Number of problems kept in the per-board+angle "recently viewed" history.
    private static let recentLimit = 5

    /// Prepend the shown problem to this board+angle's "recently viewed" history
    /// (move-to-front, de-duplicated, capped). No-op when opened outside a board
    /// browse (`recentKey == nil`), e.g. from the logbook.
    private func recordRecent(_ id: String?) {
        guard let recentKey, let id else { return }
        var ids = (UserDefaults.standard.string(forKey: recentKey)?
            .split(separator: "|").map(String.init)) ?? []
        ids.removeAll { $0 == id }
        ids.insert(id, at: 0)
        UserDefaults.standard.set(ids.prefix(Self.recentLimit).joined(separator: "|"),
                                  forKey: recentKey)
    }

    private func flushPending() {
        guard pendingTries > 0, let id = pendingProblemID,
              let p = problems.first(where: { $0.id == id }) else {
            pendingTries = 0
            pendingProblemID = nil
            return
        }
        let tries = pendingTries
        pendingTries = 0
        pendingProblemID = nil

        let day = Date()
        // Deterministic id (per catalog problem + UTC day) so the same-day attempt
        // converges to one row across devices AND the local merge keys off the exact
        // same bucket the server does — no local-calendar vs UTC drift (#12).
        let attemptID = AscentSyncID.attemptID(problemIdentity: p.id, day: day)
        if let existing = LogbookSession.attemptRow(id: attemptID, in: context) {
            LogbookSession.revive(existing, tries: tries, date: day)
        } else {
            let attempt = Ascent(date: day,
                                 sourceCatalogID: p.id,
                                 problemName: p.name,
                                 problemGrade: p.grade,
                                 votedGrade: p.grade,
                                 tries: tries,
                                 sent: false,
                                 boardLayoutId: board.id,
                                 id: attemptID)
            attempt.markDirty()
            context.insert(attempt)
        }
        sync.pushSoon()
    }

    /// Whether the on-screen problem is currently favorited.
    private var isCurrentFavorite: Bool {
        guard let id = currentProblem?.id else { return false }
        return favorites.contains { $0.catalogID == id }
    }

    private func toggleFavorite() {
        guard let id = currentProblem?.id else { return }
        if let existing = favorites.first(where: { $0.catalogID == id }) {
            context.delete(existing)
        } else {
            context.insert(FavoriteProblem(catalogID: id))
        }
    }

    /// Move to the previous (-1) / next (+1) problem, mirroring a swipe.
    private func go(by delta: Int) {
        guard let idx = currentIndex else { return }
        let target = idx + delta
        guard problems.indices.contains(target) else { return }
        withAnimation { currentID = problems[target].id }
    }
}
