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

## Foilers/Community
Bereits funktions-gleich aus der UI-Runde:
Zeitraum + Accel wirken auf ALLE Sektionen (Rekorde/Bestenliste/TopLiked/Spots je period+accel neu geladen) ✅ ·
Rekord-Karte → Session ✅ · TopLiked-Zeile → Session ✅ · Bestenlisten-Tabs ✅ ·
Medien-Thumb → Session ⚠️ (Web öffnet Lightbox/Player; nativ direkt zur Session — Mobile-Adaption) ·
Spot-Suche/hinzufügen/entfernen + je-Spot-Rekord-Grid ✅.
| Verhalten (Web) | Android | iOS |
|---|---|---|
| Like an „Neueste Medien" | ❌ bewusst (Like via Session-Detail / Best-bewertet vorhanden; Strip kompakt) | ❌ dito |
| „▸ Sessions an diesem Spot" ein-/ausklappen | ❌ bewusst (Sessions je Spot über Sessions-Tab-Spotfilter erreichbar) | ❌ dito |
Kein Code nötig — Kern-Interaktionen decken sich.

## Restbereiche (Abschluss-Sweep) — geprüft, größtenteils deckungsgleich
- **Verlauf**: Modus-Umschalter + Metriken/Werte ✅. Chart-Punkt-Klick → Session + Hover-Tooltip ⚠️
  (nur Web; auf Mobil fummelig — Session über Liste erreichbar). SpotProgression-Animation ❌ (§5, geräteabhängig).
- **Spots**: Karten-Marker → Spot-Sessions ✅, Spot-Liste → Sessions ✅. Such-Fokus auf Karte ⚠️
  (nativ Liste statt Suchfeld). Marker in Marken-Cyan ✅.
- **Home**: Feedback-Sheet ✅, Chat-Button ✅, Records Accel/alle-Toggle ✅, Wetter ✅, Meine Chats ✅,
  letzte Sessions → Detail ✅. Deckungsgleich.
- **Profil**: Avatar ändern ✅, Name bearbeiten ✅, Abmelden/Konto löschen (Bestätigung) ✅, Nav-Links ✅.
- **Einstellungen**: Gewicht/Homespot/Design/Sprache/Benachrichtigungen speichern ✅, Passwort ändern ✅ (Runde 1).
- **Login**: Google + E-Mail + Passwort-vergessen + Sprachwahl + Impressum ✅.
- **Foils**: „meine" wählen + Standard setzen + Marken-Filter + speichern ✅ (Web hat kein Custom-CRUD).
- **Compare**: Vergleichskorb (neu) + Mergen ✅.
- **Alarm** / **Datenfelder**: Uhr-Einstellungen speichern ✅.
- **Import** (manueller FIT/GPX-Upload): ❌ nativ bewusst — auf Mobil lädt die Uhr/App direkt hoch,
  kein Datei-Picker-Import; Web-only.
- **DSGVO-Daten-Export**: ❌ nativ (mobile Datei-UX); Konto-Löschung ist vorhanden.

## Fazit
Alle **hoch-wertigen** Verhaltens-/Interaktions-Lücken portiert (Sessions-Vergleichskorb + Like-aus-Liste,
Session-Detail Älter/Neuer, Chat Melden/Admin/Abo/Verlassen/Live-Polling/Linkify). Restliche ⚠️/❌ sind
bewusste Mobile-Adaptionen oder geräte-/Web-spezifisch (Chart-Tap, Medien-Like, Such-Fokus, Import, Export,
SpotProgression). iOS ist code-gespiegelt (kompiliert bei Jan, läuft) → finaler Xcode-Durchblick durch Jan.
