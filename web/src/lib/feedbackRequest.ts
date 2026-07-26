// Aktuelle Feedback-Kampagne — NUR PWA (bewusst nicht in den Native-Apps; „rapid change", viel
// schneller als eine native Portierung, künftig öfter nutzbar). Der Banner oben (App.tsx) und die
// Seite /current-feedback-request teilen sich diese Config. `tag` wird dem eingereichten Feedback
// VORANGESTELLT, damit Jan es der Kampagne zuordnen kann.
//
// Neue Kampagne = einfach hier Werte ändern (tag/dismissKey/label-i18n-Key) + ggf. Video tauschen
// (Server-Route /demo/stop-screen.mp4 -> screenshots/watch/stop-screen-v1063.mp4) + `enabled: true`.
//
// `enabled: false` = KEIN Banner (Kampagne beendet/pausiert). Die Seite /current-feedback-request
// bleibt erreichbar (Infrastruktur + i18n stehen bereit) — nur der Anreißer oben ist weg. Für die
// nächste Runde: `enabled: true` + `dismissKey` bumpen (zeigt den Banner wieder allen) + `tag` anpassen.
export const CURRENT_FEEDBACK_REQUEST = {
  enabled: false,                    // Kampagne Garmin 1.0.63 beendet 2026-07-26
  path: "/current-feedback-request",
  dismissKey: "cfr_garmin_1063",     // pro Kampagne: bumpen, um den Banner wieder allen zu zeigen
  tag: "Feedback-Request: Garmin 1.0.63 Start/Stopp/Pause",
  labelKey: "cfr.banner",
};
