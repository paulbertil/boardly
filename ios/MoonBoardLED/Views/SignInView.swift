import SwiftUI

/// Sign-in sheet: email 6-digit code + Google. (Sign in with Apple is deferred until
/// paid Apple Developer enrollment — see `AuthManager.signInWithApple`.)
///
/// Email uses a typed one-time code rather than a tappable magic link: a link depends on
/// Safari redirecting into the app's custom URL scheme, which mobile Safari blocks
/// (about:blank) without Universal Links. A code has no redirect and works on device and
/// Simulator alike. Presented from the Account section of Settings; dismissing it leaves
/// the app fully usable signed-out.
struct SignInView: View {
    @EnvironmentObject private var auth: AuthManager
    @Environment(\.dismiss) private var dismiss

    @State private var email = ""
    @State private var code = ""
    @State private var codeSent = false
    @State private var isWorking = false
    @State private var errorMessage: String?

    private var emailLooksValid: Bool {
        let trimmed = email.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.contains("@") && trimmed.contains(".")
    }

    private var codeLooksValid: Bool {
        code.trimmingCharacters(in: .whitespacesAndNewlines).count >= 6
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("Sign in to sync your profile across devices and unlock social features. You can keep using the app without an account.")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }

                if !auth.isConfigured {
                    Section {
                        Label {
                            Text("Sign-in isn't set up in this build. See docs/social-accounts-login-SETUP.md.")
                        } icon: {
                            Image(systemName: "exclamationmark.triangle")
                                .foregroundStyle(.orange)
                        }
                    }
                } else if codeSent {
                    Section("Enter code") {
                        Text("We emailed a 6-digit code to \(email). Enter it below.")
                            .font(.callout)
                            .foregroundStyle(.secondary)
                        OTPCodeField(code: $code) {
                            Task { await verifyCode() }
                        }
                        .padding(.vertical, 4)
                        Button {
                            Task { await verifyCode() }
                        } label: {
                            HStack {
                                Text("Verify & sign in")
                                Spacer()
                                if isWorking { ProgressView() }
                            }
                        }
                        .disabled(!codeLooksValid || isWorking)
                        Button("Use a different email") {
                            codeSent = false
                            code = ""
                            errorMessage = nil
                        }
                        .foregroundStyle(.secondary)
                    }
                } else {
                    Section("Email a sign-in code") {
                        TextField("you@example.com", text: $email)
                            .textContentType(.emailAddress)
                            .keyboardType(.emailAddress)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                        Button {
                            Task { await sendCode() }
                        } label: {
                            HStack {
                                Text("Email me a code")
                                Spacer()
                                if isWorking { ProgressView() }
                            }
                        }
                        .disabled(!emailLooksValid || isWorking)
                    }
                }

                Section {
                    Button {
                        Task { await signInWithGoogle() }
                    } label: {
                        Label("Continue with Google", systemImage: "globe")
                    }
                    .disabled(isWorking || !auth.isConfigured)
                } footer: {
                    if let errorMessage {
                        Text(errorMessage).foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle("Sign In")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            // Closing on a successful sign-in (and swapping to profile setup for a
            // brand-new account) is driven by SettingsView, the single owner of this
            // sheet's lifecycle — so there's exactly one writer of its presentation
            // state and no swap/dismiss race.
        }
    }

    private func sendCode() async {
        errorMessage = nil
        isWorking = true
        defer { isWorking = false }
        do {
            try await auth.sendEmailCode(email: email)
            codeSent = true
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func verifyCode() async {
        guard !isWorking else { return }
        errorMessage = nil
        isWorking = true
        defer { isWorking = false }
        do {
            try await auth.verifyEmailCode(email: email, code: code)
            // Success advances auth.status; SettingsView reacts to that transition and
            // closes this sheet (swapping to profile setup for a new account).
        } catch {
            errorMessage = "That code didn't work. Check it and try again, or request a new one."
        }
    }

    private func signInWithGoogle() async {
        errorMessage = nil
        isWorking = true
        defer { isWorking = false }
        do {
            try await auth.signInWithGoogle()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
