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
import { Fragment, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, OverallStats } from "../lib/api";
import { Card, Avatar } from "../components/ui";
import { ScrollToTop } from "../components/ScrollToTop";
import { SessionCard } from "../components/SessionCard";
import { PlayIcon, LocationIcon, WatchIcon, FoilIcon, CommunityIcon } from "../components/Icons";
import { Lightbox, LightboxPhoto } from "../components/Lightbox";
import { VideoModal, ytId } from "../components/VideoModal";
import { SessionStats } from "./Sessions";
import { foilLabel } from "../lib/foilLabel";
import { useI18n, useNumberFormat } from "../i18n";
import { REC_ITEMS } from "./Home";

// Bewusst dieselbe Formel wie auf der eigenen Startseite (`PersonalHome.fmtDur`) — eine zweite
// Schreibweise fuer dieselbe Zahl liest sich wie ein anderer Wert.
function fmtDur(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

// Label und Wert einer Rekord-Kennzahl — dieselbe Quelle wie die Community-Kacheln.
const recLabel = (metric: string, t: (k: string) => string) =>
  t(REC_ITEMS.find((x) => x.key === metric)?.labelKey ?? metric);
const recWert = (metric: string, v: number) =>
  REC_ITEMS.find((x) => x.key === metric)?.fmt(v) ?? String(v);

// Anzeigename eines Kanal-Links: „@handle" wenn vorhanden, sonst der Pfad ohne Host.
function kanalName(url: string): string {
  try {
    const p = new URL(url).pathname.replace(/\/+$/, "");
    const letzter = p.split("/").filter(Boolean).pop();
    return letzter || new URL(url).hostname;
  } catch {
    return url;
  }
}

// Setup-Labels wie in der eigenen Sessionliste — die Karte formatiert nichts selbst.
const setupLabels = (s: { setup?: { stab?: { brand: string; model: string; size: string } | null;
                                   mast_len_cm?: number | null;
                                   board?: { name: string } | null } | null }) => ({
  stab: s.setup?.stab ? `${s.setup.stab.brand} ${s.setup.stab.model} ${s.setup.stab.size}`.trim() : null,
  mast: s.setup?.mast_len_cm ? `${s.setup.mast_len_cm} cm` : null,
  board: s.setup?.board?.name || null,
});

export default function Foiler() {
  const { id } = useParams();
  const { t, lang } = useI18n();
  const nf = useNumberFormat();
  // Datumsangaben in der PROFILSPRACHE, nicht in der des Browsers (Jan, 08.09.2026): sonst
  // stand auf der englischen Seite „20. Juni 2026", weil `toLocaleDateString(undefined, …)`
  // die Browser-Sprache nimmt. Zeitzone bleibt die des Spots, wo wir sie kennen.
  const datum = (iso: string | null | undefined, tz?: string | null,
                 opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", year: "2-digit" }) => {
    if (!iso) return "";
    try {
      return new Intl.DateTimeFormat(lang, { ...opts, timeZone: tz ?? undefined }).format(new Date(iso));
    } catch {
      return new Date(iso).toLocaleDateString(undefined, opts);
    }
  };
  const [d, setD] = useState<Awaited<ReturnType<typeof api.foilerProfil>> | null>(null);
  const [fehler, setFehler] = useState(false);
  // Galerie: Index im FOTO-Array (Videos sind nicht Teil der Galerie, die laufen im Player).
  const [galerie, setGalerie] = useState<number | null>(null);
  const [video, setVideo] = useState<string | null>(null);
  // Wie viele Kacheln gerendert sind. Waechst beim Scrollen nach rechts — bei 200 Medien
  // sonst 200 <img> auf einmal, und das Karussell ruckelt beim ersten Wischen.
  const [gezeigt, setGezeigt] = useState(24);

  useEffect(() => {
    setD(null); setFehler(false); setGezeigt(24); setGalerie(null); setVideo(null);
    api.foilerProfil(Number(id)).then(setD).catch(() => setFehler(true));
  }, [id]);

  if (fehler) {
    return (
      <div>
        <p className="text-sm text-slate-400">{t("foiler.notFound")}</p>
      </div>
    );
  }
  if (!d) return <div className="text-sm text-slate-400">{t("common.loading")}</div>;

  const medien = d.medien ?? [];
  // Die Galerie zeigt nur Fotos. Die Reihenfolge ist dieselbe wie im Karussell, damit das
  // angeklickte Bild auch das ist, das aufgeht.
  const fotos: LightboxPhoto[] = medien
    .filter((m) => m.kind !== "video" && m.url)
    .map((m) => ({ url: m.url as string, session_id: m.session_id, name: d.name,
                   avatar_url: d.avatar_url, started_at: m.started_at }));

  // Spot-Titel nach Spot buendeln; die Reihenfolge kommt schon sortiert vom Server.
  const spotGruppen = Object.entries((d.spot_titel ?? []).reduce((acc, x) => {
    const k = x.spot || "—";
    (acc[k] ||= []).push(x);
    return acc;
  }, {} as Record<string, NonNullable<typeof d.spot_titel>>));

  const r = d.rekorde?.records;
  // Dieselben Kacheln und dieselbe Formatierung wie auf der eigenen Startseite — driftet die
  // Darstellung auseinander, wirken es zwei verschiedene Zahlen.
  const rekorde: { label: string; wert: number | undefined; fmt: (v: number) => string; datum?: string | null; tz?: string | null; sid?: number | null }[] = [
    { label: t("rec.farthestRun"), wert: r?.distance?.value, fmt: (v) => `${Math.round(v)} m`, datum: r?.distance?.started_at, tz: (r?.distance as any)?.tz, sid: r?.distance?.session_id },
    { label: t("rec.longestRun"), wert: r?.duration?.value, fmt: (v) => `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, "0")}`, datum: r?.duration?.started_at, tz: (r?.duration as any)?.tz, sid: r?.duration?.session_id },
    { label: t("rec.topSpeed"), wert: r?.speed?.value, fmt: (v) => `${(v * 3.6).toFixed(1)} km/h`, datum: r?.speed?.started_at, tz: (r?.speed as any)?.tz, sid: r?.speed?.session_id },
    { label: t("rec.longestGlide"), wert: r?.glide?.value, fmt: (v) => `${v.toFixed(1)} s`, datum: r?.glide?.started_at, tz: (r?.glide as any)?.tz, sid: r?.glide?.session_id },
    { label: t("rec.mostRuns"), wert: r?.runs?.value, fmt: (v) => `${Math.round(v)}`, datum: r?.runs?.started_at, tz: (r?.runs as any)?.tz, sid: r?.runs?.session_id },
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
    <div>
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
              {t("foiler.since", { date: datum(d.seit, null, { day: "2-digit", month: "long", year: "numeric" }) })}
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
            <span className="flex items-center gap-1.5 text-slate-400"><LocationIcon className="h-4 w-4" />{t("foiler.homespot")}:</span>
            <span className="font-semibold text-slate-200">
              {/* Der Homespot verlinkt auf den Spot, wenn wir ihn zuordnen konnten. */}
              {d.homespot_id
                ? <Link to={`/sessions?spot=${d.homespot_id}`} className="underline decoration-slate-500 hover:decoration-brand-400">{d.homespot}</Link>
                : d.homespot}
            </span>
          </>
        )}
        {d.uhren && d.uhren.length > 0 && (
          <>
            <span className="flex items-center gap-1.5 text-slate-400"><WatchIcon className="h-4 w-4" />{t("foiler.watch")}:</span>
            <span className="font-semibold text-slate-200">{d.uhren.join(" · ")}</span>
          </>
        )}
        {d.foils && d.foils.length > 0 && (
          <>
            <span className="flex items-center gap-1.5 text-slate-400"><FoilIcon className="h-4 w-4" />{t("foiler.foil")}:</span>
            <span className="font-semibold text-slate-200">{d.foils.map((f) => `${f.brand} ${f.model} ${f.size}`).join(" · ")}</span>
          </>
        )}
        {d.kanal && (
          <>
            <span className="flex items-center gap-1.5 text-slate-400"><PlayIcon className="h-4 w-4" />YouTube:</span>
            {/* Externer Link, deshalb rel=noreferrer: unsere Adresse geht nicht als Referrer mit.
                Angezeigt wird der Kanal-Name (@handle), nicht die ganze URL. */}
            <a href={d.kanal} target="_blank" rel="noopener noreferrer"
               className="font-semibold text-brand-600 underline dark:text-brand-300">
              {kanalName(d.kanal)}
            </a>
          </>
        )}
      </div>

      {d.zeigt.records && s && (
        <>
          <h2 className="mb-2 text-sm font-semibold text-slate-200">{t("foiler.records")}</h2>
          <div className="grid grid-cols-3 gap-1.5 lg:grid-cols-5">
            {/* Jede Kachel fuehrt in die Session, in der der Rekord gefahren wurde — dieselbe
                Verlinkung wie auf der eigenen Startseite (Jan, 08.09.2026). */}
            {rekorde.map((x) => {
              const inner = (
                <Card className="h-full px-2.5 py-1.5">
                  <div className="text-[11px] leading-tight text-slate-400">{x.label}</div>
                  <div className="text-lg font-bold leading-tight tabular-nums text-brand-400">
                    {x.wert && x.wert > 0 ? x.fmt(x.wert) : "–"}
                  </div>
                  {x.wert && x.wert > 0 && x.datum && (
                    <div className="text-[10px] leading-tight tabular-nums text-slate-500">
                      {datum(x.datum, x.tz ?? null)}
                    </div>
                  )}
                </Card>
              );
              return x.wert && x.wert > 0 && x.sid
                ? <Link key={x.label} to={`/sessions/${x.sid}`} className="block transition-transform hover:scale-[1.02]">{inner}</Link>
                : <div key={x.label}>{inner}</div>;
            })}
            {summen.map((x) => (
              <Card key={x.label} className="h-full px-2.5 py-1.5">
                <div className="text-[11px] leading-tight text-slate-400">{x.label}</div>
                <div className="text-lg font-bold leading-tight tabular-nums text-brand-400">{x.wert}</div>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Rekorde, die er AKTUELL haelt — community-weit und je Spot, Fenster fest 12 Monate.
          Label und Formatierung kommen aus REC_ITEMS (Home.tsx), damit derselbe Rekord hier
          und auf der Community-Seite nicht mit zwei verschiedenen Zahlen steht. */}
      {d.zeigt.titles && ((d.titel?.length ?? 0) > 0 || (d.spot_titel?.length ?? 0) > 0) && (
        <div className="mt-6">
          <h2 className="mb-2 text-sm font-semibold text-slate-200">{t("foiler.titles")}</h2>
          {(spotGruppen.length > 0 || (d.titel?.length ?? 0) > 0) && (
            <>
              {/* Ohne Ueberschrift (Jan, 08.09.2026): die Chips nennen Kennzahl und Wert
                  selbst, der Spotname steht davor. */}
              {/* Nach Spot gruppiert, nicht als eine lange Kette: bei vier Spots und zehn
                  Kennzahlen (luk) stuende der Spotname sonst dreissigmal da. */}
              {/* EIN Raster ueber alle Spots, nicht eine Zeile je Spot: die erste Spalte ist
                  so breit wie der laengste Spotname, dadurch fangen die Titel bei allen Spots
                  auf derselben Kante an. Und weil die Chips in der zweiten Spalte umbrechen,
                  rutscht eine zweite Reihe NICHT unter den Namen, sondern bleibt buendig
                  (Jan, 08.09.2026 — genau das war vorher schief). */}
              <div className="grid grid-cols-[max-content_1fr] items-start gap-x-3 gap-y-2">
                {/* Community-weite Titel als erste Zeile DESSELBEN Rasters, mit eigenem Label:
                    vorher standen sie ohne Beschriftung darueber, nur an der Fuellfarbe
                    unterscheidbar — Jan hat sofort gefragt, warum ein Rekord anders aussieht
                    (08.09.2026). Die Fuellfarbe bleibt, sie ist die Auszeichnung: ein
                    community-weiter Rekord ist mehr als ein Spot-Rekord. */}
                {/* Zwei Zeilen fuer die community-weiten Titel (Jan, 08.09.2026): einmal unter
                    den Aufnahmen MIT Bewegungssensor, einmal unter denen ohne. Die zweite Zeile
                    ist bewusst „nur GPS" und nicht „alle" — sonst stuende derselbe Accel-Rekord
                    zweimal da. So vergleicht jede Zeile Gleiches mit Gleichem, und eine Uhr ohne
                    Sensor (oder ein Konto-Import) faellt nicht aus der Wertung. */}
                {(["accel", "gps"] as const).map((basis) => {
                  const liste = (d.titel ?? []).filter((x) => x.basis === basis);
                  if (!liste.length) return null;
                  return (
                    <Fragment key={`b-${basis}`}>
                      <Link to="/community" title={t(basis === "accel" ? "foiler.basisAccelTip" : "foiler.basisGpsTip")}
                            className="flex items-center gap-1 py-0.5 text-sm font-semibold text-slate-200 underline decoration-slate-500 hover:decoration-brand-400">
                        <CommunityIcon className="h-4 w-4 shrink-0 text-slate-400" />
                        {t(basis === "accel" ? "foiler.basisAccel" : "foiler.basisGps")}
                      </Link>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                        {liste.map((x) => (
                          <Link key={`c-${basis}-${x.metric}`} to={x.session_id ? `/sessions/${x.session_id}` : "/community"}
                                className="rounded-full bg-brand-500/15 px-2.5 py-0.5 text-sm text-brand-700 hover:bg-brand-500/25 dark:text-brand-300">
                            {recLabel(x.metric, t)} <span className="font-semibold tabular-nums">{recWert(x.metric, x.value)}</span>
                          </Link>
                        ))}
                      </div>
                    </Fragment>
                  );
                })}
                {spotGruppen.map(([spot, liste]) => (
                  <Fragment key={spot}>
                    <Link to={`/sessions?spot=${liste[0].spot_id}`}
                          className="flex items-center gap-1 py-0.5 text-sm font-semibold text-slate-200 underline decoration-slate-500 hover:decoration-brand-400">
                      <LocationIcon className="h-4 w-4 shrink-0 text-slate-400" />{spot}
                    </Link>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                      {/* Ist er dort der einzige Fahrer, haelt er zwangslaeufig jeden Rekord —
                          dann sagt EIN Hinweis mehr als zehn Titel ohne Gegner (Jan). */}
                      {liste[0].allein ? (
                        <span className="rounded-full border border-slate-700 px-2.5 py-0.5 text-sm text-slate-400">
                          {t("foiler.onlyFoiler")}
                        </span>
                      ) : liste.map((x, i) => {
                        const inhalt = <>{recLabel(x.metric, t)} <span className="font-semibold tabular-nums">{recWert(x.metric, x.value)}</span></>;
                        const klasse = "rounded-full border border-slate-700 px-2.5 py-0.5 text-sm text-slate-300";
                        // „Meiste Carves >180°" ist eine Summe ueber den Zeitraum und haengt an
                        // keiner Session (s. _carve_record) -> kein Link, sonst zeigt er irgendwohin.
                        return x.session_id
                          ? <Link key={`${x.metric}-${i}`} to={`/sessions/${x.session_id}`} className={`${klasse} hover:border-brand-400 hover:text-brand-600 dark:hover:text-brand-300`}>{inhalt}</Link>
                          : <span key={`${x.metric}-${i}`} className={klasse}>{inhalt}</span>;
                      })}
                    </div>
                  </Fragment>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Medien einzeilig als Karussell (Jan, 08.09.2026): waagerecht scrollbar, unter jeder
          Kachel das Datum. Ein Klick oeffnet die FULLSCREEN-GALERIE mit den Fotos dieses
          Nutzers zum Durchschalten — nicht mehr die Session. Videos gehen weiter in den
          Click-to-Load-Player (youtube-nocookie): ein Video hat in einer Bildergalerie keinen
          Platz, und ein zweiter Abspielweg waere eine zweite Datenschutz-Baustelle.
          Vorschaubilder der Videos kommen ueber UNSEREN Server (/api/public/video-thumb). */}
      {d.zeigt.media && medien.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-2 text-sm font-semibold text-slate-200">
            {t("foiler.media")} <span className="font-normal text-slate-400">({medien.length})</span>
          </h2>
          {/* Nachladen beim Scrollen: 400 px vor dem Ende kommen die naechsten 24 Kacheln.
              Zusammen mit loading="lazy" laedt der Browser nur, was in Sichtweite kommt.
              KEIN Rand-Ausbruch per negativer Margin: die erste Kachel rutschte damit links
              ueber den Seitenrand hinaus (Jan, 08.09.2026). Das Karussell endet jetzt genau
              da, wo auch die Ueberschriften anfangen. */}
          <div
            className="flex snap-x gap-2 overflow-x-auto pb-2"
            onScroll={(e) => {
              const el = e.currentTarget;
              if (el.scrollLeft + el.clientWidth > el.scrollWidth - 400) {
                setGezeigt((n) => (n >= medien.length ? n : n + 24));
              }
            }}
          >
            {medien.slice(0, gezeigt).map((m, i) => {
              const yt = m.kind === "video" ? ytId(m.youtube_url) : "";
              const bild = m.kind === "video" ? (yt ? `/api/public/video-thumb/${yt}` : null) : (m.thumb_url || m.url);
              const oeffnen = () => {
                if (m.kind === "video") { setVideo(m.youtube_url); return; }
                const k = fotos.findIndex((f) => f.url === m.url);
                if (k >= 0) setGalerie(k);
              };
              return (
                <button key={`${m.kind}-${m.session_id}-${i}`} onClick={oeffnen}
                        className="group w-24 shrink-0 snap-start text-left sm:w-28">
                  <span className="relative block">
                    {bild
                      ? <img src={bild} alt="" loading="lazy" decoding="async"
                             className="aspect-square w-full rounded-lg object-cover transition-opacity group-hover:opacity-90" />
                      : <span className="block aspect-square w-full rounded-lg bg-slate-800" />}
                    {m.kind === "video" && (
                      <span className="absolute inset-0 flex items-center justify-center">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white">
                          <PlayIcon className="h-4 w-4" />
                        </span>
                      </span>
                    )}
                  </span>
                  <span className="mt-1 block text-center text-xs tabular-nums text-slate-400">
                    {datum(m.started_at)}
                  </span>
                </button>
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
                    className="flex items-center gap-1 rounded-full border border-slate-700 px-3 py-1 text-sm text-slate-300 hover:border-brand-400 hover:text-brand-600 dark:hover:text-brand-300">
                <LocationIcon className="h-4 w-4 text-slate-400" />
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

      {galerie !== null && fotos[galerie] && (
        <Lightbox photos={fotos} index={galerie} onClose={() => setGalerie(null)}
                  onChange={(i) => setGalerie(i)} />
      )}
      {video && <VideoModal url={video} onClose={() => setVideo(null)} />}
    </div>
  );
}
