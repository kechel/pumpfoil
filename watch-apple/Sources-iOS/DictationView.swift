import SwiftUI
import Speech
import AVFoundation

// App-Sprache -> Locale für die Spracherkennung (AT/CH-Varianten wie im Web).
private func speechLocale(_ lang: String) -> Locale {
    switch lang {
    case "gsw": return Locale(identifier: "de-CH")
    case "de-AT": return Locale(identifier: "de-AT")
    case "de": return Locale(identifier: "de-DE")
    case "en": return Locale(identifier: "en-US")
    case "fr": return Locale(identifier: "fr-FR")
    case "it": return Locale(identifier: "it-IT")
    case "es": return Locale(identifier: "es-ES")
    default: return Locale(identifier: "de-DE")
    }
}

// Live-Diktat via SFSpeechRecognizer + AVAudioEngine.
@MainActor final class SpeechDictator: ObservableObject {
    @Published var transcript = ""
    @Published var listening = false
    @Published var denied = false

    private var recognizer: SFSpeechRecognizer?
    private let engine = AVAudioEngine()
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?

    func start(lang: String) {
        transcript = ""
        recognizer = SFSpeechRecognizer(locale: speechLocale(lang))
        SFSpeechRecognizer.requestAuthorization { status in
            Task { @MainActor in
                guard status == .authorized else { self.denied = true; return }
                // iOS 16-kompatibel (AVAudioApplication.requestRecordPermission ist erst 17+).
                AVAudioSession.sharedInstance().requestRecordPermission { ok in
                    Task { @MainActor in
                        if ok { self.beginAudio() } else { self.denied = true }
                    }
                }
            }
        }
    }

    private func beginAudio() {
        guard let recognizer, recognizer.isAvailable else { denied = true; return }
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.record, mode: .measurement, options: .duckOthers)
            try session.setActive(true, options: .notifyOthersOnDeactivation)
        } catch { denied = true; return }

        let req = SFSpeechAudioBufferRecognitionRequest()
        req.shouldReportPartialResults = true
        request = req
        let node = engine.inputNode
        let format = node.outputFormat(forBus: 0)
        node.removeTap(onBus: 0)
        node.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buf, _ in
            self?.request?.append(buf)
        }
        engine.prepare()
        do { try engine.start() } catch { denied = true; return }
        listening = true
        task = recognizer.recognitionTask(with: req) { [weak self] result, error in
            guard let self else { return }
            if let result { Task { @MainActor in self.transcript = result.bestTranscription.formattedString } }
            if error != nil || (result?.isFinal ?? false) { Task { @MainActor in self.finishAudio() } }
        }
    }

    private func finishAudio() {
        engine.inputNode.removeTap(onBus: 0)
        if engine.isRunning { engine.stop() }
        request?.endAudio()
        listening = false
    }

    func stop() {
        finishAudio()
        task?.cancel(); task = nil; request = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}

// Vollbild-Diktat (weiche Farben, Diktattext fett + brand-blau). Spiegelt web MicButton.
struct DictationView: View {
    let existing: String
    let title: String
    let lang: String
    let onResult: (String, Bool) -> Void   // (text, send)
    @Environment(\.dismiss) private var dismiss
    @StateObject private var dict = SpeechDictator()

    var body: some View {
        VStack(spacing: 20) {
            VStack(spacing: 4) {
                Text(title).font(.headline).foregroundStyle(.secondary)
                Text(dict.listening ? Loc.t("dict.listening", lang) : " ").font(.subheadline).foregroundStyle(Color.accentColor)
            }
            .padding(.top, 24)

            Spacer()
            ScrollView {
                VStack(spacing: 10) {
                    if !existing.isEmpty {
                        Text(existing).font(.title3).foregroundStyle(.secondary.opacity(0.6))
                    }
                    if dict.denied {
                        Text(Loc.t("dict.permDenied", lang)).foregroundStyle(.red)
                    } else {
                        Text(dict.transcript.isEmpty ? "…" : dict.transcript)
                            .font(.title.bold()).foregroundStyle(Color.accentColor)
                            .multilineTextAlignment(.center)
                    }
                }
                .frame(maxWidth: .infinity)
            }
            Spacer()

            HStack(spacing: 6) {
                dictButton("xmark", Loc.t("common.cancel", lang)) { dict.stop(); dismiss() }
                dictButton("arrow.clockwise", Loc.t("dict.retry", lang)) { dict.stop(); dict.start(lang: lang) }
                dictButton("pencil", Loc.t("dict.edit", lang), enabled: !dict.transcript.isEmpty) {
                    dict.stop(); onResult(dict.transcript, false); dismiss()
                }
                dictButton("paperplane.fill", Loc.t("chat.send", lang), enabled: !dict.transcript.isEmpty, tint: .accentColor) {
                    dict.stop(); onResult(dict.transcript, true); dismiss()
                }
            }
            .padding(.bottom, 24)
        }
        .padding(.horizontal, 20)
        .task { dict.start(lang: lang) }
        .onDisappear { dict.stop() }
    }

    @ViewBuilder private func dictButton(_ icon: String, _ label: String, enabled: Bool = true, tint: Color = .secondary, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 4) {
                Image(systemName: icon).font(.title3)
                Text(label).font(.caption2)
            }
            .frame(maxWidth: .infinity)
            .foregroundStyle(enabled ? tint : Color.secondary.opacity(0.4))
        }
        .disabled(!enabled)
    }
}
