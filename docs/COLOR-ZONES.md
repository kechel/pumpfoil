# Farbskalen: Puls- und Geschwindigkeits-Zonen

Wo die Farben herkommen, mit denen die Uhren Werte einfärben — **eine Quelle für alle
Plattformen**, einstellbar im Profil.

## Kurzfassung

| | |
|---|---|
| **Was ist eine Zone?** | Fünf Zonen Z1…Z5, definiert durch **sechs Grenzen** (Z1-Untergrenze … Z5-Obergrenze). |
| **Farben** | Z1 blau `#3b82f6` · Z2 grün `#22c55e` · Z3 gelb `#eab308` · Z4 orange `#f97316` · Z5 rot `#ef4444` |
| **Gespeichert in** | `users.settings_json` → `hr_zones` (bpm) und `speed_zones` (km/h), je eine Liste mit sechs Zahlen. `null` = „noch nie gesetzt", dann liefert der Server seinen Vorschlag. |
| **Eingestellt im** | Profil: Web (`/settings`), iPhone-App, Android-App. Auf der Uhr selbst gibt es keine Zonen-Einstellung. |
| **An die Uhr geliefert über** | `GET /api/devices/config` → `hrZones`, `speedZones` (dazu `speedScale` = `[zones[0], zones[5]]` nur noch für alte Uhr-Versionen). |
| **Gefärbt wird damit** | **beides**: die Zahl auf der Datenseite (Schalter „Werte farbig") **und** die Wert-Grafiken (Rand-Grafik / Balken) in eigenen Layouts. |
| **Gilt für** | Geschwindigkeit: Feld-IDs 1, 5, 6, 7, 18, 19 · Puls: 2, 8, 9, 21. Alle anderen Felder bleiben neutral. |

## Warum aus dem Profil und nicht von der Uhr

Nur **Garmin** (`UserProfile.getHeartRateZones`) und **Zepp OS ab 4.2**
(`Workout.getUserHrZoneSettings`) können die Zonen des Geräts selbst lesen. **Wear OS und watchOS
haben keine Zonen-API.** Käme die Skala vom Gerät, färbte dieselbe Anzeige auf jeder Uhr anders —
und in der PWA-Vorschau eine dritte Variante. Deshalb ist das Profil die einzige Quelle, für alle
Plattformen dieselbe.

## Vorschlag, wenn nichts eingestellt ist

Der Server liefert nie „leer", sondern einen Vorschlag aus den **eigenen Daten** (dazu je ein
`*_suggested`-Flag, damit die Oberfläche „das ist nur ein Vorschlag" anzeigen kann):

- **Puls** (`hr_zones_default`): Anker ist der höchste je gemessene Puls
  (`metrics_json.max_hr`), Zonen bei 60/70/80/90/100 % davon, Z1-Untergrenze fest bei 60 bpm.
  Ein Maximum unter 150 bpm gilt als nicht belastbar → 190 bpm als neutraler Startwert.
  (Gemessen am 26.08.: 52 von 141 Nutzern mit Pulsdaten haben ein Maximum unter 150, drei unter 70 —
  Sessions ohne Gurt. Als „100 %" genommen stünde die Anzeige dauerhaft im roten Bereich.)
- **Geschwindigkeit** (`speed_zones_default`): 8 km/h bis zum persönlichen Maximum, in fünf gleiche
  Stufen geteilt. Anker ist das **90.-Perzentil der Session-Maxima**, nicht das absolute Maximum:
  ein einzelner GPS-Ausreißer (Doppler-Burst) würde die Skala sonst dauerhaft verziehen.
  Weniger als drei Sessions oder ein unplausibel niedriger Wert (< 14 km/h) → Rückfall
  `[8, 12, 16, 20, 24, 28]`. (Stand 27.08.: 95 von 189 Nutzern mit Sessions bekommen einen eigenen
  Vorschlag, die Obergrenzen liegen bei 17–27 km/h.)

## Nicht zu verwechseln: der Alarm

`speed_min` / `speed_max` im Profil sind die **Alarm-Schwellen** (Vibration bei Über-/Unterschreiten)
und haben mit den Farben nichts zu tun. Bis 26.08. war das vermischt: die Grafik benutzte die
Alarmspanne als Skala. Jetzt ist der Alarm ein Zielfenster und die Zonen sind eine Farbskala.

## Historie — warum es das Dokument gibt

Es gab **drei** Skalen für dieselbe Sache:

1. Die **Zahl** hatte fest verdrahtete Stufen: Geschwindigkeit 12/16/20 km/h (vier Stufen, kein
   Orange), Puls 120/150/170 bpm. Seit dem ersten öffentlichen Commit (23.06.), ohne Herleitung.
2. Die **Wert-Grafiken** (ab 26.08.) benutzten die Puls-Zonen aus dem Profil — und für die
   Geschwindigkeit die **Alarmspanne**, in fünf gleiche Stufen geteilt.
3. Wear OS hatte davor sogar einen **stufenlosen HSV-Verlauf** von 8 bis 25 km/h.

Folge: bei Standard 8–25 km/h lagen die Grafik-Grenzen bei 8/11,4/14,8/18,2/21,6 — **15 km/h ergab
grüne Zahl und gelben Ring auf derselben Seite.** Seit 27.08. gilt überall dieselbe Skala.

## Wo es im Code steht

| Ort | Datei |
|---|---|
| Speichern, Reinigen, Vorschlag | `server/app/api/settings.py` (`_clean_hr_zones`, `_clean_speed_zones`, `hr_zones_default`, `speed_zones_default`, `SPEED_ZONES_FALLBACK`) |
| Auslieferung an die Uhr | `server/app/api/devices.py` (`_hr_zones_fuer_uhr`, `_speed_zones_fuer_uhr`, `_speed_scale`) |
| Web: Skala + Farben | `web/src/lib/watchLayout.ts` (`ZONE_COLORS`, `DEFAULT_SCALES`, `zoneOf`, `zonesFor`, `watchSpeedColor`, `watchHrColor`) |
| Web: Einstellung | `web/src/components/ZonesCard.tsx` (eine Karte, zweimal benutzt) |
| Garmin | `watch/source/SessionRecorder.mc` (`hrZones`, `speedZones`, `_applyScales`) · `watch/source/RecordView.mc` (`_zoneOf`, `_zonesFor`, `_speedColor`, `_hrColor`, `_zoneColorAll`) |
| Wear OS | `android/wear/.../WatchLayout.kt` (`LayoutScales`, `ZONE_COLORS`) · `MainActivity.kt` (`speedColor`, `hrColor`) |
| Apple Watch | `watch-apple/Sources/WatchLayoutRender.swift` (`LayoutScales`) · `ContentView.swift` (`speedColor`, `hrColor`) |
| Android-Handy | `android/app/.../LayoutRender.kt` (`LayoutScales`) · `SettingsScreen.kt` (`ZonenBlock`) |
| iPhone | `watch-apple/Sources-iOS/LayoutRender.swift` · `SettingsView.swift` (`zonenSection`, `spZonenSection`) |
| Zepp OS | `watch-zepp/page/index.js` (`laySkala`, `layZoneVon`, `laySpeedColor`, `layHrColor`) · `app-side/index.js` (Whitelist!) |

**Fallen:**
- Die Rückfall-Zonen in den Uhr-Apps folgen dem Server-Vorschlag **absichtlich nicht** — sonst
  bräuchte jede geänderte Voreinstellung ein Uhr-Release. Sie sind nur für den allerersten Start
  ohne Config-Sync da. Die ersten drei Geschwindigkeits-Grenzen (12/16/20) sind bewusst die alten
  festen Stufen: ohne Sync sieht es aus wie vorher.
- Bei Garmin sind die Skalen **nicht** hinter `(:layouts)` — die kleinen Uhren (96/128 KB) zeichnen
  keine Layouts, färben aber die Zahl.
- Bei Zepp muss jeder neue Config-Schlüssel in die **Whitelist** im App-Side, sonst kommt er auf
  der Uhr nie an (schon dreimal passiert: Sprache, Update-Hinweis, Layouts).
