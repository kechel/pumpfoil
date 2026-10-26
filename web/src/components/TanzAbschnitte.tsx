// Tanz-Abschnitte einer eigenen Tanz-Session (Tanz-App watch-dance/, Jan 21.10.2026): die Uhr erkennt
// Abschnitte und schlaegt einen Tanz vor, hier wird er bestaetigt oder korrigiert. Nur Jans
// Tanz-Experiment (sport == "dance", nur Besitzer) — deshalb bewusst nur deutsche Texte.
import { useEffect, useState } from "react";
import { api, type TanzAbschnitt } from "../lib/api";

const NAMEN: Record<string, string> = {
  lw: "Langsamer Walzer", tango: "Tango", ww: "Wiener Walzer", slowfox: "Slowfox", quickstep: "Quickstep",
  samba: "Samba", chacha: "Cha-Cha-Cha", rumba: "Rumba", paso: "Paso Doble", jive: "Jive",
  salsa: "Salsa", bachata: "Bachata", discofox: "Disco-Fox", boogie: "Boogie", ueben: "Üben", kein: "Kein Tanz",
};
const QUELLE: Record<string, string> = {
  auto: "nur erkannt", bestaetigt: "an der Uhr bestätigt", geaendert: "an der Uhr geändert",
  manuell: "an der Uhr gewählt", nachtraeglich: "danach an der Uhr gewählt", marker: "laut deinem Marker",
  web: "hier korrigiert", nachanalyse: "neu ausgewertet", beschreibung: "neu ausgewertet · laut Beschreibung",
  marker_ohne_erkennung: "dein Marker, Uhr erkannte nichts",
};

// Auswahl (Jan, 25.10.2026): die drei besten der Server-Erkennung nach Sicherheit zuerst, danach alle
// anderen alphabetisch, „Üben" und „Kein Tanz" zuletzt (beide kein Tanz-Muster, Server: tanz.OHNE_TANZ).
const OHNE_TANZ = ["ueben", "kein"];
function auswahl(taenze: string[], top: { tanz: string; prozent: number }[]) {
  const oben = top.filter((t) => taenze.includes(t.tanz));
  const rest = taenze.filter((k) => !OHNE_TANZ.includes(k) && !oben.some((t) => t.tanz === k))
    .sort((a, b) => (NAMEN[a] ?? a).localeCompare(NAMEN[b] ?? b, "de"));
  return { oben, rest: [...rest, ...OHNE_TANZ.filter((k) => taenze.includes(k))] };
}

function uhrzeit(startedAt: string, ms: number) {
  return new Date(new Date(startedAt).getTime() + ms).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

export function TanzAbschnitte({ sessionId, startedAt }: { sessionId: number; startedAt: string }) {
  const [abschnitte, setAbschnitte] = useState<TanzAbschnitt[] | null>(null);
  const [taenze, setTaenze] = useState<string[]>([]);
  const [version, setVersion] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    api.tanzAbschnitte(sessionId).then((d) => { setAbschnitte(d.abschnitte); setTaenze(d.taenze); setVersion(d.server_version ?? null); })
      .catch(() => setAbschnitte([]));
  }, [sessionId]);

  if (!abschnitte || abschnitte.length === 0) return null;

  const aendern = (index: number, gewaehlt: string | null) => {
    setFehler(null);
    api.tanzKorrigieren(sessionId, [{ index, gewaehlt }])
      .then((d) => setAbschnitte(d.abschnitte))
      .catch(() => setFehler("Speichern hat nicht geklappt."));
  };

  return (
    <section className="rounded-xl border border-slate-800 p-4">
      <h3 className="font-semibold mb-2">Tänze</h3>
      <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-400">
            <th className="py-1 pr-2 font-medium">Zeit</th>
            <th className="py-1 pr-2 font-medium">Tanz</th>
            <th colSpan={2} className="py-1 pr-3 font-medium whitespace-nowrap"
              title="Was die Uhr-Rechnung (Tanz-App) zu diesem Abschnitt sagen würde, aus den Rohdaten; % = Sicherheit unter den bekannten Mustern">
              Uhr
            </th>
            <th colSpan={2} className="py-1 pr-3 font-medium whitespace-nowrap"
              title="Erkennung nur am Server, mit Versionsnummer des Verfahrens; % = Sicherheit unter den bekannten Mustern">
              Server{version ? ` ${version}` : ""}
            </th>
            <th className="py-1 font-medium">Stand</th>
          </tr>
        </thead>
        <tbody>
          {/* Nach Uhrzeit sortiert (Jan, 25.10.2026): Marker-Zeilen stehen in der DB hinter den Abschnitten;
              die Korrektur geht weiter an den Index der DB-Reihenfolge */}
          {abschnitte.map((a, i) => ({ a, i })).sort((x, y) => x.a.start_ms - y.a.start_ms || x.i - y.i).map(({ a, i }) => {
            const top = a.server_top3 ?? [];
            const wahl = auswahl(taenze, top);
            return (
            <tr key={i} className="border-t border-slate-800">
              <td className="py-1.5 pr-2 whitespace-nowrap align-top">
                {uhrzeit(startedAt, a.start_ms)}–{a.ende_ms != null ? uhrzeit(startedAt, a.ende_ms) : "…"}
              </td>
              <td className="py-1.5 pr-2 align-top">
                <select className="rounded border border-slate-700 bg-slate-900 px-1 py-0.5"
                  value={a.gewaehlt ?? ""} onChange={(e) => aendern(i, e.target.value || null)}>
                  <option value="">– offen –</option>
                  {wahl.oben.map((t) => (
                    <option key={t.tanz} value={t.tanz}>{NAMEN[t.tanz] ?? t.tanz} · {t.prozent} %</option>
                  ))}
                  {wahl.oben.length > 0 && <option disabled>──────</option>}
                  {wahl.rest.map((k) => <option key={k} value={k}>{NAMEN[k] ?? k}</option>)}
                </select>
              </td>
              {/* Je Verfahren zwei Spalten (Tanz | %), die drei besten untereinander (Jan, 25.10.2026) */}
              {[a.uhr_top3 ?? [], top].map((liste, j) => {
                const farbe = (k: string) => (a.gewaehlt && k === a.gewaehlt
                  ? "text-emerald-700 dark:text-emerald-400" : "text-slate-400");
                return [
                  <td key={j + "t"} className="py-1.5 pr-2 whitespace-nowrap align-top">
                    {liste.length ? liste.map((t) => <div key={t.tanz} className={farbe(t.tanz)}>{NAMEN[t.tanz] ?? t.tanz}</div>)
                      : <span className="text-slate-400">–</span>}
                  </td>,
                  <td key={j + "p"} className="py-1.5 pr-3 whitespace-nowrap align-top text-right tabular-nums">
                    {liste.map((t) => <div key={t.tanz} className={farbe(t.tanz)}>{t.prozent} %</div>)}
                  </td>,
                ];
              })}
              <td className="py-1.5 text-slate-400 align-top">{QUELLE[a.quelle] ?? a.quelle}</td>
            </tr>
            );
          })}
        </tbody>
      </table>
      </div>
      {fehler && <p className="mt-2 text-sm text-red-700 dark:text-red-400">{fehler}</p>}
    </section>
  );
}
