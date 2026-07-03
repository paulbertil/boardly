import SwiftUI

/// First-run modal shown once a user is signed in but has no profile yet. Collects a
/// unique `@handle` (validated live) and a display name, then creates the `profiles`
/// row. This is the only place a row gets created (client-side, after a valid handle).
///
/// Completion is gated on a valid, available handle. The app stays usable locally in
/// the meantime — "Not now" defers setup and it re-presents on the next social surface.
struct ProfileSetupView: View {
    @EnvironmentObject private var auth: AuthManager
    @Environment(\.dismiss) private var dismiss

    @State private var handle = ""
    @State private var displayName = ""
    @State private var validation: HandleValidation = .empty
    @State private var isSaving = false
    @State private var saveError: String?
    /// Debounces the live uniqueness lookup while typing.
    @State private var checkTask: Task<Void, Never>?

    /// Live state of the handle field, driving the helper text + Save enablement.
    private enum HandleValidation: Equatable {
        case empty
        case invalidFormat
        case checking
        case taken
        case available

        var canSave: Bool { self == .available }
    }

    var body: some View {
        NavigationStack {
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
                    Section {
                        Text(saveError).foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle("Set up your profile")
            .navigationBarTitleDisplayMode(.inline)
            .interactiveDismissDisabled()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Not now") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if isSaving {
                        ProgressView()
                    } else {
                        Button("Save") { Task { await save() } }
                            .disabled(!validation.canSave)
                    }
                }
            }
            .onChange(of: handle) { _, newValue in
                scheduleValidation(for: newValue)
            }
        }
    }

    @ViewBuilder
    private var handleFooter: some View {
        switch validation {
        case .empty:
            Text("3–20 characters: lowercase letters, numbers, underscore.")
        case .invalidFormat:
            Text("Use 3–20 lowercase letters, numbers, or underscores.")
                .foregroundStyle(.red)
        case .checking:
            Text("Checking availability…")
                .foregroundStyle(.secondary)
        case .taken:
            Text("That handle is taken.")
                .foregroundStyle(.red)
        case .available:
            Label("Available", systemImage: "checkmark.circle.fill")
                .foregroundStyle(.green)
        }
    }

    /// Validate format immediately, then debounce the network uniqueness check.
    private func scheduleValidation(for raw: String) {
        checkTask?.cancel()
        let normalized = HandleRules.normalize(raw)

        guard !normalized.isEmpty else { validation = .empty; return }
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
                // Ignore a stale result if the field changed under us.
                guard HandleRules.normalize(handle) == normalized else { return }
                validation = available ? .available : .taken
            } catch {
                // Treat a lookup failure as "unknown"; keep it non-savable but don't
                // hard-error — the save-time upsert re-checks uniqueness anyway.
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
            // Most likely a lost uniqueness race (unique-violation) — surface it and
            // let them pick another handle.
            saveError = "Couldn't save your profile. That handle may have just been taken — try another."
        }
    }
}
