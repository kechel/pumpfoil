import { passtZu } from "./suche";
// Freitextsuche im Material-Katalog — UNABHAENGIG von der Wortstellung.
//
// Anlass (24.08.): Meldung „fehlt im Katalog: Axis png 1300 v2". Der Fluegel stand drin, als
// `AXIS` / `PNG V2` / `1300` — nur suchten alle Oberflaechen mit EINEM `includes()` ueber
// „Marke Modell Groesse", und „png 1300 v2" ist darin nicht enthalten. Der Nutzer haette unsere
// Wortstellung erraten muessen, um sein eigenes Material zu finden.
//
// Wer sein Teil nicht findet, legt einen privaten Eintrag an — genau die Ursache der
// Katalog-Dopplungen vom 17.08. Deshalb: in Worte zerlegen, JEDES Wort muss vorkommen
// (Reihenfolge egal). Serverseitig macht `server/app/gearsearch.py` dasselbe.
export function gearMatches(text: string, query: string): boolean {
  // Seit 01.10.2026 dieselbe Regel wie alle Suchen (lib/suche.ts, Server app/suche.py): zusaetzlich
  // ohne Akzente, Bindestriche und Leerzeichen — „fone" findet F-One, „xover" X-Over.
  return passtZu(text, query);
}
