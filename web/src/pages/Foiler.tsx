// Oeffentliche Foiler-Seite EINES Nutzers — sichtbar fuer angemeldete Foiler, nicht fuer
// Suchmaschinen (der Endpunkt verlangt eine Anmeldung).
//
// Zur Sessionliste: am 04.09.2026 war entschieden, dass es keine Liste je Nutzer gibt (aus
// gebuendelten Sessions liest man Spot, Wochentage und Uhrzeiten ab). Am 08.09.2026 hat Jan fuer
// diese Seite die letzten FUENF ausdruecklich gewollt — fuenf sind kein Archiv, und jede davon
// steht mit Name, Spot und Uhrzeit ohnehin im Community-Feed. Eine vollstaendige Liste bleibt
// unerwuenscht; die Grenze zieht der Server, nicht diese Seite.
//
// Welche Bloecke erscheinen, entscheidet der SERVER anhand der Schalter des Nutzers. Diese Seite
// prueft nichts nachtraeglich: fehlt ein Feld, wird es nicht gezeigt.
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, OverallStats } from "../lib/api";
import { Card, Avatar } from "../components/ui";
import { ScrollToTop } from "../components/ScrollToTop";
import { SessionCard } from "../components/SessionCard";
import { PlayIcon } from "../components/Icons";
import { SessionStats } from "./Sessions";
import { foilLabel } from "../lib/foilLabel";
import { useT, useNumberFormat } from "../i18n";
import { fmtDate } from "../lib/time";

// Bewusst dieselbe Formel wie auf der eigenen Startseite (`PersonalHome.fmtDur`) — eine zweite
// Schreibweise fuer dieselbe Zahl liest sich wie ein anderer Wert.
function fmtDur(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

// Setup-Labels wie in der eigenen Sessionliste — die Karte formatiert nichts selbst.
const setupLabels = (s: { setup?: { stab?: { brand: string; model: string; size: string } | null;
                                   mast_len_cm?: number | null;
                                   board?: { name: string } | null } | null }) => ({
  stab: s.setup?.stab ? `${s.setup.stab.brand} ${s.setup.stab.model} ${s.setup.stab.size}`.trim() : null,
  mast: s.setup?.mast_len_cm ? `${s.setup.mast_len_cm} cm` : null,
  board: s.setup?.board?.name || null,
});

// YouTube-ID aus jeder gaengigen URL-Form — nur fuer das Vorschaubild von UNSEREM Server.
function ytId(url: string | null | undefined): string | null {
  const m = (url || "").match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([A-Za-z0-9_-]{6,16})/);
  return m ? m[1] : null;
}

export default function Foiler() {
  const { id } = useParams();
  const t = useT();
  const nf = useNumberFormat();
  const [d, setD] = useState<Awaited<ReturnType<typeof api.foilerProfil>> | null>(null);
  const [fehler, setFehler] = useState(false);

  useEffect(() => {
    setD(null); setFehler(false);
    api.foilerProfil(Number(id)).then(setD).catch(() => setFehler(true));
  }, [id]);

  if (fehler) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <p className="text-sm text-slate-400">{t("foiler.notFound")}</p>
      </div>
    );
  }
  if (!d) return <div className="mx-auto max-w-3xl p-6 text-sm text-slate-400">{t("common.loading")}</div>;

  const r = d.rekorde?.records;
  // Dieselben Kacheln und dieselbe Formatierung wie auf der eigenen Startseite — driftet die
  // Darstellung auseinander, wirken es zwei verschiedene Zahlen.
  const rekorde: { label: string; wert: number | undefined; fmt: (v: number) => string; datum?: string | null; tz?: string | null }[] = [
    { label: t("rec.farthestRun"), wert: r?.distance?.value, fmt: (v) => `${Math.round(v)} m`, datum: r?.distance?.started_at, tz: (r?.distance as any)?.tz },
    { label: t("rec.longestRun"), wert: r?.duration?.value, fmt: (v) => `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, "0")}`, datum: r?.duration?.started_at, tz: (r?.duration as any)?.tz },
    { label: t("rec.topSpeed"), wert: r?.speed?.value, fmt: (v) => `${(v * 3.6).toFixed(1)} km/h`, datum: r?.speed?.started_at, tz: (r?.speed as any)?.tz },
    { label: t("rec.longestGlide"), wert: r?.glide?.value, fmt: (v) => `${v.toFixed(1)} s`, datum: r?.glide?.started_at, tz: (r?.glide as any)?.tz },
    { label: t("rec.mostRuns"), wert: r?.runs?.value, fmt: (v) => `${Math.round(v)}`, datum: r?.runs?.started_at, tz: (r?.runs as any)?.tz },
  ];
  const s: OverallStats | undefined = d.rekorde;
  const summen = s ? [
    { label: t("side.sessions"), wert: String(s.count) },
    { label: t("stat.runs"), wert: String(s.runs_total) },
    { label: t("side.foiling"), wert: `${s.foiling_km.toFixed(1)} km` },
    { label: t("side.foilingTime"), wert: fmtDur(s.foiling_min) },
    { label: t("side.pumps"), wert: nf(s.pumps) },
  ] : [];

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-6">
      <ScrollToTop />
      {/* Nur der Besitzer sieht diesen Hinweis — sonst waere „ist abgeschaltet" selbst eine
          Auskunft ueber ein fremdes Konto. Der Server liefert `aus` deshalb auch nur ihm. */}
      {d.ich && d.aus && (
        <Card className="mb-4 p-3 text-sm text-amber-700 dark:text-amber-300">
          {t("foiler.offHint")} <Link to="/einstellungen" className="underline">{t("nav.profile")}</Link>
        </Card>
      )}

      <div className="mb-5 flex items-center gap-3">
        <Avatar name={d.name} url={d.avatar_url} seed={d.id} size={56} />
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold">{d.name ?? "—"}</h1>
          {d.seit && (
            <p className="text-sm text-slate-400">
              {t("foiler.since", { date: fmtDate(d.seit, null, { day: "2-digit", month: "long", year: "numeric" }) })}
            </p>
          )}
        </div>
      </div>

      {/* Angaben als zweispaltiges Raster: die Werte stehen dadurch UNTEREINANDER auf einer
          Kante, egal wie lang das Label ist (Jan, 08.09.2026). Die Label-Spalte waechst mit dem
          laengsten Label mit (max-content), deshalb funktioniert das auch in 17 Sprachen. */}
      <div className="mb-5 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1.5 text-sm">
        {d.homespot && (
          <>
            <span className="text-slate-400">{t("foiler.homespot")}:</span>
            <span className="text-slate-300">
              {/* Der Homespot verlinkt auf den Spot, wenn wir ihn zuordnen konnten. */}
              {d.homespot_id
                ? <Link to={`/sessions?spot=${d.homespot_id}`} className="underline decoration-slate-500 hover:decoration-brand-400">{d.homespot}</Link>
                : d.homespot}
            </span>
          </>
        )}
        {d.uhren && d.uhren.length > 0 && (
          <>
            <span className="text-slate-400">{t("foiler.watch")}:</span>
            <span className="text-slate-300">{d.uhren.join(" · ")}</span>
          </>
        )}
        {d.foils && d.foils.length > 0 && (
          <>
            <span className="text-slate-400">{t("foiler.foil")}:</span>
            <span className="text-slate-300">{d.foils.map((f) => `${f.brand} ${f.model} ${f.size}`).join(" · ")}</span>
          </>
        )}
      </div>

      {d.zeigt.records && s && (
        <>
          <h2 className="mb-2 text-sm font-semibold text-slate-200">{t("foiler.records")}</h2>
          <div className="grid grid-cols-3 gap-1.5 lg:grid-cols-5">
            {rekorde.map((x) => (
              <Card key={x.label} className="h-full px-2.5 py-1.5">
                <div className="text-[11px] leading-tight text-slate-400">{x.label}</div>
                <div className="text-lg font-bold leading-tight tabular-nums text-brand-400">
                  {x.wert && x.wert > 0 ? x.fmt(x.wert) : "–"}
                </div>
                {x.wert && x.wert > 0 && x.datum && (
                  <div className="text-[10px] leading-tight tabular-nums text-slate-500">
                    {fmtDate(x.datum, x.tz ?? null, { day: "2-digit", month: "2-digit", year: "2-digit" })}
                  </div>
                )}
              </Card>
            ))}
            {summen.map((x) => (
              <Card key={x.label} className="h-full px-2.5 py-1.5">
                <div className="text-[11px] leading-tight text-slate-400">{x.label}</div>
                <div className="text-lg font-bold leading-tight tabular-nums text-brand-400">{x.wert}</div>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Medien: Fotos und verlinkte Videos an seinen Sessions. Ein Klick fuehrt in die
          Session — dort steht das Bild in seinem Zusammenhang, und das Video laeuft im
          Click-to-Load-Rahmen (youtube-nocookie). Deshalb hier bewusst KEINE Lightbox und kein
          eingebetteter Player: eine zweite Abspielstelle waere eine zweite Datenschutz-Baustelle.
          Vorschaubilder der Videos kommen ueber UNSEREN Server (/api/public/video-thumb). */}
      {d.zeigt.media && (d.medien?.length ?? 0) > 0 && (
        <div className="mt-6">
          <h2 className="mb-2 text-sm font-semibold text-slate-200">
            {t("foiler.media")} <span className="font-normal text-slate-400">({d.medien!.length})</span>
          </h2>
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-6">
            {d.medien!.map((m, i) => {
              const yt = m.youtube_url ? ytId(m.youtube_url) : null;
              const bild = m.kind === "video" ? (yt ? `/api/public/video-thumb/${yt}` : null) : (m.thumb_url || m.url);
              return (
                <Link key={`${m.kind}-${m.session_id}-${i}`} to={`/sessions/${m.session_id}`} className="group relative block">
                  {bild
                    ? <img src={bild} alt="" loading="lazy" className="aspect-square w-full rounded-lg object-cover transition-opacity group-hover:opacity-90" />
                    : <div className="aspect-square w-full rounded-lg bg-slate-800" />}
                  {m.kind === "video" && (
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white">
                        <PlayIcon className="h-4 w-4" />
                      </span>
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Spots, zu denen er eine Beschreibung geschrieben hat — der Link fuehrt an den Spot,
          wo die Beschreibung steht (mit allen anderen). */}
      {d.zeigt.spots && (d.spot_notizen?.length ?? 0) > 0 && (
        <div className="mt-6">
          <h2 className="mb-2 text-sm font-semibold text-slate-200">{t("foiler.spotNotes")}</h2>
          <div className="flex flex-wrap gap-2">
            {d.spot_notizen!.map((n) => (
              <Link key={n.spot_id} to={`/sessions?spot=${n.spot_id}`}
                    className="rounded-full border border-slate-700 px-3 py-1 text-sm text-slate-300 hover:border-brand-400 hover:text-brand-300">
                {n.name}{n.area_name ? ` · ${n.area_name}` : ""}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Die letzten fuenf — dieselbe Karte wie in der eigenen Sessionliste. */}
      {d.zeigt.sessions && (d.sessions?.length ?? 0) > 0 && (
        <div className="mt-6">
          <h2 className="mb-2 text-sm font-semibold text-slate-200">{t("foiler.lastSessions")}</h2>
          <div className="space-y-3">
            {d.sessions!.map((s) => (
              <SessionCard
                key={s.id}
                sessionId={s.id}
                startedAt={s.started_at}
                endedAt={s.ended_at}
                tz={s.tz}
                spot={s.place_name}
                foil={s.foil ? foilLabel(s.foil) : null}
                {...setupLabels(s)}
                deviceLabel={s.device_label}
                caption={s.caption}
                avatarName={d.name}
                avatarUrl={d.avatar_url}
                thumbUrl={s.thumb_url}
                photoCount={s.photo_count}
                youtubeUrl={s.youtube_url}
                videoUrl={s.video_url}
                likeCount0={s.like_count ?? 0}
                liked0={!!s.liked}
                trackPreview={s.track_preview}
                stats={s.analysis && <SessionStats a={s.analysis} />}
                sportClass={s.sport_class}
                dataQuality={s.data_quality}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
