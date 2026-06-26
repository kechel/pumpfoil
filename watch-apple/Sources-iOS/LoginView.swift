import SwiftUI
import AuthenticationServices

// Native Login-Maske (Form): E-Mail Login/Register + „Sign in with Apple".
struct LoginView: View {
    @EnvironmentObject var session: SessionStore
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
                    TextField("E-Mail", text: $email)
                        .keyboardType(.emailAddress)
                        .textContentType(.username)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    SecureField(register ? "Passwort (min. 8 Zeichen)" : "Passwort", text: $password)
                        .textContentType(register ? .newPassword : .password)
                    if register {
                        TextField("Anzeigename (optional)", text: $name)
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
                            if busy { ProgressView() } else { Text(register ? "Konto erstellen" : "Anmelden").bold() }
                            Spacer()
                        }
                    }
                    .disabled(busy || email.isEmpty || password.isEmpty)
                    Button(register ? "Schon ein Konto? Anmelden" : "Noch kein Konto? Registrieren") {
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
