// App-Settings (in der Zepp-Handy-App): Pairing-Code eingeben. Der Code wird gespeichert;
// der App-Side-Service löst ihn beim nächsten Upload gegen ein Device-Token ein
// (POST /api/devices/pair). View/Text/TextInput/Button sind Settings-Runtime-Globals.
//
// VERIFY im Simulator/Zepp-App: Settings-Widget-API (evtl. Prop-Namen leicht abweichend).

AppSettingsPage({
  build(props) {
    const store = props.settingsStorage;
    const token = store.getItem("deviceToken");
    const code = store.getItem("pairCode") || "";

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
          onClick: () => { store.setItem("deviceToken", ""); },
        }),
      ]);
    }

    return View({ style: { padding: "16px" } }, [
      header,
      Text({ paragraph: true, style: { marginBottom: "8px" } },
        "Auf pumpfoil.org → Konto einen Pairing-Code erzeugen und hier eintragen:"),
      TextInput({
        label: "Pairing-Code",
        value: code,
        onChange: (v) => { store.setItem("pairCode", v); },
      }),
      Text({ paragraph: true, style: { fontSize: "12px", color: "#888", marginTop: "8px" } },
        "Nach dem Speichern verbindet sich die Uhr beim nächsten Upload automatisch."),
    ]);
  },
});
