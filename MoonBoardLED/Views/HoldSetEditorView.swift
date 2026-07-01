import SwiftUI

/// Edit which hold sets are installed on the board. A live board preview shows
/// only the active sets; toggling a set updates the preview immediately. Changes
/// persist to `@AppStorage` as they're made (the sheet has no explicit save). At
/// least one set stays active at all times.
struct HoldSetEditorView: View {
    let setup: MoonBoardSetup
    @AppStorage(ActiveHoldSets.miniStorageKey) private var activeCSV = ""
    @Environment(\.dismiss) private var dismiss

    private var active: Set<Int> { ActiveHoldSets.ids(from: activeCSV, in: setup) }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    BoardImageView(setup: setup, visibleHoldSetIDs: active)
                        .frame(maxHeight: 320)
                        .frame(maxWidth: .infinity)
                        .listRowInsets(EdgeInsets())
                        .listRowBackground(Color.clear)
                        .padding(.vertical, 8)
                }

                Section {
                    ForEach(setup.holdSets) { holdSet in
                        let isOn = active.contains(holdSet.id)
                        let isLast = isOn && active.count == 1
                        Button { toggle(holdSet.id) } label: {
                            HStack {
                                Text(holdSet.name).foregroundStyle(.primary)
                                Spacer()
                                if isOn {
                                    Image(systemName: "checkmark").foregroundStyle(.tint)
                                }
                            }
                        }
                        .disabled(isLast)
                    }
                } header: {
                    Text("Installed hold sets")
                } footer: {
                    Text("Only problems you can climb with these hold sets are shown in the catalog. At least one set must stay active.")
                }
            }
            .navigationTitle("Hold Sets")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    private func toggle(_ id: Int) {
        var ids = active
        if ids.contains(id) {
            guard ids.count > 1 else { return }  // keep at least one
            ids.remove(id)
        } else {
            ids.insert(id)
        }
        activeCSV = ActiveHoldSets.csv(from: ids, in: setup)
    }
}
