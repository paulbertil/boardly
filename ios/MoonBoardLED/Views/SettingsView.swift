import SwiftUI

/// The Settings tab: board configuration and tools that used to live in the
/// home screen's overflow menu — LED test/calibration, clear board, and the
/// orientation / beta display toggles.
struct SettingsView: View {
    @EnvironmentObject private var ble: MoonBoardBLEManager
    @EnvironmentObject private var auth: AuthManager
    @AppStorage("appAppearance") private var appearance: AppAppearance = .system
    @AppStorage("autoLightOnSwipe") private var autoLightOnSwipe = false
    @AppStorage("showClimbPreviews") private var showClimbPreviews = true

    @State private var activeSheet: SettingsSheet?

    var body: some View {
        NavigationStack {
            Form {
                AccountSection(activeSheet: $activeSheet)

                Section("Display") {
                    Picker("Appearance", selection: $appearance) {
                        ForEach(AppAppearance.allCases) { Text($0.label).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    // "Show beta" is hidden for now: no bundled catalog uses
                    // left/match holds, so there's no beta to show. The `showBeta`
                    // setting (default on) still drives BoardImageView — restore
                    // this toggle once problems with real beta ship.
                    Toggle("Show climb previews", isOn: $showClimbPreviews)
                }

                Section {
                    Toggle("Auto-light on swipe", isOn: $autoLightOnSwipe)
                } footer: {
                    Text("When browsing problems, automatically light each one on the board as you swipe to it.")
                }

                Section {
                    // The LED link is global (not per-board). Tapping opens the
                    // scan/connect sheet, which hosts calibration when connected.
                    Button { activeSheet = .connection } label: {
                        HStack {
                            Text("LED")
                                .foregroundStyle(.primary)
                            Spacer()
                            VStack(alignment: .trailing, spacing: 2) {
                                HStack(spacing: 6) {
                                    Circle()
                                        .fill(ble.isConnected ? Color.blue : Color.gray)
                                        .frame(width: 8, height: 8)
                                    Text(ble.isConnected ? "Connected" : "Not connected")
                                        .font(.caption)
                                        .foregroundStyle(ble.isConnected ? Color.blue : Color.secondary)
                                }
                                if ble.isConnected, let name = ble.connectedName {
                                    // Explicit gray, not a hierarchical style: inside a
                                    // tinted Button the latter picks up the accent (blue).
                                    Text(name)
                                        .font(.caption2)
                                        .foregroundStyle(Color.secondary)
                                }
                            }
                        }
                    }
                } header: {
                    Text("Board")
                }
            }
            .navigationTitle("Settings")
            // Single presentation slot for everything raised from this tab's
            // NavigationStack. Two `.sheet` modifiers sharing one presenting
            // controller collide in SwiftUI ("already presenting" → the sheet
            // dismisses itself the instant it opens), so connection, sign-in, and
            // profile-setup all flow through this one modifier.
            .sheet(item: $activeSheet) { sheet in
                switch sheet {
                case .connection: ConnectionView()
                case .signIn: SignInView()
                case .profileSetup: ProfileSetupView()
                }
            }
            // Auth-status transitions drive the sheet from here rather than from
            // each presented view, so there's always exactly one writer of
            // `activeSheet`. Raising profile setup on the *transition* into the
            // no-profile state (not continuously) keeps "Not now" dismissible; a
            // completed profile or a sign-out closes whatever is open.
            .onChange(of: auth.status) { _, newValue in
                switch newValue {
                case .signedInNoProfile:
                    activeSheet = .profileSetup
                case .signedInWithProfile:
                    activeSheet = nil
                case .signedOut:
                    break
                }
            }
        }
    }
}

/// The one sheet a Settings screen can present at a time. Owned by `SettingsView`
/// so the connection, sign-in, and profile-setup flows never stack two `.sheet`
/// modifiers on the same NavigationStack.
enum SettingsSheet: Identifiable {
    case connection, signIn, profileSetup
    var id: Self { self }
}

/// The Account section of Settings. Signed-out shows a sign-in entry; signed-in shows
/// the profile summary with edit / sign out / delete. The middle state (signed in, no
/// profile yet) nudges the user to finish setup. Auth is optional — everything else in
/// the app works signed-out.
private struct AccountSection: View {
    @EnvironmentObject private var auth: AuthManager
    /// The Settings-wide sheet slot, owned by `SettingsView`. The account buttons
    /// set it; a single `.sheet(item:)` up there does the presenting.
    @Binding var activeSheet: SettingsSheet?
    @State private var confirmingSignOut = false
    @State private var confirmingDelete = false
    @State private var isDeleting = false
    @State private var actionError: String?

    var body: some View {
        // No backend configured in this build → no auth entry point at all. The rest
        // of Settings (and the app) stays fully usable.
        if auth.isConfigured || auth.status != .signedOut {
            accountSection
        }
    }

    @ViewBuilder
    private var accountSection: some View {
        Section {
            if auth.isRestoring {
                // Session restore runs async on launch. Until it resolves, don't offer
                // "Sign in" — otherwise a user with a saved session taps it and the sheet
                // slams shut the instant the restored session lands (SettingsView closes
                // it on the transition to a non-signedOut status).
                HStack {
                    Text("Checking sign-in…").foregroundStyle(.secondary)
                    Spacer()
                    ProgressView()
                }
            } else {
                switch auth.status {
                case .signedOut:
                    Button {
                        activeSheet = .signIn
                    } label: {
                        Label("Sign in", systemImage: "person.crop.circle.badge.plus")
                    }

            case .signedInNoProfile:
                Button {
                    activeSheet = .profileSetup
                } label: {
                    Label("Finish setting up your profile", systemImage: "person.crop.circle.badge.exclamationmark")
                }
                Button(role: .destructive) { confirmingSignOut = true } label: {
                    Text("Sign out")
                }

            case .signedInWithProfile:
                NavigationLink {
                    ProfileView()
                } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(auth.profile?.displayName.isEmpty == false
                             ? auth.profile!.displayName
                             : "@\(auth.profile?.handle ?? "")")
                            .font(.body)
                        if auth.profile?.displayName.isEmpty == false {
                            Text("@\(auth.profile?.handle ?? "")")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                Button(role: .destructive) { confirmingSignOut = true } label: {
                    Text("Sign out")
                }
                Button(role: .destructive) { confirmingDelete = true } label: {
                    if isDeleting {
                        ProgressView()
                    } else {
                        Text("Delete account")
                    }
                }
                .disabled(isDeleting)
                }
            }
        } header: {
            Text("Account")
        } footer: {
            if let actionError {
                Text(actionError).foregroundStyle(.red)
            }
        }
        .confirmationDialog("Sign out?", isPresented: $confirmingSignOut, titleVisibility: .visible) {
            Button("Sign out", role: .destructive) { Task { await signOut() } }
            Button("Cancel", role: .cancel) {}
        }
        .confirmationDialog(
            "Delete account? This permanently removes your profile and cannot be undone.",
            isPresented: $confirmingDelete,
            titleVisibility: .visible
        ) {
            Button("Delete account", role: .destructive) { Task { await deleteAccount() } }
            Button("Cancel", role: .cancel) {}
        }
    }

    private func signOut() async {
        actionError = nil
        do { try await auth.signOut() }
        catch { actionError = error.localizedDescription }
    }

    private func deleteAccount() async {
        actionError = nil
        isDeleting = true
        defer { isDeleting = false }
        do { try await auth.deleteAccount() }
        catch { actionError = "Couldn't delete your account. Please try again." }
    }
}
