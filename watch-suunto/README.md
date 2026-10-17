# Pumpfoil fuer Suunto (SuuntoPlus-Sport-App)

Plan, Protokoll und offene Hardware-Fragen: [`docs/SUUNTO.md`](../docs/SUUNTO.md).

| Pfad | Inhalt |
|---|---|
| `quelle/uhr.js` | Ablauf, Datenseiten, Log-Kanaele, Firmware-Rueckrufe |
| `quelle/pumpe.js` | Pump-Zaehler (Streaming-Fassung des Server-Zaehlers) |
| `quelle/funk.js` | Funk zur Handy-App (Ringpuffer, Quittungen, Wiederverbinden) |
| `vorlagen/d.html` | Datenseite (3 Felder, Belegung aus dem Profil) |
| `bau.mjs` | setzt `app/` zusammen, inkl. `watch-huawei/common/lauf.js` und Teilen von `seiten.js` |
| `app/` | **erzeugt** — das, was der SuuntoPlus Editor oeffnet |
| `test/` | Node-Tests: Pump-Zaehler gegen den Server, ganze Aufnahmen durch die echte `app/main.js` in einer nachgebauten Firmware (BLE mit Abbruechen) |

## Arbeiten

```sh
cd watch-suunto
node bau.mjs          # nach jeder Aenderung an quelle/, vorlagen/ oder watch-huawei/common/
node --test test/     # laeuft auch in der CI
```

## Auf die Uhr (Jan, Mac)

1. VS Code mit der Erweiterung „SuuntoPlus Editor" oeffnen, Ordner `watch-suunto/app/`.
2. Uhr per USB oder Bluetooth verbinden (vorher in der Uhr die Suunto-App-Kopplung vergessen,
   s. Referenz „Requirements"), „Deploy to watch".
3. In der Uhr einen Sportmodus (z. B. SUP) waehlen und unter SuuntoPlus „Pumpfoil" einschalten.
4. Fuer Rohdaten: Pumpfoil-Handy-App offen lassen (Bereich „Suunto-Uhr"), Handy in Reichweite.
5. Danach im Editor das Systemlog der Uhr ansehen (Speicher, BLE-Fehler `ERR BLE … err N`).
