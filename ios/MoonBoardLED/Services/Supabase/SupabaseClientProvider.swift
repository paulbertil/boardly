import Foundation
import Supabase

/// Builds the shared `SupabaseClient` from credentials injected at build time.
///
/// The Supabase host + anon key live in a gitignored `Supabase.xcconfig` (see
/// `Supabase.xcconfig.example`) which the target surfaces into Info.plist as the
/// `SUPABASE_HOST` / `SUPABASE_ANON_KEY` keys. Nothing is hardcoded here, and the
/// anon key is public-safe — it only grants what Row-Level Security allows.
///
/// When the values are absent (a fresh clone before setup), the app must still launch
/// fully — the offline BLE / local-logbook experience never depends on auth. So config
/// access is *optional* and never crashes; auth simply stays unavailable until
/// `Supabase.xcconfig` is filled in (see docs/social-accounts-login-SETUP.md).
///
/// Note: the problem catalog is now server-distributed (it syncs from Supabase into a
/// local cache — see `CatalogSyncManager`), so unlike BLE/local-logbook it needs a
/// configured client and one network sync per board before it has data. Browsing a
/// board's catalog before that first sync shows an empty state, not bundled problems.
enum SupabaseConfig {
    /// Custom URL scheme the OAuth / magic-link redirect returns to. Must match the
    /// URL Type registered on the target and the redirect URL allow-listed in the
    /// Supabase dashboard. Reverse-DNS to avoid collisions with other apps.
    static let redirectURL = URL(string: "com.boardly://auth-callback")!

    /// Whether both credentials are present — the gate for enabling any auth UI.
    static var isConfigured: Bool { supabaseURL != nil && anonKey != nil }

    static var supabaseURL: URL? {
        guard let host = infoValue("SUPABASE_HOST"), !host.isEmpty else { return nil }
        return URL(string: "https://\(host)")
    }

    static var anonKey: String? {
        guard let key = infoValue("SUPABASE_ANON_KEY"), !key.isEmpty else { return nil }
        return key
    }

    private static func infoValue(_ key: String) -> String? {
        Bundle.main.object(forInfoDictionaryKey: key) as? String
    }
}

/// Vends the process-wide `SupabaseClient`, or `nil` when the app is unconfigured.
/// One client per launch; the auth session is persisted by the SDK across relaunches
/// (Keychain-backed).
enum SupabaseClientProvider {
    static let shared: SupabaseClient? = {
        guard let url = SupabaseConfig.supabaseURL, let key = SupabaseConfig.anonKey else {
            return nil
        }
        return SupabaseClient(supabaseURL: url, supabaseKey: key)
    }()
}
