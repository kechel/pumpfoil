# Watch-App (Connect IQ, Monkey C)

Pump-Foil-Recorder für Fenix 7X Pro Solar (+ 7 Pro / 7). Zeichnet GPS + rohe
Beschleunigung auf, zeigt 1–3 konfigurierbare Datenfelder, Vibrationsalarm bei
Speed-Schwellen, und lädt die Roh-Daten gechunkt auf den Server.

> **Status: kompiliert sauber** mit SDK 9.2.0 für fenix7xpro (warnungsfrei, gradual
> typecheck) → `bin/foil-fenix7xpro.prg`. Noch **nicht auf echter Hardware** getestet.
> Auf dem Gerät zu validieren: Speicher/RAM bei 25 Hz, reale Accel-Sample-Rate, Akku,
> Chunkgröße vs. BLE-Limit, und das tatsächliche Aufzeichnungs-/Upload-Verhalten.

## Toolchain-Setup

**SDK + Developer-Key (automatisiert):**
```bash
./setup-sdk.sh        # lädt aktuelles Linux-SDK direkt von Garmin + erzeugt Dev-Key
```
Das SDK (`monkeyc`/`monkeydo`, Java 21 nötig) ist öffentlich ladbar — kein Login nötig.

**Device-Files (einmalig, MANUELL — Garmin-Login erforderlich):**
Die geräte­spezifischen Compiler-Files (fenix 7X Pro etc.) liegen hinter Garmin-Auth
(`api.gcs.garmin.com` → 401; `monkeynet.garmin.com` nicht öffentlich auflösbar) und sind
**nicht headless ladbar**. Einmalig auf einem Rechner mit Display:
1. SDK-Manager starten (`connectiq-sdk-manager-linux.zip`; braucht `libsecret-1`),
2. mit Garmin-Account einloggen,
3. Gerät **„fenix 7X Pro"** herunterladen.
Die Files landen in `~/.Garmin/ConnectIQ/Devices/` und werden vom CLI-`monkeyc` gefunden.
(Alternativ den ganzen Ordner `~/.Garmin/ConnectIQ/Devices/fenix7xpro/` von einem
eingerichteten Rechner herüberkopieren.)

## Bauen & testen
```bash
SDK_HOME=$HOME/connectiq-sdk-9.2.0 ./build.sh fenix7xpro   # -> bin/foil-fenix7xpro.prg
$SDK_HOME/bin/monkeydo bin/foil-fenix7xpro.prg fenix7xpro  # Simulator
```

## Auf die echte Uhr (Sideload, ohne Store)
```bash
# Uhr per USB anschließen, dann:
cp bin/foil-fenix7xpro.prg /run/media/$USER/GARMIN/GARMIN/APPS/
```
App erscheint danach in der Aktivitätsliste der Uhr.

## Verknüpfung mit dem Account
1. Auf der Website einloggen → „Uhr verbinden" → Pairing-Code erzeugen.
2. Garmin-Connect-Phone-App → diese App → Einstellungen → Code eintragen.
3. Nach der Session: Menü → „Upload (WLAN)“. Beim ersten Upload löst die App den
   Code ein und speichert den Device-Token dauerhaft.

## Dateien
- `source/FoilApp.mc` — App-Einstieg, Settings, Background-Service.
- `source/SessionRecorder.mc` — Recording (FIT + Roh-Puffer GPS/Accel), Live-Stats, Alarm.
- `source/RecordView.mc` / `RecordDelegate.mc` — UI (Datenfelder) + Steuerung.
- `source/Uploader.mc` — Pairing + gechunkter Upload (+ Background-Service).
- `resources/settings/` — konfigurierbare Datenfelder, Alarm-Schwellen, Pairing-Code.
