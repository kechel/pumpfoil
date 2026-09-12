import SwiftUI
import UIKit
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
    @Environment(\.colorScheme) private var farbschema
    @State private var anbieter: [Api.OAuthProvider] = []
    // Haelt die Browser-Sitzung am Leben: laeuft die Variable aus dem Gueltigkeitsbereich,
    // schliesst iOS das Fenster sofort wieder.
    @State private var webSitzung: ASWebAuthenticationSession?
    @State private var ankerFenster = AuthAnker()

    // Der Body war EIN Ausdruck mit 13 Geschwistern im VStack (71 Zeilen) und stand mit >500 ms im
    // Build-Log: Swifts Type-Checker loest einen ViewBuilder als einen einzigen Ausdruck auf, und der
    // Aufwand waechst ueberproportional mit Kindern, Modifiern und Ternaries. Jeder Abschnitt unten
    // ist ein eigener, explizit typisierter Ausdruck; verschachtelte TupleViews flacht der VStack
    // genauso ab -> Layout, Reihenfolge und Abstaende bleiben identisch.
    var body: some View {
        NavigationStack {
            ZStack {
                background
                ScrollView { card }
            }
            // Anbieterliste holen. Faellt der Aufruf aus, bleibt die Liste leer und es fehlt
            // nur ein Knopf — die Anmeldung per E-Mail und Apple laeuft unveraendert.
            .task { anbieter = await Api.oauthProviders() }
        }
    }

    @ViewBuilder private var background: some View {
        Image("LoginBg").resizable().scaledToFill().ignoresSafeArea()
        Color(red: 0.008, green: 0.024, blue: 0.09).opacity(0.8).ignoresSafeArea()   // Navy-Scrim
    }

    private var card: some View {
        VStack(spacing: 12) {
            header
            credentialFields
            messages
            actions
            appleBlock
            footerRow
        }
        .padding(20)
        .background(Color(.systemBackground).opacity(0.96), in: RoundedRectangle(cornerRadius: 20))
        .frame(maxWidth: 420)
        .padding()
    }

    @ViewBuilder private var header: some View {
        Image("LaunchLogo").resizable().scaledToFit().frame(height: 72)
        Text(subtitleText)
            .font(.subheadline).foregroundStyle(.secondary)
    }

    @ViewBuilder private var credentialFields: some View {
        TextField(Loc.t("login.email", lang), text: $email)
            .keyboardType(.emailAddress).textContentType(.username)
            .textInputAutocapitalization(.never).autocorrectionDisabled()
            .textFieldStyle(.roundedBorder)
        SecureField(passwordLabel, text: $password)
            .textContentType(passwordContentType)
            .textFieldStyle(.roundedBorder)
        if register {
            TextField(Loc.t("login.displayName", lang), text: $name)
                .textInputAutocapitalization(.words).textFieldStyle(.roundedBorder)
        }
    }

    @ViewBuilder private var messages: some View {
        if let error { Text(error).foregroundStyle(.red).font(.footnote) }
        if let resetMsg { Text(resetMsg).foregroundStyle(Color.accentColor).font(.footnote) }
    }

    @ViewBuilder private var actions: some View {
        submitButton
        if !register {
            Button(Loc.t("login.forgot", lang)) { requestReset() }.font(.footnote)
        }
        Button(toggleLabel) { toggleMode() }.font(.footnote)
    }

    private var submitButton: some View {
        Button(action: { Task { await submit() } }) {
            HStack { Spacer()
                submitBusyOrLabel
                Spacer() }
        }
        .buttonStyle(.borderedProminent)
        .disabled(busy || email.isEmpty || password.isEmpty)
    }

    @ViewBuilder private var submitBusyOrLabel: some View {
        if busy { ProgressView() } else { Text(submitLabel).bold() }
    }

    @ViewBuilder private var appleBlock: some View {
        Text(Loc.t("login.or", lang)).font(.footnote).foregroundStyle(.secondary)
        SignInWithAppleButton(.signIn,
            onRequest: { $0.requestedScopes = [.fullName, .email] },
            onCompletion: handleApple)
            // Apples Vorgabe waehlt die Fassung nach dem KONTRAST zum Hintergrund, nicht nach
            // dem Thema: „White Style: use this style on dark backgrounds", „Black Style: …
            // don't use it on black or dark backgrounds." Die Karte hier ist
            // `Color(.systemBackground)`, kippt also mit dem Systemthema — der Knopf muss
            // mitkippen, sonst steht im Dunkelmodus Schwarz auf Schwarz.
            .signInWithAppleButtonStyle(farbschema == .dark ? .white : .black)
            .frame(height: 44).disabled(busy)
        anbieterBlock
    }

    /// Weitere Anbieter (Facebook & Co.) ueber den SYSTEMBROWSER — kein fremdes SDK in der App,
    /// also auch keine App-Ereignisse an Meta. Google und Apple fallen raus: Apple hat hier
    /// seinen nativen Knopf, Google gehoert auf iOS nicht in die Reihe.
    ///
    /// Was der Server ausblendet (OAUTH_<P>_HIDDEN), kommt gar nicht erst an — die Freischaltung
    /// nach Metas Freigabe braucht deshalb KEIN neues App-Release.
    @ViewBuilder private var anbieterBlock: some View {
        ForEach(anbieter.filter { $0.id != "google" && $0.id != "apple" }, id: \.id) { p in
            if let hinweis = p.note {
                Text(hinweis).font(.footnote).foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
            Button {
                starteAnbieter(p.id)
            } label: {
                Text(Loc.t("login.continueWith", lang).replacingOccurrences(of: "{provider}", with: p.label))
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .tint(p.id == "facebook" ? Color(red: 0.094, green: 0.467, blue: 0.949) : .accentColor)
            .frame(height: 44)
            .disabled(busy)
        }
    }

    /// Anmeldung im Systembrowser oeffnen und auf den Ruecksprung warten.
    ///
    /// `ASWebAuthenticationSession` ist Apples eigener Weg dafuer: eigener Prozess, echte
    /// Adresszeile, und die Sitzung endet automatisch, sobald unser Schema aufgerufen wird.
    /// `prefersEphemeralWebBrowserSession` bleibt AUS — sonst waere eine schon bestehende
    /// Facebook-Sitzung im Browser nutzlos und der Mensch muesste sein Passwort tippen.
    private func starteAnbieter(_ id: String) {
        error = nil
        let roh = Api.baseURL + "/api/auth/oauth/" + id + "/start?app=1&lang="
        let url = URL(string: roh + (lang.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? lang))
        guard let url else { return }
        let sitzung = ASWebAuthenticationSession(url: url, callbackURLScheme: "pumpfoil") { rueck, _ in
            // Das Token steht im FRAGMENT (…#token=…), nicht in der Query — so wie im Web.
            guard let rueck,
                  let frag = URLComponents(url: rueck, resolvingAgainstBaseURL: false)?.fragment
            else { return }
            let token = frag.split(separator: "&")
                .first { $0.hasPrefix("token=") }
                .map { String($0.dropFirst("token=".count)) }?
                .removingPercentEncoding
            guard let token, !token.isEmpty else { return }
            Task { await session.browserAuth(token: token) }
        }
        sitzung.presentationContextProvider = ankerFenster
        sitzung.start()
        webSitzung = sitzung
    }

    private var footerRow: some View {
        HStack {
            langMenu
            Spacer()
            NavigationLink(Loc.t("nav.imprint", lang)) { ImpressumView() }.font(.footnote)
        }
        .padding(.top, 4)
    }

    private var langMenu: some View {
        Menu {
            ForEach(Loc.langs, id: \.self) { l in
                Button(LANG_LABEL[l] ?? l) { lang = l }
            }
        } label: {
            Label(langMenuLabel, systemImage: "globe").font(.footnote)
        }
    }

    // Texte/Werte vorab typisiert: Ternaries und Wörterbuch-Zugriffe im ViewBuilder muss der
    // Type-Checker sonst gegen alle Überladungen prüfen.
    private var subtitleText: String {
        Loc.t(register ? "login.createAccount" : "login.welcomeBack", lang)
    }
    private var passwordLabel: String {
        Loc.t(register ? "login.passwordReg" : "login.password", lang)
    }
    private var submitLabel: String {
        Loc.t(register ? "login.create" : "login.signin", lang)
    }
    private var toggleLabel: String {
        Loc.t(register ? "login.toLogin" : "login.toRegister", lang)
    }
    private var langMenuLabel: String {
        LANG_LABEL[lang] ?? "Deutsch"
    }
    private var passwordContentType: UITextContentType {
        register ? .newPassword : .password
    }

    // Ablauflogik als Methoden statt als Closures im ViewBuilder.
    private func requestReset() {
        error = nil; resetMsg = nil
        if email.isEmpty { error = Loc.t("login.enterEmail", lang) }
        else { Task { try? await Api.forgotPassword(email.trimmingCharacters(in: .whitespaces)) }; resetMsg = Loc.t("login.resetSent", lang) }
    }

    private func toggleMode() {
        register.toggle(); error = nil; resetMsg = nil
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


/// Fenster-Anker fuer `ASWebAuthenticationSession`. iOS verlangt einen Presentation-Context;
/// ohne ihn startet die Sitzung nicht. Eigene kleine Klasse, weil das Protokoll von NSObject
/// erben muss und eine SwiftUI-View das nicht kann.
final class AuthAnker: NSObject, ASWebAuthenticationPresentationContextProviding {
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes
            .compactMap { ($0 as? UIWindowScene)?.keyWindow }
            .first ?? ASPresentationAnchor()
    }
}
