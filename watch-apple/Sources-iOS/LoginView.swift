import SwiftUI
import AuthenticationServices

private let LANG_LABEL: [String: String] = [
    "de": "Deutsch", "gsw": "Schwiizerdütsch", "de-AT": "Österreichisch",
    "en": "English", "fr": "Français", "it": "Italiano", "es": "Español",
]

// Gebrandeter Login: Hintergrundbild + Scrim + Card. Reihenfolge wie die PWA:
// Wortmarke · Untertitel · E-Mail · Passwort · [Name] · Fehler · Anmelden ·
// Passwort vergessen · Umschalten · oder · Apple · Sprache · Impressum.
struct LoginView: View {
    @EnvironmentObject var session: SessionStore
    @AppStorage("appLang") private var lang = "de"
    @State private var email = ""
    @State private var password = ""
    @State private var name = ""
    @State private var register = false
    @State private var busy = false
    @State private var error: String?
    @State private var resetMsg: String?

    var body: some View {
        NavigationStack {
            ZStack {
                Image("LoginBg").resizable().scaledToFill().ignoresSafeArea()
                Color(red: 0.008, green: 0.024, blue: 0.09).opacity(0.8).ignoresSafeArea()   // Navy-Scrim

                ScrollView {
                    VStack(spacing: 12) {
                        Image("LaunchLogo").resizable().scaledToFit().frame(height: 72)
                        Text(Loc.t(register ? "login.createAccount" : "login.welcomeBack", lang))
                            .font(.subheadline).foregroundStyle(.secondary)

                        TextField(Loc.t("login.email", lang), text: $email)
                            .keyboardType(.emailAddress).textContentType(.username)
                            .textInputAutocapitalization(.never).autocorrectionDisabled()
                            .textFieldStyle(.roundedBorder)
                        SecureField(Loc.t(register ? "login.passwordReg" : "login.password", lang), text: $password)
                            .textContentType(register ? .newPassword : .password)
                            .textFieldStyle(.roundedBorder)
                        if register {
                            TextField(Loc.t("login.displayName", lang), text: $name)
                                .textInputAutocapitalization(.words).textFieldStyle(.roundedBorder)
                        }
                        if let error { Text(error).foregroundStyle(.red).font(.footnote) }
                        if let resetMsg { Text(resetMsg).foregroundStyle(Color.accentColor).font(.footnote) }

                        Button(action: { Task { await submit() } }) {
                            HStack { Spacer()
                                if busy { ProgressView() } else { Text(Loc.t(register ? "login.create" : "login.signin", lang)).bold() }
                                Spacer() }
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(busy || email.isEmpty || password.isEmpty)

                        if !register {
                            Button(Loc.t("login.forgot", lang)) {
                                error = nil; resetMsg = nil
                                if email.isEmpty { error = Loc.t("login.enterEmail", lang) }
                                else { Task { try? await Api.forgotPassword(email.trimmingCharacters(in: .whitespaces)) }; resetMsg = Loc.t("login.resetSent", lang) }
                            }.font(.footnote)
                        }
                        Button(Loc.t(register ? "login.toLogin" : "login.toRegister", lang)) {
                            register.toggle(); error = nil; resetMsg = nil
                        }.font(.footnote)

                        Text(Loc.t("login.or", lang)).font(.footnote).foregroundStyle(.secondary)
                        SignInWithAppleButton(.signIn,
                            onRequest: { $0.requestedScopes = [.fullName, .email] },
                            onCompletion: handleApple)
                            .signInWithAppleButtonStyle(.black).frame(height: 44).disabled(busy)

                        HStack {
                            Menu {
                                ForEach(Loc.langs, id: \.self) { l in
                                    Button(LANG_LABEL[l] ?? l) { lang = l }
                                }
                            } label: {
                                Label(LANG_LABEL[lang] ?? "Deutsch", systemImage: "globe").font(.footnote)
                            }
                            Spacer()
                            NavigationLink(Loc.t("nav.imprint", lang)) { ImpressumView() }.font(.footnote)
                        }
                        .padding(.top, 4)
                    }
                    .padding(20)
                    .background(Color(.systemBackground).opacity(0.96), in: RoundedRectangle(cornerRadius: 20))
                    .frame(maxWidth: 420)
                    .padding()
                }
            }
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
        busy = true; error = nil; resetMsg = nil
        do {
            if register { try await session.register(email: email, password: password, name: name) }
            else { try await session.login(email: email, password: password) }
        } catch { self.error = error.localizedDescription }
        busy = false
    }
}
