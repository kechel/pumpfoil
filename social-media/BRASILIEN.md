# Brasilien — ein Trichter-Problem, kein Reichweiten-Problem

Anlass war Jans Einwand am 08.09.2026: Brasilien habe eine grosse Foiling-Szene, und es
gebe **keinen einzigen brasilianischen App-Nutzer**. Stimmt. Nur liegt es nicht an
fehlender Reichweite.

| Kanal | Brasilien |
|---|---|
| **Facebook** (1.696 Follower) | **30,3 % — das groesste Land**, vor Polen 13,3 %, Frankreich 12,6 %, USA 11,1 %, Deutschland 8,7 % |
| Instagram (280 Follower) | 7 Follower, 335 erreicht im Monat |

Rund **510 brasilianische Facebook-Follower — und null App-Nutzer.** Ein weiterer Kanal
fuellt oben nach, wo unten nichts ankommt.

Zur Einordnung von Instagram: die erreichten Konten dort sind Iran (27.066), Tuerkei
(15.522), Usbekistan (3.817), Irak (2.981). Das ist keine Zielgruppe, das ist Ausspielung
ins Leere — die 267.972 Aufrufe des Kanals sagen ueber Brasilien nichts.

## Was NICHT die Ursache ist (geprueft)

- **Die iOS-App ist im brasilianischen App Store.** `org.pumpfoil.coolwatch`, ueber die
  iTunes-Lookup-API in `br` bestaetigt.
- **Die Website gibt es auf brasilianischem Portugiesisch.** Seit 08.09. sauber getrennt:
  `web/src/i18n/locales/pt.ts` ist brasilianisch, `pt-PT.ts` europaeisch (Vollfassung,
  1.645 Schluessel, 465 abweichende Werte). Vorher standen 36 europaeische Marker in der
  einen gemeinsamen Datei.
- **Die YouTube-Kanalbeschreibung** lag bis 08.09. unter dem Schluessel `pt_BR`, trug aber
  den europaeischen Text — wer aus Brasilien vom Video aufs Profil klickte, bekam
  Portugal-Portugiesisch. Getauscht; seit 09.09. haben auch alle 172 Videotexte beide
  Fassungen (siehe `brand/social/kanal-beschreibung-README.md`).

## Was plausibel die Ursache ist — ungeprueft, aber pruefbar

1. **Die Uhr steht im Vordergrund.** `land.h1` lautet „grava e analisa pump foil com o teu
   relógio desportivo". In Brasilien sind Garmin und Apple Watch wegen der Importsteuern
   deutlich teurer als hier. Dass die App **auch ohne Uhr** mit dem Handy aufzeichnet, ist
   fuer Brasilien der entscheidende Satz — und er steht nicht vorn.
2. **Die Endcard ist englisch** („FREE APP & COMMUNITY"), auch unter Videos, die zu 60 %
   in Brasilien laufen.

Beides ist eine Aenderung an einer Stelle, die man messen kann. Erst danach lohnt es sich,
ueber weitere Kanaele zu reden.

## Kwai: dagegen entschieden (09.09.2026)

Kwai ist die internationale Fassung von Kuaishou (快手) und in Brasilien gross — rund
60 Mio. monatlich aktive Nutzer, gut 75 Minuten am Tag. Wir machen es trotzdem nicht.

- **Demografisch der schlechteste Treffer von allen.** Kwai Brasilien: **46 % Klassen D/E,
  29 % C, 18 % A/B.** Ein Pumpfoil-Setup kostet 1.500–3.000 €. Die brasilianische
  Wassersport-Szene lebt auf **Instagram** (Medina, Ítalo, die Schulen und Marken),
  **YouTube** und in **Facebook-Gruppen** — alles Kanaele, die wir haben.
- **Es bringt Volumen, nicht Jugend.** 77 % der Kwai-Nutzer sind 25+.
- **Der Aufwand ist real.** `kwai.com` war aus Deutschland nicht erreichbar (Jan hat es am
  07.09. ohne VPN vielfach probiert, am 08.09. ueber das Opera-VPN mit schwedischem Ausgang
  beim ersten Versuch). Ein Upload im Browser gibt es nicht, es liefe ueber einen
  Android-Emulator; dazu ein bezahltes System-VPN. Kennzahlen gaebe es nur von Hand aus der
  gespeicherten Seite, wie bei der Facebook Content Library.
- **Falsche Reihenfolge.** Erst den Trichter fuer die 510 Brasilianer reparieren, die schon
  da sind.

**Im Code ist Kwai am 09.09. restlos entfernt** — das Caption-Feld im Prompt, die Zeile im
Studio, das Feld in `api.ts`, die Farbe im CSS. Der frueher hier stehende Betriebsteil
(Emulator-Weg, VPN-Details, vorbereitetes Kurzprofil und die portugiesischen
Bildunterschriften) ist mit entfallen; er steht in der Git-Historie von `KWAI.md`.
