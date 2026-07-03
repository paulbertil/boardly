import SwiftUI

/// View + edit the signed-in user's profile (handle + display name). Pushed from the
/// Account section of Settings. Handle uniqueness is re-checked live, treating the
/// user's own current handle as available so they can save a display-name-only change.
struct ProfileView: View {
    @EnvironmentObject private var auth: AuthManager
    @Environment(\.dismiss) private var dismiss

    @State private var handle = ""
    @State private var displayName = ""
    @State private var validation: HandleValidation = .available
    @State private var isSaving = false
    @State private var saveError: String?
    @State private var checkTask: Task<Void, Never>?

    private enum HandleValidation: Equatable {
        case invalidFormat
        case checking
        case taken
        case available

        var canSave: Bool { self == .available }
    }

    /// The handle the user currently owns — always valid to keep.
    private var currentHandle: String { auth.profile?.handle ?? "" }

    private var hasChanges: Bool {
        HandleRules.normalize(handle) != HandleRules.normalize(currentHandle)
            || displayName != (auth.profile?.displayName ?? "")
    }

    var body: some View {
        Form {
            Section {
                HStack(spacing: 2) {
                    Text("@").foregroundStyle(.secondary)
                    TextField("handle", text: $handle)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .textContentType(.username)
                }
            } header: {
                Text("Handle")
            } footer: {
                handleFooter
            }

            Section("Display name") {
                TextField("Your name", text: $displayName)
                    .textContentType(.name)
            }

            if let saveError {
                Section { Text(saveError).foregroundStyle(.red) }
            }
        }
        .navigationTitle("Profile")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                if isSaving {
                    ProgressView()
                } else {
                    Button("Save") { Task { await save() } }
                        .disabled(!validation.canSave || !hasChanges)
                }
            }
        }
        .onAppear {
            handle = auth.profile?.handle ?? ""
            displayName = auth.profile?.displayName ?? ""
        }
        .onChange(of: handle) { _, newValue in
            scheduleValidation(for: newValue)
        }
    }

    @ViewBuilder
    private var handleFooter: some View {
        switch validation {
        case .invalidFormat:
            Text("Use 3–20 lowercase letters, numbers, or underscores.")
                .foregroundStyle(.red)
        case .checking:
            Text("Checking availability…").foregroundStyle(.secondary)
        case .taken:
            Text("That handle is taken.").foregroundStyle(.red)
        case .available:
            EmptyView()
        }
    }

    private func scheduleValidation(for raw: String) {
        checkTask?.cancel()
        let normalized = HandleRules.normalize(raw)

        // Unchanged from the user's own handle: always fine.
        if normalized == HandleRules.normalize(currentHandle) {
            validation = .available
            return
        }
        guard HandleRules.isValidFormat(normalized) else {
            validation = .invalidFormat
            return
        }

        validation = .checking
        checkTask = Task {
            try? await Task.sleep(for: .milliseconds(400))
            if Task.isCancelled { return }
            do {
                let available = try await auth.isHandleAvailable(normalized)
                if Task.isCancelled { return }
                guard HandleRules.normalize(handle) == normalized else { return }
                validation = available ? .available : .taken
            } catch {
                if !Task.isCancelled { validation = .invalidFormat }
            }
        }
    }

    private func save() async {
        saveError = nil
        isSaving = true
        defer { isSaving = false }
        do {
            try await auth.saveProfile(handle: handle, displayName: displayName)
            dismiss()
        } catch {
            saveError = "Couldn't save your changes. That handle may have just been taken — try another."
        }
    }
}
