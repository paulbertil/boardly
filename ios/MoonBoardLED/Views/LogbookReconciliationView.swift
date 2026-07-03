import SwiftUI

/// Sign-in collision modal. Shown once, only when signing in finds a logbook on BOTH
/// this device and in the cloud. A **binary, wholesale winner pick — no merge**:
///
///   • Use this device → local overwrites the cloud (old cloud rows are tombstoned so
///     other devices converge down).
///   • Use the cloud   → cloud overwrites local.
///
/// The losing side's unique climbs are discarded — the copy says so plainly. This is
/// deliberately not a merge (that would risk duplicates, which the design rejects).
struct LogbookReconciliationView: View {
    @EnvironmentObject private var sync: LogbookSyncManager
    @State private var working = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 20) {
                Text("You have a logbook on this device and one in your account.")
                    .font(.headline)
                Text("Choose which one to keep. This can't be undone, and the other one's climbs will be discarded — there's no merge.")
                    .foregroundStyle(.secondary)

                if let errorMessage {
                    Text(errorMessage)
                        .font(.footnote)
                        .foregroundStyle(.red)
                }

                Spacer()

                VStack(spacing: 12) {
                    Button {
                        run { try await sync.overwriteLocalWithCloud() }
                    } label: {
                        choice(title: "Use my account's logbook",
                               subtitle: "Replace this device with what's in the cloud.")
                    }
                    .buttonStyle(.borderedProminent)

                    Button {
                        run { try await sync.overwriteCloudWithLocal() }
                    } label: {
                        choice(title: "Use this device's logbook",
                               subtitle: "Replace the cloud (and your other devices) with this device.")
                    }
                    .buttonStyle(.bordered)
                }
                .disabled(working)
            }
            .padding()
            .navigationTitle("Which logbook?")
            .navigationBarTitleDisplayMode(.inline)
            .overlay {
                if working { ProgressView().controlSize(.large) }
            }
        }
    }

    private func choice(title: String, subtitle: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title).fontWeight(.semibold)
            Text(subtitle).font(.caption).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// Runs a reconciliation choice; the manager clears `pendingReconciliation` on
    /// success, which dismisses this sheet. On failure (offline) we surface a message
    /// and stay up so the user can retry.
    private func run(_ action: @escaping () async throws -> Void) {
        working = true
        errorMessage = nil
        Task {
            do {
                try await action()
            } catch {
                errorMessage = "Couldn't sync — check your connection and try again."
            }
            working = false
        }
    }
}
