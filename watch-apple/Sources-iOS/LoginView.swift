import SwiftUI

// Native Login-Maske (Form). OAuth/Registrierung folgen später.
struct LoginView: View {
    @EnvironmentObject var session: SessionStore
    @State private var email = ""
    @State private var password = ""
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
                    SecureField("Passwort", text: $password)
                        .textContentType(.password)
                }
                if let error {
                    Text(error).foregroundStyle(.red).font(.footnote)
                }
                Section {
                    Button(action: { Task { await doLogin() } }) {
                        HStack {
                            Spacer()
                            if busy { ProgressView() } else { Text("Anmelden").bold() }
                            Spacer()
                        }
                    }
                    .disabled(busy || email.isEmpty || password.isEmpty)
                } footer: {
                    Text("Konto anlegen auf pumpfoil.org")
                }
            }
            .navigationTitle("Pumpfoil")
        }
    }

    private func doLogin() async {
        busy = true; error = nil
        do { try await session.login(email: email, password: password) }
        catch { self.error = error.localizedDescription }
        busy = false
    }
}
