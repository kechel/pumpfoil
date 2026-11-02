// Alle Team-Events als Uebersicht, endlos scrollend (Jan, 01.11.2026): erst laufende, dann kommende, dann vergangene.
// Nur Events, die man oeffnen darf (oeffentliche, freigegebene Teams und eigene Teams) — s. api/teams.py liste_events_alle.
// Nachladen wie in FoilDetail/Sessions: IntersectionObserver auf einen Fuehler unter der Liste, 300 px Vorlauf.
import { useEffect, useRef, useState } from "react";
import { api, TeamEventKurz } from "../lib/api";
import EventKurzKachel from "../components/EventKurzKachel";
import { useI18n } from "../i18n";

const SEITE = 20;

export default function EventsAlle() {
  const { t } = useI18n();
  const [events, setEvents] = useState<TeamEventKurz[] | null>(null);
  const [mehr, setMehr] = useState(true);
  const fuehler = useRef<HTMLDivElement>(null);
  const offset = useRef(0);
  const mehrDa = useRef(true);
  const laedt = useRef(false);

  async function seiteHolen() {
    if (laedt.current || !mehrDa.current) return;
    laedt.current = true;
    try {
      const neu = await api.teamsEventsAlle(offset.current, SEITE);
      offset.current += neu.length;
      if (neu.length < SEITE) { mehrDa.current = false; setMehr(false); }
      setEvents((alt) => [...(alt ?? []), ...neu]);
    } catch {
      mehrDa.current = false; setMehr(false);
      setEvents((alt) => alt ?? []);
    } finally {
      laedt.current = false;
    }
  }

  useEffect(() => {
    seiteHolen();
    const obs = new IntersectionObserver((e) => { if (e[0].isIntersecting) seiteHolen(); }, { rootMargin: "300px" });
    if (fuehler.current) obs.observe(fuehler.current);
    return () => obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="w-full">
      <h2 className="mb-3 text-xl font-bold text-slate-100">{t("team.alleEvents")}</h2>
      {events === null ? <p className="text-sm text-slate-400">{t("common.loading")}</p>
        : events.length === 0 ? <p className="text-sm text-slate-400">{t("team.alleEventsLeer")}</p> : (
          <div className="grid gap-2 sm:grid-cols-2">
            {events.map((e) => <EventKurzKachel key={`${e.team.slug}-${e.id}`} e={e} />)}
          </div>
        )}
      <div ref={fuehler} className="h-8" />
      {mehr && events !== null && events.length > 0 && <p className="text-center text-xs text-slate-400">{t("common.loading")}</p>}
    </div>
  );
}
