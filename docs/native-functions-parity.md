# Funktions-/Interaktions-Parität (Web-PWA → Android + iOS)

Zweite Audit-Runde: **Verhalten & unsichtbare Features** (nicht sichtbare UI — die ist in
`native-port-backlog.md` abgehakt). Web = Wahrheit. Legende: ✅ portiert · ⚠️ nativ adaptiert ·
❌ bewusst weg / offen. iOS ist hier nicht baubar → per Code gespiegelt, Jan verifiziert in Xcode.

## Sessions (Liste)
| Verhalten (Web) | Android | iOS |
|---|---|---|
| Tap Karte → Detail | ✅ | ✅ |
| **Long-Press → Vergleichskorb** | ✅ (`combinedClickable.onLongClick`) | ✅ (`.contextMenu`, neu) |
| **Schwebender CompareBar** (öffnet Vergleich, N) | ✅ (Scaffold-FAB, neu) | ✅ (Overlay + Sheet, neu) |
| „Im Vergleich"-Markierung | ✅ Rahmen | ✅ Cyan-Balken (neu) |
| **Like/Unlike aus der Liste** (optimistisch) | ✅ (neu, war Anzeige) | ✅ (neu, war Anzeige) |
| Scope/Filter/Monat/Accel wirkt auf Liste | ✅ | ✅ |
| Merge-Vorschläge → Vergleichen&Mergen | ✅ | ✅ |
| Haptik bei Long-Press | ⚠️ (Compose-Standard) | ⚠️ (contextMenu-Standard) |
| Infinite-Scroll/Pagination | ⚠️ lädt alle statt seitenweise | ⚠️ dito |

Shared: iOS `CompareStore` (ObservableObject) analog Android `CompareStore`; Compare-Basket
über beide erreichbar. HR in Listenkarten von rotem ♥-Emoji auf „xx/yy bpm" umgestellt (kollidierte
optisch mit dem Like-Herz).

## Offen / nächste Bereiche
- Session-Detail: Tap-Stat→Lauf, Trim, Pump-Tap-Label, Foil-Wechsel, Share — Interaktionen prüfen.
- Chat: Report/Hide/Mute/Admin + Abo/Verlassen (❌ nativ), URL-Linkify (❌ nativ), Edit/Delete 1 h (✅).
- Verlauf: Chart-Klick → Session + Hover-Tooltip (❌ nativ).
- Spots, Home, Profil, Einstellungen, Login, Foils/Compare/Import/Alarm/Datenfelder — folgen.
- DSGVO-Daten-Export (❌ nativ, mobile Datei-UX).
