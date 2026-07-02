import Foundation
import Supabase

/// Builds the shared `SupabaseClient` from credentials injected at build time.
///
/// The Supabase host + anon key live in a gitignored `Supabase.xcconfig` (see
/// `Supabase.xcconfig.example`) which the target surfaces into Info.plist as the
/// `SUPABASE_HOST` / `SUPABASE_ANON_KEY` keys. Nothing is hardcoded here, and the
/// anon key is public-safe — it only grants what Row-Level Security allows.
///
/// If the values are missing (fresh clone before setup), we crash *loudly with an
/// actionable message* rather than limping along with a broken client — the app is
/// still fully usable signed-out, but wiring up auth requires real config.
enum SupabaseConfig {
    /// Custom URL scheme the OAuth / magic-link redirect returns to. Must match the
    /// URL Type registered on the target and the redirect URL allow-listed in the
    /// Supabase dashboard. Reverse-DNS to avoid collisions with other apps.
    static let redirectURL = URL(string: "com.bertil.moonboardled://auth-callback")!

    static var supabaseURL: URL {
        guard let host = infoValue("SUPABASE_HOST"), !host.isEmpty,
              let url = URL(string: "https://\(host)") else {
            fatalError(
                "Missing SUPABASE_HOST. Copy Supabase.xcconfig.example to " +
                "Supabase.xcconfig, fill it in, and wire it into the target — see " +
                "docs/social-accounts-login-SETUP.md."
            )
        }
        return url
    }

    static var anonKey: String {
        guard let key = infoValue("SUPABASE_ANON_KEY"), !key.isEmpty else {
            fatalError(
                "Missing SUPABASE_ANON_KEY. See docs/social-accounts-login-SETUP.md."
            )
        }
        return key
    }

    private static func infoValue(_ key: String) -> String? {
        Bundle.main.object(forInfoDictionaryKey: key) as? String
    }
}

/// Vends the process-wide `SupabaseClient`. One client per launch; the auth session
/// is persisted by the SDK across relaunches (Keychain-backed).
enum SupabaseClientProvider {
    static let shared: SupabaseClient = SupabaseClient(
        supabaseURL: SupabaseConfig.supabaseURL,
        supabaseKey: SupabaseConfig.anonKey
    )
}
