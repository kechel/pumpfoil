import SwiftUI

// Community-Stats-Satz mit fett/cyan hervorgehobenen Zahlen (§-markiert, wie im Web).
// Genutzt vom Home-Willkommens-Banner und der Community-Stats-Leiste.
func communityStatsText(_ s: Api.CommunityStats, _ lang: String) -> Text {
    let raw = Loc.t("banner.stats", lang)
        .replacingOccurrences(of: "{foilers}", with: "\(s.foilers)")
        .replacingOccurrences(of: "{spots}", with: "\(s.spots)")
        .replacingOccurrences(of: "{sessions}", with: "\(s.sessions)")
        .replacingOccurrences(of: "{pumps}", with: s.pumps.formatted())
    var out = Text("")
    for (i, part) in raw.components(separatedBy: "§").enumerated() {
        out = out + (i % 2 == 1 ? Text(part).bold().foregroundColor(.accentColor) : Text(part))
    }
    return out
}
