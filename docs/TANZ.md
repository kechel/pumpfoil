# Tanz — Erkennung, Muster und alles, was Jan dazu gesagt hat

Jans privates Experiment (nur seine fēnix 7X Pro, Sideload per USB). Ziel: Tänze am Handgelenk erkennen
und dafür **beschriftete Daten sammeln** — die Bestätigungen/Marker sind der eigentliche Zweck.

**HARTE REGEL (21.10.2026):** Code fließt nur Pumpfoil → Tanz (`watch/` → `watch-dance/`), NIE umgekehrt.
Tanz-Arbeit ändert nie die Pumpfoil-App; am Server nur eigene Module, nur für Tanz-Sessions.

## Wo was liegt

| Teil | Datei |
|---|---|
| Uhr-App | `watch-dance/` (Kopie von `watch/`, `DANCE`-Marken), Erkennung `watch-dance/source/Tanz.mc` |
| Pumpfoil-Änderungen übernehmen | `watch-dance/pumpfoil-uebernehmen.sh` (Stand in `watch-dance/PUMPFOIL_STAND`) |
| Erkennung am Server (gleiche Rechnung) | `server/app/tanz_analyse.py` |
| Abschnitte/Marker speichern, Web-Korrektur | `server/app/tanz.py`, `server/app/api/tanz.py`, `web/src/components/TanzAbschnitte.tsx` |
| **Wahrheit** (Jans Angaben je Session) | `server/app/data/tanz_wahrheit.json` |
| **Muster** je Tanz (abgeleitet) | `server/app/data/tanz_muster.json` — nie von Hand, neu ableiten |
| Muster ableiten + prüfen | `scripts/tanz_muster_ableiten.py` (`--schreiben`, `--uhr` = Block für Tanz.mc) |
| Sessions neu auswerten (Tabelle „Tänze“) | `scripts/tanz_nachanalyse.py --schreiben` |
| Marke | `brand-dance/` (Fuchsia #c026d3, Pflaume #1a0b1f) |

Ablauf nach neuen Daten: Wahrheit ergänzen (oder Marker-Session in `marker_sessions` eintragen) →
`tanz_muster_ableiten.py --schreiben` → `--uhr` ausgeben und den MUSTER-Block in `Tanz.mc` ersetzen
(der Test `test_tanz_analyse.py::test_muster_auf_der_uhr_wie_in_der_json` erzwingt das) →
`tanz_nachanalyse.py --schreiben` → Uhr bauen.

## Jans Hinweise (wörtlich bzw. sinngemäß, mit Datum) — nicht verlieren

- **15.10.** Uhr immer **links** = Führungshand (Jan führt).
- **15.10.** Kurs #16753: erste Stunde Langsamer Walzer, danach Jive; viele Pausen (Erklären, ohne Musik üben).
- **16.10.** „das gps ist da wirklich nervig“ → Tanz-App ohne GPS.
- **21.10.** „11 von 58 Minuten wirklich am Tanzen ist nicht unbedingt falsch, im Tanzkurs kann das so
  vorkommen“ → wenig erkannte Tanzzeit im Kurs ist kein Fehler.
- **21.10.** Anzeige: nur Uhrzeit + ob/welcher Tanz erkannt ist; HOCH/RUNTER ändern, START bestätigt
  („passt“), START halten beendet wie gehabt (Beenden-Bildschirm erst nach mehr als einem Klick);
  ZURÜCK verwirft die Auswahl. Ersichtlich sein muss, ob etwas **erkannt** ist (bestätigen sinnvoll)
  oder nur ein **Marker**.
- **21.10.** „der manuelle marker war natürlich nicht während des Tanzes sondern kurz danach“ und
  „die marker können vorher oder hinterher oder zwischen Tänzen gesetzt werden, das wird jeder anders
  machen, also ist das nur ein Indikator“ → **Uhr speichert Marker roh, deutet nicht.** Die Deutung
  („Jan markiert danach“) steckt nur am Server (`tanz_analyse.marker_deuten`) und gilt für Jan.
- **21.10.** #17689: allein zur Musik getanzt, Arm „in Tanzhaltung und so wie beim Führen“ bewegt;
  Marker immer NACH dem Tanz. Die Uhr hatte mehrmals Falsches erkannt.
- **21.10.** „wir wollen alles nutzen was wir können, ggf. auch Unterscheidung vertikal vs.
  horizontal“, Muster festhalten, Hinweise merken für spätere Anpassungen und Verifizierungen.
- **21.10.** Aktuelle bpm (Rhythmus der Uhr) in der Anzeige und alle x Sekunden speichern; Puls dazu.
- Menü/Startbildschirm: nur Verbinden + Upload; keine Foils, kein Auto-Start, keine eigenen Layouts
  „bis wir vielleicht irgendwann Custom Layouts haben fürs Tanzen“.

## Was gemessen wird (je 10-s-Fenster, Uhr und Server gleich)

- **Bewegung** = Streuung des Accel-Betrags; tanzend ab 0,08 g **und** Rhythmus-Klarheit ≥ 0,15.
- **Tempo** = Autokorrelation der **senkrechten** Beschleunigung, 40–250/min (bis 21.10. erst ab 71 —
  Wiener Walzer ~57 und Rumba ~48 fielen dadurch ganz heraus).
- **Quer** = Streuung waagrecht / senkrecht (Arm führt seitlich vs. federt).
- **Drehung** = Kreisel um die Senkrechte, Umdrehungen je 10 s (Kreisel seit Tanz-App 16.10.).
- **Puls** = eigener Kanal `hr`, ~1 Wert/s, auch ohne GPS (seit 16.10.).
- Ab Tanz-App 0.5 speichert die Uhr diese Werte je Fenster (`tanz_fenster`, gepackt) → Abgleich
  Uhr-Rechnung gegen Server-Rechnung möglich.
- Abschnitt: Beginn bei 3 von 4 tanzenden Fenstern (≥ 30 s Tanz, Anzeige nach 30–40 s), Ende nach
  4 ruhigen (40–50 s).

## Befunde (Stand 21.10.2026)

- **Gemessen wird der Schrittrhythmus, nicht der Musiktakt** — oft eine Bewegung je Takt oder je zwei
  Schläge: Wiener Walzer 57 (58–60 Takte/min), Quickstep 105 (½ von ~205), Salsa 87 (½ von ~175),
  Rumba 48 (½ von ~100). Verdopplung/Halbierung kommt vor → beim Vergleich mit Aufschlag erlaubt.
- **Salsa ist über Tage stabil** (Kurs 15.10. und allein 21.10. beide ~87) — bisher der einzige Tanz,
  der von einer Quelle auf eine andere wiedererkannt wird.
- **Langsamer Walzer schwankt** (Kurs 92, allein 56–66). Wiener Walzer: am meisten Drehung.
- **Kurs (Paar) ≠ allein**: Haltung und Drehung unterscheiden sich; Muster aus beiden mischen.
- Prüfung „ohne eigene Quelle“ (`tanz_muster_ableiten.py`): nur Salsa 2/2; die meisten Tänze haben
  erst **eine** Quelle und sind damit nicht unabhängig prüfbar. Die Nachanalyse-Tabellen sind mit
  Mustern aus denselben Daten gerechnet → **zu gut**, nur zum Ansehen.
- Ohne eigene Daten (aus Musiktempo geschätzt, schwach gewichtet): Slowfox, Paso Doble, Disco-Fox, Bachata.

## Offene Fragen / nächste Schritte

- Mehrere Abende je Tanz, im Kurs (Paar) und allein, jeweils mit Markern.
- Takt (3/4 gegen 4/4) als Merkmal (erste Sichtung 15.10.: Walzer-Fenster mit Dreier-Muster).
- Mehrere Tänze ohne Pause werden als EIN Abschnitt erkannt; am Server an Markern geteilt, auf der Uhr nicht.
- Ob die verteilte Rechnung auf der Uhr (je Paket ≤ 10 Abstände) in Echtzeit mitkommt: an `tanz_fenster`
  (Lücken?) prüfen.
