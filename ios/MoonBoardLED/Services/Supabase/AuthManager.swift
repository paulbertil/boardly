import Foundation
import Supabase

/// The app's authentication + profile hub, injected app-wide as a `@StateObject`.
///
/// Provider-agnostic on purpose: today it exposes **email magic link** and **Google
/// OAuth**; **Sign in with Apple** is stubbed (`signInWithApple`) pending paid Apple
/// Developer enrollment — it drops in without touching call sites. Everything auth
/// hangs off this one object so the rest of the app never talks to the SDK directly.
///
/// Auth is purely additive: the app is fully usable signed-out, so nothing here ever
/// blocks the offline BLE / catalog / local-logbook experience. If the app is built
/// without Supabase config, `isConfigured` is false, the manager stays inert
/// (`signedOut`), and every sign-in method throws `AuthError.notConfigured`.
@MainActor
final class AuthManager: ObservableObject {

    /// The three-state machine the whole app keys off (plan decision 5):
    ///   • `signedOut`            — no session; offer sign-in from Settings.
    ///   • `signedInNoProfile`    — authenticated but no `profiles` row yet; social
    ///                              surfaces re-present `ProfileSetupView` until a
    ///                              handle is saved. App stays usable locally.
    ///   • `signedInWithProfile`  — full identity; `profile` is non-nil.
    enum Status: Equatable {
        case signedOut
        case signedInNoProfile
        case signedInWithProfile
    }

    @Published private(set) var status: Status = .signedOut
    /// The current user's `profiles` row, or nil until a handle is chosen.
    @Published private(set) var profile: Profile?
    /// True during initial session restore, so the UI can avoid flashing signed-out.
    @Published private(set) var isRestoring = true

    /// Whether this build has Supabase credentials. When false, all sign-in surfaces
    /// should be disabled rather than invoked (they'd throw `.notConfigured`).
    var isConfigured: Bool { client != nil }

    /// nil when the app is built without Supabase config — see SupabaseClientProvider.
    private let client = SupabaseClientProvider.shared
    private var authStateTask: Task<Void, Never>?

    init() {
        guard let client else {
            // No backend configured: stay inert and usable. Nothing to restore.
            isRestoring = false
            return
        }
        // Listen for auth changes for the whole app lifetime. `.initialSession` fires
        // once on subscribe with the restored (or absent) session, which doubles as
        // our launch-time session restore — no separate bootstrap call needed.
        authStateTask = Task { [weak self] in
            guard let self else { return }
            for await (event, session) in client.auth.authStateChanges {
                await self.handle(event: event, session: session)
            }
        }
    }

    deinit { authStateTask?.cancel() }

    // MARK: - Sign in

    /// Emails a 6-digit one-time code. Chosen over a tappable magic link because a link
    /// relies on Safari handing a server redirect back to the app's custom URL scheme,
    /// which mobile Safari blocks (lands on about:blank) without Universal Links (a paid
    /// Apple account + hosted domain — deferred). A typed code has no redirect and works
    /// identically on device and Simulator. `verifyEmailCode` completes the sign-in.
    ///
    /// Requires the Supabase email template to surface `{{ .Token }}` — see the setup doc.
    func sendEmailCode(email: String) async throws {
        let client = try requireClient()
        try await client.auth.signInWithOTP(
            email: email.trimmingCharacters(in: .whitespacesAndNewlines)
        )
    }

    /// Verifies the 6-digit code the user typed, establishing a session. The
    /// `authStateChanges` listener then advances `status` and loads the profile.
    func verifyEmailCode(email: String, code: String) async throws {
        let client = try requireClient()
        try await client.auth.verifyOTP(
            email: email.trimmingCharacters(in: .whitespacesAndNewlines),
            token: code.trimmingCharacters(in: .whitespacesAndNewlines),
            type: .email
        )
    }

    /// Google OAuth. The SDK presents an `ASWebAuthenticationSession` and, on success,
    /// exchanges the code for a session itself — no manual callback handling needed for
    /// this path (unlike the magic link, which returns through the app's URL handler).
    func signInWithGoogle() async throws {
        let client = try requireClient()
        try await client.auth.signInWithOAuth(
            provider: .google,
            redirectTo: SupabaseConfig.redirectURL
        )
    }

    /// Sign in with Apple — DEFERRED until paid Apple Developer enrollment.
    ///
    /// The capability needs the paid program ($99/yr) + the Sign-in-with-Apple
    /// entitlement + an Apple Services ID, none of which exist yet (the app signs with
    /// a free personal team). When enrolling: add the entitlement, enable the Apple
    /// provider in Supabase, and implement this via `ASAuthorizationAppleIDProvider`
    /// + `client.auth.signInWithIdToken(credentials:)`. Kept here so the UI can wire an
    /// Apple button without changing the manager's shape.
    func signInWithApple() async throws {
        throw AuthError.appleSignInUnavailable
        // let credential = ... // ASAuthorization Apple ID flow
        // try await client.auth.signInWithIdToken(
        //     credentials: .init(provider: .apple, idToken: idToken, nonce: nonce))
    }

    /// Completes a deep-link return (magic-link click, or an OAuth redirect the SDK
    /// hands back to the app). Exchanges the URL for a session; no-op for unrelated
    /// URLs. Call from the app's `.onOpenURL`.
    func handleCallback(url: URL) async {
        guard let client else { return }
        do {
            try await client.auth.session(from: url)
        } catch {
            // Unrelated URL or an expired/replayed link — nothing to do; the auth
            // state simply doesn't advance.
        }
    }

    // MARK: - Session lifecycle

    func signOut() async throws {
        let client = try requireClient()
        try await client.auth.signOut()
    }

    /// Deletes the auth user (via the `delete_user` SECURITY DEFINER RPC, which cascades
    /// to the `profiles` row) and then clears the local session. App Store Guideline
    /// 5.1.1(v).
    func deleteAccount() async throws {
        let client = try requireClient()
        try await client.rpc("delete_user").execute()
        try? await client.auth.signOut()
    }

    // MARK: - Profile

    /// Whether `handle` is free (case-insensitively). Call after format validation.
    func isHandleAvailable(_ handle: String) async throws -> Bool {
        let client = try requireClient()
        let normalized = HandleRules.normalize(handle)
        let response = try await client
            .from("profiles")
            .select("id", head: true, count: .exact)
            .eq("handle", value: normalized)
            .execute()
        return (response.count ?? 0) == 0
    }

    /// Creates or updates the current user's profile row, then refreshes local state.
    /// This is the ONLY place a `profiles` row is created — client-side, after a valid
    /// handle is chosen (no null-handle rows, no auto-create trigger).
    func saveProfile(handle: String, displayName: String) async throws {
        let client = try requireClient()
        guard let userID = client.auth.currentUser?.id else {
            throw AuthError.notSignedIn
        }
        let payload = ProfileUpsert(
            id: userID,
            handle: HandleRules.normalize(handle),
            displayName: displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        )
        try await client.from("profiles").upsert(payload).execute()
        await refreshProfile()
    }

    // MARK: - Internal

    private func requireClient() throws -> SupabaseClient {
        guard let client else { throw AuthError.notConfigured }
        return client
    }

    private func handle(event: AuthChangeEvent, session: Session?) async {
        guard session != nil else {
            status = .signedOut
            profile = nil
            isRestoring = false
            return
        }
        // Signed in — resolve whether a profile exists to land in the right state.
        // Clear `isRestoring` only AFTER status is resolved: refreshProfile() does a
        // network round-trip, and if we cleared it first, status would still read the
        // default `.signedOut` during that ~1s window — long enough for Settings to
        // offer "Sign in", the user to open the sheet, and the resolved session to then
        // auto-dismiss it out from under them.
        await refreshProfile()
        isRestoring = false
    }

    /// Loads the current user's profile row and moves the status machine accordingly.
    ///
    /// Distinguishes "row genuinely absent" (empty result → `.signedInNoProfile`) from
    /// "request failed" (a thrown error). On failure we do NOT wipe a known profile —
    /// re-showing `ProfileSetupView` to an established user over a transient network
    /// blip risks an accidental rename. We only fall back to `.signedInNoProfile` when
    /// we never had a profile this session.
    private func refreshProfile() async {
        guard let client, let userID = client.auth.currentUser?.id else {
            status = .signedOut
            profile = nil
            return
        }
        do {
            let rows: [Profile] = try await client
                .from("profiles")
                .select()
                .eq("id", value: userID)
                .limit(1)
                .execute()
                .value
            if let row = rows.first {
                profile = row
                status = .signedInWithProfile
            } else {
                // Genuinely no row yet.
                profile = nil
                status = .signedInNoProfile
            }
        } catch {
            // Request failed. Keep whatever we already knew; only default to the
            // no-profile gate if we've never resolved a profile this session.
            if profile == nil { status = .signedInNoProfile }
        }
    }
}

/// Insert/update shape for the `profiles` table (subset the client is allowed to write;
/// `created_at` is server-defaulted).
private struct ProfileUpsert: Encodable {
    let id: UUID
    let handle: String
    let displayName: String

    enum CodingKeys: String, CodingKey {
        case id, handle
        case displayName = "display_name"
    }
}

enum AuthError: LocalizedError {
    case notConfigured
    case notSignedIn
    case appleSignInUnavailable

    var errorDescription: String? {
        switch self {
        case .notConfigured:
            return "Sign-in isn't set up in this build — see docs/social-accounts-login-SETUP.md."
        case .notSignedIn:
            return "You need to be signed in to do that."
        case .appleSignInUnavailable:
            return "Sign in with Apple isn't available yet."
        }
    }
}
