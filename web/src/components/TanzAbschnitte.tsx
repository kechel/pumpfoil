// Tanz-Abschnitte einer eigenen Tanz-Session (Tanz-App watch-dance/, Jan 21.10.2026): die Uhr erkennt
// Abschnitte und schlaegt einen Tanz vor, hier wird er bestaetigt oder korrigiert. Nur Jans
// Tanz-Experiment (sport == "dance", nur Besitzer) — deshalb bewusst nur deutsche Texte.
import { useEffect, useState } from "react";
import { api, type TanzAbschnitt } from "../lib/api";

const NAMEN: Record<string, string> = {
  lw: "Langsamer Walzer", tango: "Tango", ww: "Wiener Walzer", slowfox: "Slowfox", quickstep: "Quickstep",
  samba: "Samba", chacha: "Cha-Cha-Cha", rumba: "Rumba", paso: "Paso Doble", jive: "Jive",
  salsa: "Salsa", bachata: "Bachata", discofox: "Disco-Fox", boogie: "Boogie", kein: "Kein Tanz",
};
const QUELLE: Record<string, string> = {
  auto: "nur erkannt", bestaetigt: "an der Uhr bestätigt", geaendert: "an der Uhr geändert",
  manuell: "an der Uhr gewählt", nachtraeglich: "danach an der Uhr gewählt", marker: "laut deinem Marker",
  web: "hier korrigiert", nachanalyse: "neu ausgewertet", beschreibung: "neu ausgewertet · laut Beschreibung",
  marker_ohne_erkennung: "dein Marker, Uhr erkannte nichts",
};

function uhrzeit(startedAt: string, ms: number) {
  return new Date(new Date(startedAt).getTime() + ms).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

export function TanzAbschnitte({ sessionId, startedAt }: { sessionId: number; startedAt: string }) {
  const [abschnitte, setAbschnitte] = useState<TanzAbschnitt[] | null>(null);
  const [taenze, setTaenze] = useState<string[]>([]);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    api.tanzAbschnitte(sessionId).then((d) => { setAbschnitte(d.abschnitte); setTaenze(d.taenze); })
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
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-400">
            <th className="py-1 pr-2 font-medium">Zeit</th>
            <th className="py-1 pr-2 font-medium">Tanz</th>
            <th className="py-1 pr-2 font-medium">Erkennung</th>
            <th className="py-1 font-medium">Stand</th>
          </tr>
        </thead>
        <tbody>
          {abschnitte.map((a, i) => (
            <tr key={i} className="border-t border-slate-800">
              <td className="py-1.5 pr-2 whitespace-nowrap">
                {uhrzeit(startedAt, a.start_ms)}–{a.ende_ms != null ? uhrzeit(startedAt, a.ende_ms) : "…"}
              </td>
              <td className="py-1.5 pr-2">
                <select className="rounded border border-slate-700 bg-slate-900 px-1 py-0.5"
                  value={a.gewaehlt ?? ""} onChange={(e) => aendern(i, e.target.value || null)}>
                  <option value="">– offen –</option>
                  {taenze.map((k) => <option key={k} value={k}>{NAMEN[k] ?? k}</option>)}
                </select>
              </td>
              <td className="py-1.5 pr-2 text-slate-400">
                {a.vorschlag ? NAMEN[a.vorschlag] ?? a.vorschlag : "–"}
                {a.tempo ? ` · ${a.tempo}/min` : ""}
              </td>
              <td className="py-1.5 text-slate-400">{QUELLE[a.quelle] ?? a.quelle}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {fehler && <p className="mt-2 text-sm text-red-700 dark:text-red-400">{fehler}</p>}
    </section>
  );
}
