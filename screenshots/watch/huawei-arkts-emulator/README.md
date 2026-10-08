# Huawei Watch 5 (ArkTS) im DevEco-Emulator — Screenshots vom 08.10.2026

Material fuer eine kleine Hilfeseite. Ablauf, wie er funktioniert hat:

1. Projekt `watch-huawei/arkts` in DevEco Studio oeffnen. Der „Huawei Lite Wearable Simulator" ist
   der FALSCHE (nur fuer `lite/`), siehe 01.
2. Device Manager -> Wearable -> **HarmonyOS 6.0.1(21)** laden (passt zu `targetSdkVersion`), 02/03.
3. Signatur: File -> Project Structure -> Signing Configs -> „Automatically generate signature".
4. Emulator starten, ▶ Run. Berechtigungen bestaetigen (05/06).
5. **Ortung einschalten:** auf der Emulator-Uhr Einstellungen -> Privacy & security -> Location ->
   Location Services. Die GPS-Emulation im Seitenfenster schaltet sie NICHT ein (18: „GPS off").
   Ab 380661f2 fragt die App beim START selbst per System-Dialog.
6. GPS-Fahrt: Seitenfenster -> GPS emulation -> Replay -> `watch-huawei/sim-fahrt.gpx` (14/15).
7. Nach einem `git pull` reicht ▶ Run (kein Clean noetig). Die Versionsnummer unten auf dem
   Startbildschirm zeigt, welcher Build laeuft (16 ohne, 17 mit).

Fehlen noch (nicht gespeichert): die Einstellungsseiten „Privacy & security" und „Location"
sowie der gefuellte Halte-Balken bei Pause/STOPP.
