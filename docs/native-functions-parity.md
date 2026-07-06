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

## Session-Detail
War bereits weitgehend funktions-gleich auf beiden Plattformen:
Like ✅ · Share ✅ · Label/Pump-Tap ✅ · Trim (Slider+Reset) ✅ · Delete+Bestätigung ✅ ·
Report Fake/Unangemessen (fremde) ✅ · Foil-Wechsel ✅ · Farb-Modus/Glättung ✅ ·
Tap Stat/Lauf → Lauf auswählen + Clear ✅ · Fotos+Lightbox ✅ · YouTube-Link ✅ · Caption-Edit ✅.
| Verhalten (Web) | Android | iOS |
|---|---|---|
| **Älter/Neuer-Navigation** (Nachbar-Sessions) | ✅ (neu) | ✅ (neu) |

Neu: `GET /api/sessions/{id}/neighbors` in beide Clients; Vor/Zurück-Zeile oben (deaktiviert, wenn
keine Nachbarn). Android navigiert via `onOpenSession`, iOS via NavigationLink. i18n sd.older/newer (7 Spr.).

## Chat
| Verhalten (Web) | Android | iOS |
|---|---|---|
| Edit/Delete eigener Nachricht (1 h) | ✅ | ✅ |
| **Melden** fremder Nachrichten | ✅ (neu) | ✅ (neu) |
| **Admin: Ein-/Ausblenden + Nutzer stumm** (nur is_admin) | ✅ (neu) | ✅ (neu) |
| **Abonnieren/Verlassen** (Glocke + Verlassen) | ✅ (neu) | ✅ (neu) |
| **Live-Polling ~10 s** + Lesestand (markRead) | ✅ (neu) | ✅ (neu) |
| **URL-Linkify** (klickbare Links) | ✅ (neu, ClickableText) | ✅ (neu, AttributedString) |
| Ausgeblendete Nachricht gedimmt | ✅ | ✅ |
| Ältere per Hochscroll nachladen (Pagination) | ⚠️ lädt letzte 100 (= Web-CAP) | ⚠️ dito |
| „neuer Autor"-Badge | ❌ (kosmetisch, offen) | ❌ |

Neu: Api chatSince/Report/Hide/SetReadonly/Subscribe/Leave/RoomState/MarkRead (beide Clients);
i18n chat.report/subscribe/subscribed/leave/leaveConfirm/hide/unhide/readonly (7 Spr.). Alle Chat-
Endpunkte sind POST/GET → kein PATCH-Problem. Android im Emulator verifiziert (Glocke/Verlassen-Leiste,
Long-Press fremd → „Melden").

## Offen / nächste Bereiche
- Chat: Report/Hide/Mute/Admin + Abo/Verlassen (❌ nativ), URL-Linkify (❌ nativ), Edit/Delete 1 h (✅).
- Verlauf: Chart-Klick → Session + Hover-Tooltip (❌ nativ).
- Spots, Home, Profil, Einstellungen, Login, Foils/Compare/Import/Alarm/Datenfelder — folgen.
- DSGVO-Daten-Export (❌ nativ, mobile Datei-UX).
