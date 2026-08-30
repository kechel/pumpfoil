import SwiftUI
import UniformTypeIdentifiers

// Feedback-Sheet (wie das PWA-Feedback-Widget): kurzer Text an POST /api/feedback,
// dazu bis zu drei Anhaenge (Screenshot oder Log) an die eben erzeugte Meldung.
struct FeedbackView: View {
    let lang: String
    // Vorbelegter Text, z. B. „Deine Marke oder Größe fehlt im Katalog?" von den Katalog-Listen
    // (MissingHintRow) — wie das PWA-Widget, das per Event einen vorbelegten Text bekommt.
    var prefill: String = ""
    @Environment(\.dismiss) private var dismiss
    @State private var text = ""
    @State private var busy = false
    @State private var sent = false
    @State private var fehler = ""
    // Ausgewaehlte Dateien. Gehalten wird die URL, gelesen wird erst beim Senden — so liegen
    // keine Megabytes im Sheet-Zustand, wenn der Nutzer doch abbricht.
    @State private var dateien: [URL] = []
    @State private var waehler = false

    // Hoechstens drei Anhaenge — dieselbe Grenze wie im Server (MAX_ANHAENGE) und in der PWA.
    private let maxDateien = 3
    // Vorfilter der Dateiauswahl, deckungsgleich mit der Server-Weissliste (Bilder + Text/Logs).
    // `.plainText` deckt .txt/.log/.ips mit ab, wenn das Geraet keinen eigenen Typ dafuer kennt.
    private let typen: [UTType] = [.image, .plainText, .json, .commaSeparatedText, .xml, .yaml, .log]

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 12) {
                if sent {
                    Text(Loc.t("feedback.sent", lang)).foregroundStyle(Color.accentColor).padding(.top, 8)
                    Spacer()
                } else {
                    Text(Loc.t("feedback.intro", lang)).font(.subheadline).foregroundStyle(.secondary)
                    TextEditor(text: $text)
                        .frame(minHeight: 140)
                        .overlay(alignment: .topLeading) {
                            if text.isEmpty {
                                Text(Loc.t("feedback.placeholder", lang)).foregroundStyle(.secondary)
                                    .padding(.top, 8).padding(.leading, 5).allowsHitTesting(false)
                            }
                        }
                        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color(.separator)))
                    anhangBereich
                    Spacer()
                }
            }
            .padding()
            .onAppear { if text.isEmpty { text = prefill } }
            .navigationTitle(Loc.t("feedback.title", lang))
            .navigationBarTitleDisplayMode(.inline)
            .fileImporter(isPresented: $waehler, allowedContentTypes: typen, allowsMultipleSelection: true) { ergebnis in
                if case .success(let urls) = ergebnis {
                    dateien = Array((dateien + urls).prefix(maxDateien))
                }
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(Loc.t("common.cancel", lang)) { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    if sent {
                        Button("OK") { dismiss() }
                    } else {
                        Button(Loc.t("feedback.send", lang)) { senden() }
                            .disabled(busy || text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                }
            }
        }
    }

    /// Anhaenge: Bilder oder Logs. Die Auswahl filtert vor, die verbindliche Pruefung macht
    /// ohnehin der Server (Weissliste, hoechstens drei Dateien, Bilder werden neu kodiert).
    @ViewBuilder private var anhangBereich: some View {
        VStack(alignment: .leading, spacing: 4) {
            Button {
                waehler = true
            } label: {
                Text(Loc.t("feedback.attach", lang)).font(.subheadline)
            }
            .disabled(dateien.count >= maxDateien)

            ForEach(Array(dateien.enumerated()), id: \.offset) { i, u in
                HStack {
                    Text(u.lastPathComponent).font(.caption).lineLimit(1).foregroundStyle(.secondary)
                    Spacer()
                    Button("×") { dateien.remove(at: i) }.buttonStyle(.plain).foregroundStyle(.secondary)
                }
            }
            if !fehler.isEmpty {
                Text(fehler).font(.caption).foregroundStyle(.red)
            }
        }
    }

    private func senden() {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { return }
        busy = true
        fehler = ""
        Task {
            guard let id = try? await Api.submitFeedback(t) else { busy = false; return }
            // Ein fehlgeschlagener Anhang darf die Meldung selbst nicht entwerten — die ist
            // dann schon beim Server. Nur melden und weitermachen.
            for u in dateien {
                // Aus dem Datei-Dialog kommen Sicherheitsbereichs-URLs: ohne start…/stop…
                // liefert das Lesen nichts.
                let offen = u.startAccessingSecurityScopedResource()
                defer { if offen { u.stopAccessingSecurityScopedResource() } }
                guard id > 0, let d = try? Data(contentsOf: u) else {
                    fehler = Loc.t("feedback.attachFailed", lang); continue
                }
                let mime = UTType(filenameExtension: u.pathExtension)?.preferredMIMEType
                    ?? "application/octet-stream"
                do { try await Api.feedbackAttachment(id, data: d, filename: u.lastPathComponent, mime: mime) }
                catch { fehler = Loc.t("feedback.attachFailed", lang) }
            }
            sent = true
            busy = false
        }
    }
}
