import SwiftUI
import SwiftData

@main
struct MoonBoardApp: App {
    @StateObject private var ble = MoonBoardBLEManager()
    @StateObject private var auth = AuthManager()

    var body: some Scene {
        WindowGroup {
            RootTabView()
                .environmentObject(ble)
                .environmentObject(auth)
                // Magic-link / OAuth redirects return through the app's custom URL
                // scheme; hand them to the auth manager to complete sign-in.
                .onOpenURL { url in
                    Task { await auth.handleCallback(url: url) }
                }
        }
        .modelContainer(for: [Problem.self, Ascent.self, FavoriteProblem.self])
    }
}
