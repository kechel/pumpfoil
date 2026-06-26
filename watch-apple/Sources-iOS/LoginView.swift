import SwiftUI

// Native Login-Maske (Form). OAuth/Registrierung folgen später.
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
            }
            .navigationTitle("Pumpfoil")
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
