import SwiftUI

// Feedback-Sheet (wie das PWA-Feedback-Widget): kurzer Text an POST /api/feedback.
struct FeedbackView: View {
    let lang: String
    @Environment(\.dismiss) private var dismiss
    @State private var text = ""
    @State private var busy = false
    @State private var sent = false

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
                    Spacer()
                }
            }
            .padding()
            .navigationTitle(Loc.t("feedback.title", lang))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(Loc.t("common.cancel", lang)) { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    if sent {
                        Button("OK") { dismiss() }
                    } else {
                        Button(Loc.t("feedback.send", lang)) {
                            let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
                            guard !t.isEmpty else { return }
                            busy = true
                            Task { try? await Api.submitFeedback(t); sent = true; busy = false }
                        }.disabled(busy || text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                }
            }
        }
    }
}
