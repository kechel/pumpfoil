import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type CommunityRecords, type SessionSummary } from "../lib/api";
import { Card, Spinner } from "../components/ui";
import { ChevronIcon, FoilIcon } from "../components/Icons";
import { SessionCard } from "../components/SessionCard";
import { SessionStats } from "./Sessions";
import { RecordGrid } from "./Home";
import { foilLabel } from "../lib/foilLabel";
import { useT } from "../i18n";

/**
 * Ein Foil im Einzelnen: die Community-Rekorde, die MIT DIESEM Flügel gefahren wurden, und
 * darunter meine eigenen Sessions damit.
 *
 * Kam als Nutzer-Vorschlag (04.09.): „Why not make the foil model clickable, so clicking it
 * shows all sessions recorded with that specific front wing?" — und auf Jans Wunsch stehen die
 * Rekord-Tabs der Community mit drüber, für genau dieses Foil.
 *
 * Server-seitig brauchte das keinen neuen Endpunkt: die Rekorde kennen das synthetische Band
 * `foil:<id>` (s. `community._band_filter`), die Sessionliste den Parameter `foil_id`.
 */
export default function FoilDetail() {
  const t = useT();
  const { foilId } = useParams();
  const fid = Number(foilId);
  const [rec, setRec] = useState<CommunityRecords | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  // Seitenweise nachladen beim Scrollen — dieselbe Mechanik wie in der Sessionliste
  // (IntersectionObserver auf einen Fuehler unter der Liste, 300 px Vorlauf).
  const SEITE = 20;
  const fuehler = useRef<HTMLDivElement>(null);
  const offset = useRef(0);
  const mehrDa = useRef(true);
  const laedt = useRef(false);
  const [mehr, setMehr] = useState(true);
  // Der Name kommt aus der Foil-Statistik — dieselbe Quelle wie die Tabelle, aus der man hier
  // hereinklickt. Ein eigener Endpunkt nur für drei Textfelder wäre Verschwendung.
  const [kopf, setKopf] = useState<{ name: string; ar: number | null; sessions: number; users: number } | null>(null);

  async function seiteHolen() {
    if (laedt.current || !mehrDa.current || !fid) return;
    laedt.current = true;
    try {
      const teil = await api.sessions({ foilId: fid, limit: SEITE, offset: offset.current });
      offset.current += teil.length;
      mehrDa.current = teil.length === SEITE;
      setMehr(mehrDa.current);
      setSessions((prev) => [...(prev ?? []), ...teil]);
    } catch {
      mehrDa.current = false; setMehr(false);
      setSessions((prev) => prev ?? []);
    } finally {
      laedt.current = false;
    }
  }

  useEffect(() => {
    if (!fid) return;
    // Rekorde bewusst mit accel_only=false: bei einem einzelnen Foil ist der Topf klein, und ein
    // GPS-only-Lauf ist hier immer noch die beste bekannte Marke (auf der Community-Seite steht
    // die Umschaltung dafür zur Verfügung, hier wäre sie ein weiterer Regler ohne Nutzen).
    api.communityRecords(false, "pumpfoil", `foil:${fid}`).then(setRec).catch(() => setRec(null));
    api.foilStats().then((rows) => {
      const r = rows.find((x) => x.foil_id === fid);
      if (r) setKopf({ name: `${r.brand} ${r.model} ${r.size}`.trim(), ar: r.aspect_ratio,
                       sessions: r.sessions, users: r.users });
    }).catch(() => {});
    offset.current = 0; mehrDa.current = true; setSessions(null);
    seiteHolen();
    const obs = new IntersectionObserver((e) => { if (e[0].isIntersecting) seiteHolen(); },
                                         { rootMargin: "300px" });
    if (fuehler.current) obs.observe(fuehler.current);
    return () => obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fid]);

  return (
    <div className="w-full">
      <Link to="/foil-stats" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-300 hover:text-slate-200">
        <ChevronIcon className="h-4 w-4 rotate-180" /> {t("foilStats.title")}
      </Link>

      <h2 className="mb-1 flex items-center gap-2 text-xl font-bold">
        <FoilIcon className="h-6 w-6 text-brand-400" />
        {kopf?.name ?? t("foilDetail.title")}
      </h2>
      {kopf && (
        <p className="mb-4 text-sm text-slate-400">
          {kopf.ar != null ? `AR ${kopf.ar.toLocaleString()} · ` : ""}
          {t("foilDetail.community", { sessions: String(kopf.sessions), users: String(kopf.users) })}
        </p>
      )}

      {/* Community-Rekorde für GENAU dieses Foil — nur die Kacheln, ohne Zeitfenster-Tabs
          (Jan, 04.09.: „nicht alle Rekorde, nur oben die Kacheln"). Allzeit ist hier das
          richtige Fenster: bei einem einzelnen Flügel ist der Topf klein, „heute" waere fast
          immer leer. */}
      <h3 className="mb-2 text-lg font-bold">{t("foilDetail.records")}</h3>
      {rec ? <RecordGrid rec={rec.all} showSpot /> : <Spinner />}

      {/* Meine eigenen Sessions mit diesem Foil. */}
      <h3 className="mb-2 mt-8 text-lg font-bold">
        {t("foilDetail.mySessions")}
        {sessions && (
          <span className="ml-2 text-sm font-normal text-slate-400">
            ({sessions.length}{mehr ? "+" : ""})
          </span>
        )}
      </h3>
      {!sessions ? (
        <Spinner />
      ) : sessions.length === 0 ? (
        <Card className="p-6 text-center text-slate-300">{t("foilDetail.noneMine")}</Card>
      ) : (
        <div className="space-y-3">
          {sessions.map((s) => (
            <SessionCard
              key={s.id}
              sessionId={s.id}
              owned={s.owned ?? true}
              startedAt={s.started_at}
              tz={s.tz}
              endedAt={s.ended_at}
              spot={s.place_name}
              foil={s.foil ? foilLabel(s.foil) : null}
              deviceLabel={s.device_label}
              caption={s.caption}
              thumbUrl={s.thumb_url}
              photoCount={s.photo_count}
              youtubeUrl={s.youtube_url}
              videoUrl={s.video_url}
              likeCount0={s.like_count ?? 0}
              liked0={!!s.liked}
              trackPreview={s.track_preview}
              sportClass={s.sport_class}
              dataQuality={s.data_quality}
              stats={s.analysis ? <SessionStats a={s.analysis} /> : null}
            />
          ))}
        </div>
      )}
      {/* Fuehler fuer das Nachladen: liegt immer im Baum, damit der Observer ihn beim ersten
          Rendern schon findet. */}
      <div ref={fuehler} className="h-8" />
      {sessions && sessions.length > 0 && !mehr && (
        <p className="py-2 text-center text-xs text-slate-500">{t("sessions.listEnd")}</p>
      )}
    </div>
  );
}
