// App-Settings (in der Zepp-Handy-App). PAIRING = REVERSE: die Uhr zeigt den Code an, er wird auf
// pumpfoil.org → Konto → „Uhr verbinden" eingetragen. HIER gibt es KEINE Code-Eingabe — nur
// Verbindungsstatus + „Trennen". (Web erzeugt keinen Code; siehe garmin-settings-pairing-Konvention.)
//
// VERIFY im Simulator/Zepp-App: Settings-Widget-API (evtl. Prop-Namen leicht abweichend).

AppSettingsPage({
  build(props) {
    const store = props.settingsStorage;
    const token = store.getItem("deviceToken");

    const header = Text(
      { bold: true, paragraph: true, style: { fontSize: "20px", marginBottom: "10px" } },
      "Pumpfoil — Verbindung",
    );

    if (token) {
      return View({ style: { padding: "16px" } }, [
        header,
        Text({ style: { color: "#16a34a", marginBottom: "10px" } }, "Verbunden ✓"),
        Button({
          label: "Trennen",
          style: { background: "#ef4444", color: "#fff" },
          onClick: () => { store.setItem("deviceToken", ""); store.setItem("claimToken", ""); },
        }),
      ]);
    }

    return View({ style: { padding: "16px" } }, [
      header,
      Text({ paragraph: true, style: { marginBottom: "8px" } },
        "Zum Verbinden: die Uhr-App öffnen — sie zeigt einen Code an."),
      Text({ paragraph: true, style: { marginBottom: "8px" } },
        "Diesen Code auf pumpfoil.org → Konto → „Uhr verbinden" eintragen. Die Uhr verbindet sich dann automatisch."),
    ]);
  },
});
