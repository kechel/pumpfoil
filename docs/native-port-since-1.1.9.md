# Native-Portierung — PWA-Änderungen seit dem letzten Release

> ✅ **ERLEDIGT (2026-07-13):** Alle „echt portieren"-Punkte sind in Android + iOS umgesetzt
> und committet (18896f4 · 4a7297e · 66efd1b · 44cf1a7 · 99bacbb · 3f94e3d), plus Finnisch als
> 8. App-Sprache (cf80ac4, fi-Overlay aus web/fi.ts; App-eigene Keys fallen für fi auf Englisch)
> und iOS-Build-Fixes (dbc9dad). Android kompiliert + im Emulator verifiziert; iOS nur
> code-gespiegelt → Jan baut in Xcode. **Für den nächsten Release-Zyklus ein neues Doc anlegen**
> (Baseline dann die dann gebumpte Version). Details/Entscheidungen unten bleiben als Historie.

**Baseline:** `aea5493` (2026-07-07, Phone 1.1.8 / Wear 1.2.8 / iOS 1.1.9).
Alles darunter ist seither in der PWA/Server passiert. Ziel: sinnvoll in Android (`:app`) +
iOS (`Sources-iOS/`) übernehmen. Native-Präsenz unten aus grep ermittelt → **bei Umsetzung kurz
im Native-Code gegenchecken** (Stichprobe, nicht garantiert vollständig).

Legende: 🟢 in Native vorhanden · 🟡 teilweise/prüfen · 🔴 fehlt · ⚙️ serverseitig (Native bekommt es
automatisch, ggf. kleine UI) · 🚫 PWA-spezifisch, nicht erzwingen.

---

## 1) Portieren — echte Feature-Lücken

### 🔴 Aufzeichnungsmodus pro Uhr (Voll · 25 Hz / Sparsam · 10 Hz / Nur GPS)
- Web: Profil → „Verbundene Uhren" — Selektor je nicht-widerrufenem Gerät. Server: `DeviceToken.record_mode`,
  `PUT /api/devices/{id}/record-mode`, `/list` liefert `record_mode`+`low_accel`.
- Native: **fehlt (0/0).** In der Geräte-/Uhren-Liste je Uhr einen Selektor ergänzen, PUT aufrufen.
  FR55-Auto-Lite-Hinweis (`low_accel`) mit anzeigen. Commits: `37c588a b6a32b5 aa80635`.

### 🔴 Aktivitätstyp Surfen | Open Water (Garmin-Aufnahme)
- Web: Profil-Karte, speichert `activity_type` (surfing|openwater). Server liefert es via `/api/devices/config`
  an die Uhr (kein Native-Recorder betroffen — reine Profil-Einstellung).
- Native: **fehlt (0/0).** Ein einfacher Selektor im Profil (2 Optionen). Commits: `d3e7d00 0233cb3`.

### 🔴 Globaler Community-Chat
- Web: fester Raum `global:main`, alle standardmäßig drin (kein Push default), verlassen/wieder beitreten.
  Server injiziert ihn **immer oben** in `/api/chat/rooms` (außer verlassen).
- Native: **fehlt (0/0)** als expliziter Eintrag. Gute Nachricht: wenn die App die Räume aus `/api/chat/rooms`
  rendert, **erscheint der globale Raum automatisch** (kind `global`). Zu tun: kind `global` sauber rendern
  (Icon/Label „Community-Chat") + Wieder-Beitritt-Einstieg (fester Eintrag in der Entdeckungsliste).
  Commit: `ff2b49a`.

### 🟡 Suunto-Konto verknüpfen (+ Auto-Import)
- Web: `/konten` Suunto-Karte (OAuth-Connect, Sync, Verbunden-State, Logo), Uhren-Matrix „Import".
  Server: `/api/integrations/suunto/*` + Webhook (live, verifiziert).
- Native: Polar 🟢, Suunto nur erwähnt (🟡 3/3 — vermutlich „ausstehend"-Label). Zu tun: Suunto in der
  „Verknüpfte Konten"-Ansicht als **verbindbar** ergänzen (OAuth im System-Browser → `…/suunto/connect`,
  Sync-Button), analog zur bestehenden Polar-Karte. Commits: `08b818e 4b8e59c … dbc3bb4`.

### 🟡 Session-Übertragung — neues „Übertragung"-Badge + Banner
- Transfer-Kern ist in Native vorhanden (🟢 7/10). NEU seit Release: **Badge „Übertragung"** in „Meine Sessions"
  bei offener ausgehender Übertragung (`transfer_to` im Summary) + „ausstehend"-Banner.
- Native: Badge/Banner **prüfen/ergänzen**. Commits: `d84c215 7153b65`.

### 🟡 Video-Vorschau in Session-Listen
- Web: verlinktes YouTube → Thumbnail (Proxy `/api/public/video-thumb/{id}`) + Play-Badge in den Listenkarten,
  Tap öffnet Video. Detail-Einbettung gab's schon.
- Native: YouTube in Detail 🟢, **in der Liste prüfen** (4/4-Treffer sind evtl. nur Detail). Falls Liste ohne
  Video-Thumb → ergänzen. Commit: `2952ee4`.

### 🟡 Teilen: einzelnen Lauf hervorheben + Stats nur dieses Laufs
- Web: Teilen-Dialog Run-Selektor → `highlight=<run>` an `/share.png`; Card hebt den Lauf hervor + Stats/Untertitel
  aus dem Lauf.
- Native: Share vorhanden (🟡 2–3 Treffer). Falls Share-Card genutzt wird: Run-Selektor + `highlight`-Param
  ergänzen (rein additiver Query-Param, Server erledigt den Rest). Commits: `088ab16 9a040d7`.

### 🟡 Sozial-Gate unter 13 (Apple-Vorgabe) — Android-Seite
- iOS 🟢 (AgeGate, 5 Treffer). Android nur 1 Treffer → **prüfen**, ob UGC/Feed/Chat bei `!social_allowed`
  wirklich ausgeblendet werden. Server-Flag ist geteilt. Commits: `5c06e50 e9181f9`.

### 🟢/🟡 „Kleinkram", der mitgezogen werden sollte (prüfen)
- **Merge nur bei gleicher Uhr** (Compare/Merge nur bei identischer `device_id`) — `c1bf709 ed4d2d3`.
- **Karten-Overlay Live-Tempo + Strecke** beim Abspielen — `a905d4f` (nur falls Native Playback hat).
- **„Gespeichert"-Bestätigung** bei Profil-Auto-Save — `f15a3d9` (nette UX, Native kann Toast zeigen).
- **Session-Detail-Umbau** (Reihenfolge unter Karte, Trimmen unten, Übertragen/Löschen eine Zeile) — `037cccf b1c2620`
  (Native hat eigenes Layout → nur sinngemäß).

---

## 2) ⚙️ Serverseitig — schon geteilt (Native profitiert automatisch)

Kein Port nötig; ggf. nur UI, wo etwas sichtbar wird. Alle Clients treffen denselben Server.
- **Detektor-Fixes** (Pump-Gate 0.008, Accel-Rate = samples/GPS-Dauer, Gleitphasen nur über Accel-Abdeckung):
  `3351d9f 1b5410a 24e5893 86e3b77 63d84af`.
- **100-Hz-Accel (fēnix) nicht mehr auf 25 Hz geklemmt** — `0db5843`.
- **`ended_at` beim Upload/Merge persistiert** + Von–bis-Ableitung — `9ca4567 54d9d38 50a5dd3`.
- **Pro-User-Empfindlichkeit** (Preset-Cache + Reanalyse) — Native hat den Selektor schon (🟢). `4f77f12 fb4b3af bbaa57c`.
- **Polar-Webhook Auto-Import** — `08b818e`.
- **Skalierung** (Postgres-Zustände, 4 Worker) + **CSP erzwingend** — `44acccf d70d228 8e53dec`.
- **Kleine Foto-Thumbnails** in Listen/Feed — `96a1430` (Native lädt einfach die kleineren URLs).
- **appmeta/Update-Hinweise** — laufend.

---

## 3) 🚫 PWA-spezifisch — NICHT auf Native erzwingen

- **PWA-Auto-Update + kein Reload bei aktivem Upload/Diktat**, `no-cache` für sw.js/index — Service-Worker-Sache;
  Native updaten über Stores. `caf4e7d cc36d59(nur der Reload-Teil) 3cff1e3`.
- **Zurück-Gesten-/History-Handling im Chat-Overlay** (inkl. heutiger Fix) — Browser-History-API; Native hat
  echte Navigation. `cf87736 6f20243 7d1a031 945e1b5 ba2ab05`.
- **Safe-Area-Insets in Overlays**, **Canvas-Taint/JPEG beim Teilen**, **synchrones Web-Share** — reine
  Web/Standalone-Themen. `3b70ecd edc5194 46293e7 444f1e2 b68a4ff`.
- **Bilder vor Upload skalieren** — Konzept schon in Native portiert (ImageUtil/downscaleJpeg); der PWA-Commit
  `cc36d59` betrifft nur die Web-Umsetzung.
- **Landing/öffentliche Seiten:** Instagram-Link, „Konto verbinden"-Sektion, Nerd-Seiten Teil 3,
  „Systemarchitektur" — Marketing/Content der Web-Startseite; Native hat keine Landing. Höchstens als
  Link/Impressum. `ca1dfe2 fd76544 28a70d1 0fceda0 afce8bc`.
- **Admin-Web** (Moderation etc.) — bleibt Web.

---

## Vorschlag Reihenfolge (Aufwand↔Nutzen)
1. **Aktivitätstyp** + **Aufzeichnungsmodus pro Uhr** (kleine Profil-/Geräte-UI, klarer Nutzen).
2. **Globaler Community-Chat** rendern (fast automatisch via `/rooms`).
3. **Suunto-Verknüpfung** in „Verknüpfte Konten".
4. **Transfer-Badge** + **Video-Thumb in Liste** (kleine additive UI).
5. Rest (Share-Highlight, Merge-gleiche-Uhr, Age-Gate-Android) nach Bedarf.

iOS ist code-seitig zu spiegeln; **Build/Signieren/Upload macht Jan in Xcode**.
