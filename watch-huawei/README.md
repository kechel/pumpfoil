# Pumpfoil-Recorder fuer HUAWEI-Uhren

Stand 07.10.2026: gebaut auf der VM ohne Uhr, **noch nie auf echter Hardware gelaufen**.
Recherche, Risiken und Quellen: [`docs/HUAWEI.md`](../docs/HUAWEI.md).

## Aufbau

```
common/      Quelle fuer beide Projekte (in Node getestet: node --test test/)
  kern.js      Chunks, Binaerformat, Pausen-Zeitachse, Sendeplan, Warteschlange — ohne Geraete-APIs
  recorder.js  Sensoren, GPS, Dateien, Wear Engine (@system.* — auf beiden SDK-Linien vorhanden)
  konfig.js    Paketname + Fingerabdruck der Android-App, App-Version
lite/        DevEco-Projekt fuer Lite Wearables: Watch GT 4/5 (+Pro), Fit 3/4, D2, Ultimate
wearable/    (folgt) DevEco-Projekt fuer Watch 3/4 (HarmonyOS 2-4, JS-FA)
test/        Node-Tests
sync-common.sh  kopiert common/ in die Projekte — nach JEDER Aenderung an common/ ausfuehren
```

Weg der Daten: Uhr nimmt auf → schreibt Chunk-Dateien im normalen Upload-Format
(docs/ingest-contract.md) → schickt sie per Wear Engine ans Handy → die Pumpfoil-Android-App
laedt sie hoch. Die Uhr hat fuer Fremd-Apps kein eigenes Netz (docs/HUAWEI.md).

Was die Uhr NICHT liefert und wie damit umgegangen wird:
- **kein Zeitstempel je Sensorwert** → `t0_ms` je Block = Ankunft; der Server misst die Rate.
- **keine GPS-Geschwindigkeit** → `speed = -1`, der Server rechnet aus den Positionen.
- **Display aus nicht beeinflussbar** → `setKeepScreenOn` waehrend der Aufnahme; ob es dunkel
  weiterlaeuft, zeigt die Abdeckung je Session am Server (`scripts/messweg-pruefen.py`).

## Was Jan eintragen muss (Platzhalter `..._EINTRAGEN`)

| Was | Wo |
|---|---|
| Bundle-Name der Uhren-App (Vorschlag `org.pumpfoil.huawei`) | `lite/entry/src/main/config.json` → `app.bundleName` |
| SHA-256 des Signierschluessels der Android-App (bei Play App Signing: Googles Schluessel) | `common/konfig.js` → `PHONE_FP` **und** `config.json` → `supportLists` (`org.pumpfoil.app:<fingerprint>`) |
| Signier-Konfiguration (Zertifikat, Profil `.p7b`) | DevEco → Project Structure → Signing Configs (landet in `build-profile.json5`, Dateien NICHT committen) |
| Wear-Engine-App-ID + Fingerabdruck der Uhren-App | Android-App (folgt im Android-Teil) |

## Bauen

DevEco Studio 6.x (macOS/Windows) → `watch-huawei/lite` oeffnen → Build HAP(s). Danach im
Build-Log die Bundle-Groesse ansehen: laut einem Forumsbericht scheitern Lite-Bundles ueber
~48 KB beim Installieren.

## Herkunft

- `lite/entry/src/main/js/MainAbility/wearengine/wearengine.js` — HUAWEI Wear Engine SDK
  (Lite Wearable 5.0.2.306), Apache License 2.0.
- Build-Dateien (`build-profile.json5`, `hvigor*`, `oh-package.json5`) nach dem Beispiel
  „sportwatch-wear-engine-lite-wearable-to-mobile" (Explore in HMOS Wearable, MIT).
