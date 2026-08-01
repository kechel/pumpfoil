# Forum — Entwurf (nur Planung, nichts gebaut)

**Stand: 2026-08-01, Entwurf zur Diskussion.** Jans Wunsch: Threads + Antworten, Zitieren,
Bearbeiten, Entwurf speichern, Vorschau, Bilder; ggf. Bereiche (Technik / Spots / Sonstiges /
je Aktivitätstyp); dazu alles, „was sonst noch so dazugehört".

## 1. Wozu ein Forum, wenn es den Chat gibt?

Der Chat (global / je Spot / DM) ist **flüchtig**: Wissen versinkt chronologisch, nichts ist
auffindbar, nichts hat einen Titel. Ein Forum ist das Gegenteil — **persistentes, strukturiertes
Wissen**: „Welcher Mast für 65 kg?", „Einstieg am Dock XY", „Setup-Fragen Takoon". Genau die
Fragen, die heute im Chat oder per Feedback/DM landen und beim dritten Mal wieder beantwortet
werden müssen.

**Ehrliche Gegenrechnung:** ~170 registrierte Nutzer, ein harter Kern von ein paar Dutzend.
Foren unter kritischer Masse wirken leer, und leere Foren schrecken ab. Dagegen spricht: Threads
akkumulieren Wert auch bei niedrigem Volumen (5 gute Threads/Monat sind nach einem Jahr eine
Wissensbasis, 5 Chat-Nachrichten/Tag sind nach einem Jahr nichts) — und öffentliche Lesbarkeit
(s. § 6) macht das Forum zum Community-Magneten statt nur zum Mitglieder-Feature. Startphase
gestaltbar: wenige Bereiche, Jan sät die ersten Threads (FAQ-artige: „Uhr verbindet nicht",
„Welches Foil zum Lernen"), Feedback-Antworten dürfen als Forum-Thread enden statt als DM.

**Moderationslast** liegt bei Jan (wie Chat heute). Die vorhandene Mechanik (Melden → Admin-
Queue, `flag_blocked`, `UserBlock`) deckt das; das Forum erbt sie.

## 2. Eigenbau oder Fertiges (Discourse/Flarum/NodeBB)?

**Eigenbau, klar.** Fertige Foren bringen eigenen Auth (zweites Konto oder SSO-Gefrickel),
eigene Cookies (bricht die harte 0-Cookie-Zusage), eigenes Design, eigenen Stack (Rails/PHP),
eigene Update-Pflege — und können nichts von dem, was unser Forum besonders macht: Sessions,
Spots und Foils als **native Bausteine in Beiträgen**. Der Eigenbau ist überschaubar, weil fast
alles schon da ist: Auth + Age-Gate, Medien-Pipeline (EXIF-Strip, WebP, Thumbnails), Web-Push,
Melde-/Block-Mechanik, Admin-Bereich, i18n-System, Rate-Limits (`rate_events`).

## 3. Struktur: Bereiche, Threads, Beiträge

**Feste Bereiche (v1, keine Admin-Taxonomie nötig):**

| Bereich | Inhalt |
|---|---|
| **Material & Setup** | Foils, Boards, Masten, Uhren/Recorder-Hardware |
| **Technik & Lernen** | Pumptechnik, Starts, Übungen, Videos |
| **Spots & Reviere** | Revier-Fragen; Threads optional an einen **Spot** gekoppelt (`spot_id`) |
| **App & Website** | Fragen/Hilfe zu pumpfoil.org selbst (entlastet Feedback/DM) |
| **Sonstiges** | Rest |

**Aktivitätstyp nicht als eigener Bereich**, sondern als optionales **Sport-Tag am Thread**
(dieselbe `sport_class`-Enum wie Sessions) — filterbar. Eigene Wingfoil-/Efoil-Bereiche wären
bei der Nutzerbasis sofort leer; ein Tag kostet nichts und lässt sich später zu Bereichen
promoten, wenn das Volumen es trägt.

**Hierarchie bewusst flach:** Bereich → Thread → Antworten (chronologisch, KEINE Verschachtelung).
Zitieren statt Baum — Bäume zersplittern Diskussionen und sind auf Mobil unlesbar. Ein Zitat
referenziert den Ursprungsbeitrag (`quote_of_post_id`) und rendert als Blockzitat mit Autor-Link.

## 4. Feature-Liste

**Kern (v1):**
- Thread erstellen (Titel + erster Beitrag), antworten, **zitieren** (ganzer Beitrag oder
  markierte Passage → vorbefülltes Blockzitat).
- **Bearbeiten** (Autor, jederzeit, sichtbarer „bearbeitet"-Marker mit Zeit; keine
  Versionshistorie in v1). **Löschen** = soft-delete, Platzhalter „Beitrag gelöscht" (hält
  Thread-Kohärenz; Admin sieht Inhalt weiter).
- **Vorschau**: derselbe Renderer wie die Anzeige, clientseitig, Tab Schreiben/Vorschau.
- **Entwurf speichern**: localStorage je Thread/Editor (Muster `hideCompareTip` etc.), KEIN
  Server-Draft in v1 — überlebt Reload/App-Wechsel, kostet nichts.
- **Bilder**: bestehende Medien-Pipeline (Re-Encode WebP, EXIF/Geo-Strip, Thumbnail), max. ~4
  je Beitrag, Lightbox wie Session-Fotos.
- **Formatierung: Mini-Markdown, als React-Knoten gerendert** (fett, kursiv, Links, Blockzitat,
  Listen, Inline-Code, Bilder). Bewusst KEIN `dangerouslySetInnerHTML` und keine volle
  Markdown-Lib: ein eigener ~150-Zeilen-Parser, der direkt React-Elemente baut, ist durch
  Konstruktion XSS-sicher und CSP-konform (Bausteine dafür existieren im Chat-Renderer).
- **Native Einbettungen (das Alleinstellungsmerkmal):** eine Session-URL im Text wird zur
  Session-Karte, eine Spot-Referenz zur Spot-Zeile, ein Foil aus dem Katalog zum Foil-Chip.
  YouTube wie überall: Click-to-Load über youtube-nocookie.
- Pinnen + Schließen (Admin), Thread in anderen Bereich verschieben (Admin).
- **Melden** wie Chat (anonym für Nutzer, Admin-Queue mit Melder), `flag_blocked` gilt mit.
- Ungelesen-Marker je Thread (`last_read_post_id`), Sortierung nach letzter Aktivität.
- **Rate-Limit** (rate_events): neue Nutzer gedrosselt (z. B. 1 Thread + 5 Antworten/Tag in den
  ersten 48 h), Link-Limit für Erstbeiträge — das übliche Spam-Einfallstor.
- **Age-Gate:** `social_allowed == false` → Forum unsichtbar (UGC, Apple-Vorgabe, wie Chat/Feed).

**Ausbau (v2):**
- **Abonnieren** + Web-Push („neue Antwort in …"; eigener Thread automatisch abonniert,
  abbestellbar) über vorhandenes `push.py`/`notify.py`.
- **Suche**: erst ILIKE über Titel+Text, später Postgres-tsvector (Sprachen-Mix beachten).
- **Spot-Integration**: Spot-Seite zeigt „Threads zu diesem Spot"; Abgrenzung zum Spot-Chat:
  Chat = live/flüchtig („heute jemand da?"), Forum = persistent („Einstieg bei Niedrigwasser").
- **Gelöst-Marker** (Frage-Threads: Autor markiert beste Antwort, springt nach oben) — macht
  das Forum zur FAQ-Maschine.
- @-Erwähnungen (Suche nur über display_name, wie DM) + Benachrichtigung.
- Öffentliches Lesen (s. § 6), Sitemap/SEO.

**Bewusst NICHT (auch später nur mit gutem Grund):**
- Reputations-/Punktesysteme, Signaturen, Avatare-Sonderlocken, private Unterforen,
  Umfragen, WYSIWYG-Editor. Alles Pflegelast ohne Kern-Nutzen.
- Kein separates Konto, keine Cookies, kein Tracking (versteht sich).

## 5. Architektur

**Wo: im Monolithen.** Gleiche FastAPI-App, gleiche Postgres, gleiche PWA (Routen `/forum`,
`/forum/<bereich>`, `/forum/thread/<id>`), Navigation als weiterer Menüpunkt (Mobile-Nav ist
mit 7 Tabs voll — Kandidat: unter „Foilers"/Community einhängen oder Tab-Tausch, zu klären).

**Datenmodell (Skizze):**

```
forum_threads   id, category (enum, s. §3), title, author_id, created_at,
                sport_class|null, spot_id|null, pinned, locked,
                last_post_at, post_count, deleted (soft)
forum_posts     id, thread_id, author_id, body_md (Markdown-Quelle),
                quote_of_post_id|null, created_at, edited_at|null,
                deleted (soft), images_json ([{url, thumb}, …] aus media.py)
forum_reads     user_id, thread_id, last_read_post_id      (PK user+thread)
forum_subs      user_id, thread_id, created_at             (v2)
forum_flags     id, post_id, user_id, created_at, note     (Melde-Muster wie session_flags)
```

Kein eigenes Kategorien-CRUD in v1 — Enum im Code, i18n-Labels in den 15 Sprachen.

**API (alles unter `/api/forum/…`):** Liste je Bereich (Paginierung nach `last_post_at`),
Thread mit Posts (Cursor), POST thread/post, PATCH post (Autor/Admin), DELETE (soft),
POST flag, Admin: pin/lock/move/restore. Alles hinter Login außer ggf. GET (s. § 6).

**Rendering-Vertrag:** Server speichert und liefert **nur Markdown-Quelle** + Bild-URLs;
sanitisiert wird nirgends HTML, weil nirgends HTML entsteht — der Client-Parser erzeugt React-
Knoten, unbekannte Syntax bleibt Klartext. Apps (Android/iOS) bekommen denselben Vertrag und
rendern mit eigenem Mini-Parser (wie die geteilten i18n-Wortlaute: PWA ist die Spezifikation).

**DSGVO — der eine harte Punkt:** Konto-Löschung ist absolut (bestehende Regel). Forum-Beiträge
sind Nutzerinhalte → sie werden bei Konto-Löschung **gelöscht**, nicht anonymisiert. Threads
bekommen Lücken („Beitrag gelöscht") — das ist der Preis der Regel, und er ist es wert. Muss
in `accounts.py`-Löschpfad von Tag 1 an mit drin sein (wie Chat/Flags heute).

**Phasierung:**
1. **v1 (PWA only):** Bereiche, Threads, Antworten, Zitieren, Bearbeiten, Bilder, Vorschau,
   lokale Entwürfe, Melden, Pin/Lock, Rate-Limit, Age-Gate, Ungelesen-Marker.
2. **v2:** Abos + Push, Suche, Spot-Integration, Gelöst-Marker, öffentliches Lesen (nach
   Entscheidung § 6).
3. **v3:** native Apps (erst lesend, dann schreibend), @-Erwähnungen.

Größenordnung v1: Server ~2–3 Tage-Äquivalente (Modelle + API + Admin), PWA ~3–4 (Listen,
Thread-Ansicht, Editor mit Vorschau/Zitat/Bildern, i18n ×15). Kein Neuland — alles Muster,
die im Projekt schon einmal gebaut wurden.

## 6. Offene Entscheidungen (Jans Ruf)

1. **Öffentlich lesbar?** Heute ist alles außer Landing/Impressum/Changelog hinter Login.
   Ein öffentlich lesbares Forum (Schreiben nur mit Konto) wäre der größte Wachstumshebel
   (Suchmaschinen finden „pumpfoil mast länge anfänger" → pumpfoil.org) — aber display_names
   und Inhalte werden öffentlich. Empfehlung: ja für die Sachbereiche, mit Hinweis beim
   Posten; entscheidet aber die Datenschutz-Linie, also du.
2. **Platz in der Navigation** (Mobile-Nav ist voll): eigener Tab (welcher fliegt?) oder
   unter Community/Foilers als Unterseite?
3. **Spot-Chat vs. Spot-Threads**: nebeneinander lassen (Empfehlung) oder Spot-Chat langfristig
   ins Forum überführen?
4. **Startbereiche**: reichen die fünf aus § 3, oder anders geschnitten?
5. **Wann**: nach der App-Release-Welle einsortieren — v1 konkurriert um dieselbe Zeit wie
   Detektor-v2-Feinschliff und die offenen Uhren-Themen.
