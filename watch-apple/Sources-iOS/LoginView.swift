import SwiftUI
import AuthenticationServices

// Native Login-Maske (Form): E-Mail Login/Register + „Sign in with Apple".
struct LoginView: View {
    @EnvironmentObject var session: SessionStore
    @AppStorage("appLang") private var lang = "de"
    @State private var email = ""
    @State private var password = ""
    @State private var name = ""
    @State private var register = false
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField(Loc.t("login.email", lang), text: $email)
                        .keyboardType(.emailAddress)
                        .textContentType(.username)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    SecureField(Loc.t(register ? "login.passwordReg" : "login.password", lang), text: $password)
                        .textContentType(register ? .newPassword : .password)
                    if register {
                        TextField(Loc.t("login.name", lang), text: $name)
                            .textInputAutocapitalization(.words)
                    }
                }
                if let error {
                    Text(error).foregroundStyle(.red).font(.footnote)
                }
                Section {
                    Button(action: { Task { await submit() } }) {
                        HStack {
                            Spacer()
                            if busy { ProgressView() } else { Text(Loc.t(register ? "login.create" : "login.signin", lang)).bold() }
                            Spacer()
                        }
                    }
                    .disabled(busy || email.isEmpty || password.isEmpty)
                    Button(Loc.t(register ? "login.toLogin" : "login.toRegister", lang)) {
                        register.toggle(); error = nil
                    }
                    .font(.footnote)
                }
                Section {
                    SignInWithAppleButton(.signIn,
                        onRequest: { $0.requestedScopes = [.fullName, .email] },
                        onCompletion: handleApple)
                        .signInWithAppleButtonStyle(.black)
                        .frame(height: 44)
                        .disabled(busy)
                }
            }
            .navigationTitle("Pumpfoil")
        }
    }

    private func handleApple(_ result: Result<ASAuthorization, Error>) {
        switch result {
        case .success(let auth):
            guard let cred = auth.credential as? ASAuthorizationAppleIDCredential,
                  let data = cred.identityToken, let token = String(data: data, encoding: .utf8) else {
                error = "Apple-Anmeldung fehlgeschlagen"; return
            }
            let name = cred.fullName?.givenName ?? ""
            Task {
                busy = true; error = nil
                do { try await session.appleNative(idToken: token, name: name) }
                catch { self.error = error.localizedDescription }
                busy = false
            }
        case .failure(let e):
            error = e.localizedDescription
        }
    }

    private func submit() async {
        busy = true; error = nil
        do {
            if register { try await session.register(email: email, password: password, name: name) }
            else { try await session.login(email: email, password: password) }
        } catch { self.error = error.localizedDescription }
        busy = false
    }
}
