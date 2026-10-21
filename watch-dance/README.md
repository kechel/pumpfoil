# Dance — Tanz-Variante der Garmin-App (nur Jan, Sideload)

Kopie von `watch/` (Stand Garmin 1.0.94, 16.10.2026), damit die Pumpfoil-App Bit fuer Bit unberuehrt
bleibt. **Nicht im Store, nicht in `watch/bin`** (das ist die Live-Auslieferung der Website).
Korrekturen an `watch/` wandern NICHT automatisch mit.

**HARTE REGEL (Jan, 21.10.2026): nur Pumpfoil -> Tanz, NIE umgekehrt.** Aenderungen aus `watch/` duerfen
hierher uebernommen werden; nichts von hier geht je nach `watch/`. Tanz-Funktionen bleiben hier.

Unterschiede zu Pumpfoil (im Code mit `DANCE` markiert):
- eigene App-ID und Name „Dance", nur `fenix7xpro` im Manifest; eigene Kopplung per Code
- kein GPS-Track, Start ohne Fix; ab 0.6 nur ein Einzel-Fix beim Start und alle 30 min (`TanzSensoren.mc`,
  im /complete als `tanz_orte`, Server nur `tanz.json`); Speicher-Sparen aus (haengt am GPS-Tempo)
- Accel immer 25 Hz, dazu Gyro (falls die Uhr ihn liefert) im selben Takt -> `kind=gyro`
  (Grad/s -> rad/s x 1024), gleiche Chunk-Grenzen und t0 wie der Accel
- je Sensorpaket (~1 s) `[t_ms, puls, kurs, kadenz, schritte]` (ab 0.6; bis 0.5 `[t_ms, bpm]`) -> `kind=hr`
  (ueber die alte GPS-Schiene `cg_`)
- FIT: Cardio-Training mit Name „Dance" (Connect IQ kennt keinen Typ Tanzen)
- Upload mit `sport = "dance"` -> Server ordnet als „other" ein (normale Liste, kein Spot)
- kein Update-Hinweis auf die Pumpfoil-Version

Bauen (Testbuild, immer `-r`):

    cd watch-dance && /home/jan/connectiq-sdk-9.2.0/bin/monkeyc -f monkey.jungle -d fenix7xpro \
        -o /tmp/dance-fenix7xpro.prg -y /home/jan/connectiq-sdk-9.2.0/developer_key.der -r
