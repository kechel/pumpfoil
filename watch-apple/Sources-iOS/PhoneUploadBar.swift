import SwiftUI

// Upload-Anzeige des HANDY-RECORDERS — sichtbar auf JEDEM Bildschirm, nicht nur im
// Aufnahme-Bildschirm. Portiert von `PhoneUploadBar.kt` (Android, 22.09.2026).
//
// Was auf iOS vorher fehlte: `drain()` lief zwar im eigenen Task weiter, angestossen wurde es
// aber NUR aus `RecordView` (dessen `.task` und zwei „Jetzt hochladen"-Knoepfe). Wer nach der
// Fahrt gleich auf „Verlauf" wechselte, sah nichts und stiess nichts an. Und zu sehen waren
// ohnehin nur `uploading`/`pendingCount` als Text, ohne Zahlen und ohne Balken.
//
// NICHT DASSELBE wie `UploadProgressCard` (Home + Sessions): die zeigt, was beim SERVER
// ankommt — auch von der Uhr. Diese hier zeigt, was das HANDY noch loswerden muss. Zwei
// verschiedene Fragen, auf Android stehen sie ebenso nebeneinander.
struct PhoneUploadBar: View {
    @ObservedObject private var rec = PhoneRecorder.shared
    @AppStorage("appLang") private var lang = "de"

    // Waehrend der Aufnahme nicht: dort fuehrt der Aufnahme-Bildschirm.
    private var versteckt: Bool {
        if rec.recording { return true }
        return rec.pendingCount == 0 && !rec.uploading
    }

    private var fehler: Bool { !rec.uploadError.isEmpty && !rec.uploading }

    private var anteil: Double? {
        guard rec.uploading, rec.uploadTotal > 0 else { return nil }
        return min(1.0, Double(rec.uploadSent) / Double(rec.uploadTotal))
    }

    private var stand: String {
        if let a = anteil {
            return "\(Int(a * 100)) % · \(rec.uploadSent)/\(rec.uploadTotal)"
        }
        if rec.uploading { return Loc.t("rec.upRunning", lang) }
        if rec.uploadError == "offline" { return Loc.t("rec.upOffline", lang) }
        if rec.uploadError == "server" || rec.uploadError == "auth" {
            return Loc.t("rec.upFailed", lang)
        }
        return Loc.t("rec.pending", lang)
            .replacingOccurrences(of: "{n}", with: "\(rec.pendingCount)")
    }

    var body: some View {
        if versteckt {
            EmptyView()
        } else {
            leiste
        }
    }

    private var leiste: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Image(systemName: "icloud.and.arrow.up").font(.subheadline)
                Text(Loc.t("upload.title", lang)).font(.subheadline).bold()
                Spacer()
                Text(stand).font(.subheadline)
                if !rec.uploading {
                    Text(Loc.t("rec.uploadNow", lang)).font(.subheadline).bold()
                }
            }
            // Balken nur mit bekannter Gesamtzahl — ein unbestimmter Balken, der sich nie
            // fuellt, sieht aus wie „haengt". Ohne Zahlen bleibt es bei der Textzeile.
            if let a = anteil { ProgressView(value: a).tint(.cyan) }
        }
        .foregroundColor(fehler ? .orange : .primary)
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(fehler ? Color.orange.opacity(0.12) : Color.cyan.opacity(0.12))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        // Antippen heisst „jetzt versuchen" — solange nichts laeuft. Waehrend des Uploads waere
        // ein zweiter Anstoss wirkungslos (`drain` haelt sich an `pendingCount` selbst ab).
        .onTapGesture { if !rec.uploading { Task { await rec.drain() } } }
    }
}
