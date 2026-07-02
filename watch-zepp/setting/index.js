// App-Settings (in der Zepp-Handy-App). PAIRING = REVERSE: die Uhr zeigt den Code an, er wird auf
// pumpfoil.org → Konto → „Uhr verbinden" eingetragen. HIER gibt es KEINE Code-Eingabe — nur
// Verbindungsstatus + „Trennen". (Web erzeugt keinen Code; siehe garmin-settings-pairing-Konvention.)
//
// VERIFY im Simulator/Zepp-App: Settings-Widget-API (evtl. Prop-Namen leicht abweichend).

AppSettingsPage({
  build() {
    return View({ style: { padding: "16px" } }, [
      Text({ bold: true, paragraph: true, style: { fontSize: "20px", marginBottom: "10px" } },
        "Pumpfoil — Verbindung"),
      Text({ paragraph: true, style: { marginBottom: "8px" } },
        "Verbinden passiert auf der Uhr: die App zeigt einen Code an."),
      Text({ paragraph: true, style: { marginBottom: "8px" } },
        "Diesen Code auf pumpfoil.org, Konto, Uhr verbinden eintragen. Die Uhr verbindet sich dann automatisch."),
      Text({ paragraph: true, style: { fontSize: "12px", color: "#888", marginTop: "8px" } },
        "Trennen/neu verbinden: in der Uhr-App den Titel antippen."),
    ]);
  },
});
