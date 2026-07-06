import SwiftUI

// Netter App-Rating-Dialog (nur App): Sterne. >=4 -> echte App-Store-Bewertung (write-review);
// <=3 -> Feedback (wird ganz normal als Feedback gespeichert), kein Store-Rating.
// Trigger/Snooze-Logik in HomeView (>=5 gesyncte Sessions; Später/Feedback/Bewertet unterschiedlich).
struct RatingView: View {
    let lang: String
    var onLater: () -> Void
    var onRated: () -> Void
    var onFeedback: () -> Void

    @State private var stars = 0
    @State private var feedbackMode = false
    @State private var text = ""
    @State private var decided = false
    @Environment(\.openURL) private var openURL
    @Environment(\.dismiss) private var dismiss

    private let reviewURL = URL(string: "https://apps.apple.com/app/id6783975714?action=write-review")!

    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                if !feedbackMode {
                    Text(Loc.t("rating.title", lang)).font(.title2).bold()
                    Text(Loc.t("rating.subtitle", lang)).foregroundStyle(.secondary)
                    HStack(spacing: 8) {
                        ForEach(1...5, id: \.self) { i in
                            Button { pick(i) } label: {
                                Image(systemName: i <= stars ? "star.fill" : "star")
                                    .font(.largeTitle).foregroundStyle(Color.accentColor)
                            }.buttonStyle(.plain)
                        }
                    }
                } else {
                    Text(Loc.t("rating.feedbackTitle", lang)).font(.title2).bold()
                    Text(Loc.t("rating.feedbackHint", lang)).font(.caption).foregroundStyle(.secondary)
                    TextField(Loc.t("feedback.placeholder", lang), text: $text, axis: .vertical)
                        .textFieldStyle(.roundedBorder).lineLimit(3...6)
                    Button(Loc.t("rating.send", lang)) {
                        decided = true
                        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
                        if !t.isEmpty { Task { try? await Api.submitFeedback("[★\(stars)] \(t)") } }
                        onFeedback(); dismiss()
                    }.buttonStyle(.borderedProminent)
                }
                Button(Loc.t("rating.later", lang)) { decided = true; onLater(); dismiss() }
                    .buttonStyle(.plain).foregroundStyle(.secondary)
            }
            .padding(24)
            .presentationDetents([.medium])
            // Wegwischen = „Später".
            .onDisappear { if !decided { onLater() } }
        }
    }

    private func pick(_ i: Int) {
        stars = i
        if i >= 4 { decided = true; openURL(reviewURL); onRated(); dismiss() }
        else { feedbackMode = true }
    }
}
