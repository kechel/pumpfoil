import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api, SpotNote, SpotNotesOut } from "../lib/api";
import { Avatar, Card } from "./ui";
import { CameraIcon, ChevronIcon, CloseIcon, EditIcon, FlagIcon, HeartIcon, LocationIcon } from "./Icons";
import { Lightbox } from "./Lightbox";
import { useI18n } from "../i18n";

// Spot-Beschreibungen: je Nutzer EIN Textblock + bis zu N Fotos, alle untereinander im Spot.
//
// Steht in der Spot-Ansicht (/sessions?spot=<id>) zwischen Wetter und Session-Liste (Jan, 24.08.).
// Bewusst KEINE eigene Spot-Seite, keine Struktur-Tags, kein Sprachfeld — Freitext genuegt.
// Schreiben darf nur, wer eine eigene Session an diesem Spot hat; das sagt `can_write` vom Server,
// die Oberflaeche zeigt sonst gar keinen Bearbeiten-Knopf.
export function SpotNotes({ spotId }: { spotId: number }) {
  const { t, lang } = useI18n();
  const [data, setData] = useState<SpotNotesOut | null>(null);
  const [edit, setEdit] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [lb, setLb] = useState<{ urls: string[]; i: number } | null>(null);
  const [picker, setPicker] = useState<{ id: number; url: string; thumb_url: string | null; started_at: string | null }[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const laden = () => api.spotNotes(spotId).then(setData).catch(() => setData(null));
  useEffect(() => { setEdit(false); setErr(null); laden(); }, [spotId]);   // eslint-disable-line react-hooks/exhaustive-deps

  const meine = useMemo(() => data?.notes.find((n) => n.mine) ?? null, [data]);
  const fremde = useMemo(() => data?.notes.filter((n) => !n.mine) ?? [], [data]);

  // Datum der letzten Aktualisierung — in der Sprache der Oberflaeche, nur Datum (die Uhrzeit
  // sagt bei einer Spot-Beschreibung nichts).
  const datum = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString(lang === "gsw" ? "de-CH" : lang,
      { day: "2-digit", month: "short", year: "numeric" }) : "";

  if (!data) return null;
  // Kein einziger Beitrag und selbst nicht schreibberechtigt -> gar nichts anzeigen (kein leerer Kasten).
  if (!data.can_write && data.notes.length === 0) return null;

  const speichern = async () => {
    setBusy(true); setErr(null);
    try {
      await api.saveSpotNote(spotId, text);
      setEdit(false);
      await laden();
    } catch { setErr(t("spotnote.error")); }
    finally { setBusy(false); }
  };

  const loeschen = async () => {
    if (!confirm(t("spotnote.deleteConfirm"))) return;
    setBusy(true);
    try { await api.deleteSpotNote(spotId); setEdit(false); await laden(); }
    catch { setErr(t("spotnote.error")); }
    finally { setBusy(false); }
  };

  const hochladen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = "";
    if (!f) return;
    setBusy(true); setErr(null);
    try { await api.uploadSpotNotePhoto(spotId, f); await laden(); }
    catch { setErr(t("spotnote.uploadFail")); }
    finally { setBusy(false); }
  };

  const uebernehmen = async (photoId: number) => {
    setBusy(true); setErr(null);
    try { await api.adoptSpotNotePhoto(spotId, photoId); setPicker(null); await laden(); }
    catch { setErr(t("spotnote.uploadFail")); }
    finally { setBusy(false); }
  };

  const fotoWeg = async (photoId: number) => {
    setBusy(true);
    try { await api.deleteSpotNotePhoto(spotId, photoId); await laden(); }
    catch { setErr(t("spotnote.error")); }
    finally { setBusy(false); }
  };

  // Eigene Fotos umsortieren: ein Schritt nach links/rechts. Reicht fuer bis zu zehn Bilder und
  // funktioniert auf dem Telefon zuverlaessiger als Ziehen.
  const schieben = async (idx: number, richtung: -1 | 1) => {
    if (!meine) return;
    const ids = meine.photos.map((p) => p.id);
    const ziel = idx + richtung;
    if (ziel < 0 || ziel >= ids.length) return;
    [ids[idx], ids[ziel]] = [ids[ziel], ids[idx]];
    setBusy(true);
    try { await api.sortSpotNotePhotos(spotId, ids); await laden(); }
    catch { setErr(t("spotnote.error")); }
    finally { setBusy(false); }
  };

  const liken = async (n: SpotNote) => {
    try {
      const r = await api.likeSpotNote(n.id);
      setData((d) => d && { ...d, notes: d.notes.map((x) => x.id === n.id ? { ...x, liked: r.liked, like_count: r.like_count } : x) });
    } catch { /* stumm — ein verlorenes Herzchen ist kein Fehlerdialog wert */ }
  };

  const melden = async (n: SpotNote) => {
    if (!confirm(t("spotnote.reportConfirm"))) return;
    try { await api.reportSpotNote(n.id); await laden(); } catch { setErr(t("spotnote.error")); }
  };

  const fotoGitter = (n: SpotNote, eigen: boolean) => (
    n.photos.length > 0 && (
      <div className="mt-2 flex flex-wrap gap-2">
        {n.photos.map((p, i) => (
          <div key={p.id} className="relative">
            <img
              src={p.thumb_url || p.url} alt=""
              onClick={() => setLb({ urls: n.photos.map((x) => x.url), i })}
              className="h-24 w-24 cursor-pointer rounded-lg object-cover sm:h-28 sm:w-28"
            />
            {eigen && (
              <>
                <button onClick={() => fotoWeg(p.id)} aria-label={t("common.delete")}
                  className="absolute right-1 top-1 rounded-full bg-black/60 px-1.5 text-xs leading-5 text-white hover:bg-black/80">×</button>
                <div className="absolute bottom-1 left-1 flex gap-1">
                  <button onClick={() => schieben(i, -1)} disabled={i === 0} aria-label={t("spotnote.moveLeft")}
                    className="rounded bg-black/60 px-1 text-white disabled:opacity-30 hover:bg-black/80">
                    <ChevronIcon className="h-3 w-3 rotate-90" />
                  </button>
                  <button onClick={() => schieben(i, 1)} disabled={i === n.photos.length - 1} aria-label={t("spotnote.moveRight")}
                    className="rounded bg-black/60 px-1 text-white disabled:opacity-30 hover:bg-black/80">
                    <ChevronIcon className="h-3 w-3 -rotate-90" />
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    )
  );

  const kopfzeile = (n: SpotNote) => (
    <div className="flex items-center gap-2">
      <Avatar name={n.name} url={n.avatar_url} size={32} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-slate-100">{n.name ?? "—"}</div>
        {n.updated_at && <div className="text-xs text-slate-400">{t("spotnote.updated")} {datum(n.updated_at)}</div>}
      </div>
      <button onClick={() => liken(n)} title={t("sd.likes")}
        className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm ${n.liked ? "bg-rose-500/20 text-rose-600" : "bg-slate-800 text-slate-200 hover:bg-slate-700"}`}>
        <HeartIcon className={`h-4 w-4 ${n.liked ? "" : "text-rose-500"}`} filled={n.liked} />
        {n.like_count > 0 && <span className="tabular-nums text-xs">{n.like_count}</span>}
      </button>
      {!n.mine && (
        <button onClick={() => melden(n)} title={n.my_report ? t("sd.reported") : t("sd.inappropriate")}
          className={`rounded-lg px-2.5 py-1.5 ${n.my_report ? "bg-red-500/20 text-red-600 dark:text-red-300" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>
          <FlagIcon className="h-4 w-4" />
        </button>
      )}
    </div>
  );

  return (
    <Card className="mb-4 p-4">
      <div className="mb-1 flex items-center gap-2">
        <LocationIcon className="h-5 w-5 text-brand-400" />
        <h3 className="font-semibold text-slate-100">{t("spotnote.title")}</h3>
      </div>
      {/* Haftungshinweis: Startstellen und Flachwasser sind Sicherheitsthemen (Vorgabe Jan). */}
      <p className="mb-3 text-sm text-slate-400">{t("spotnote.disclaimer")}</p>

      {/* --- Eigener Abschnitt --- */}
      {/* Ansicht und Bearbeiten sind getrennt (Jan, 24.08.): im Ruhezustand steht hier nur die
          Beschreibung und EIN Knopf. Foto hinzufuegen / aus Session-Fotos / Loeschen / der
          Foto-Zaehler erscheinen erst beim Bearbeiten — im Ruhezustand sind es vier Knoepfe, die
          niemand braucht, der nur mitliest. */}
      {data.can_write && (
        <div className="mb-4 rounded-xl border border-brand-500/30 bg-brand-500/5 p-3">
          {edit ? (
            <>
              <textarea
                value={text} onChange={(e) => setText(e.target.value.slice(0, data.max_text))}
                rows={5} autoFocus placeholder={t("spotnote.placeholder")}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
              />
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-500">{text.length}/{data.max_text}</span>
                <button onClick={speichern} disabled={busy}
                  className="ml-auto rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-semibold text-slate-950 hover:bg-brand-400 disabled:opacity-50">
                  {busy ? t("common.loading") : t("common.save")}
                </button>
                <button onClick={() => { setEdit(false); setText(meine?.text ?? ""); }}
                  className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700">
                  {t("common.cancel")}
                </button>
              </div>

              {/* Fotos gehoeren zum Bearbeiten: hier mit Loeschkreuz und Pfeilen zum Sortieren. */}
              {meine && fotoGitter(meine, true)}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {(meine?.photos.length ?? 0) < data.max_photos && (
                  <>
                    <button onClick={() => fileRef.current?.click()} disabled={busy}
                      className="flex items-center gap-1 rounded-lg bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700 disabled:opacity-50">
                      <CameraIcon className="h-4 w-4 text-brand-400" /> {t("spotnote.addPhoto")}
                    </button>
                    <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={hochladen} />
                    <button
                      onClick={() => api.mySpotSessionPhotos(spotId).then((l) => setPicker(l)).catch(() => setErr(t("spotnote.error")))}
                      className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700">
                      {t("spotnote.fromSession")}
                    </button>
                  </>
                )}
                {meine && (
                  <button onClick={loeschen} disabled={busy}
                    className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm text-red-600 hover:bg-slate-700 disabled:opacity-50 dark:text-red-300">
                    {t("common.delete")}
                  </button>
                )}
                <span className="text-xs text-slate-500">
                  {meine?.photos.length ?? 0}/{data.max_photos} {t("spotnote.photos")}
                </span>
              </div>
            </>
          ) : (
            <>
              {meine ? (
                <>
                  {kopfzeile(meine)}
                  {meine.text && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-200">{meine.text}</p>}
                  {/* Ruhezustand: Fotos OHNE Loeschkreuz/Pfeile — nur ansehen. */}
                  {fotoGitter(meine, false)}
                </>
              ) : (
                // Anstoss: ohne Aufforderung bleibt so ein Feature leer.
                <p className="text-sm text-slate-300">{t("spotnote.invite")}</p>
              )}
              <div className="mt-2">
                <button onClick={() => { setText(meine?.text ?? ""); setEdit(true); }}
                  className="flex items-center gap-1 rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-semibold text-slate-950 hover:bg-brand-400">
                  <EditIcon className="h-4 w-4" /> {meine ? t("spotnote.edit") : t("spotnote.write")}
                </button>
              </div>
            </>
          )}
          {err && <p className="mt-2 text-sm text-red-600 dark:text-red-300">{err}</p>}
        </div>
      )}

      {/* --- Fremde Abschnitte, je Nutzer einer --- */}
      {fremde.length === 0 ? (
        !data.can_write && <p className="text-sm text-slate-500">{t("spotnote.none")}</p>
      ) : (
        <div className="space-y-3">
          {fremde.map((n) => (
            <div key={n.id} className="rounded-xl border border-slate-700 p-3">
              {kopfzeile(n)}
              {n.text && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-200">{n.text}</p>}
              {fotoGitter(n, false)}
            </div>
          ))}
        </div>
      )}

      {/* Fotoauswahl aus eigenen Session-Fotos DIESES Spots */}
      {/* Auch dieser Layer geht per Portal an den body: die umgebende `Card` hat `backdrop-blur`,
          und damit wuerde `fixed` auf die Karte begrenzt statt aufs Fenster (siehe Lightbox). */}
      {picker && createPortal((
        <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/70 p-4" onClick={() => setPicker(null)}>
          <div className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center gap-2">
              <h4 className="font-semibold text-slate-100">{t("spotnote.fromSession")}</h4>
              <button onClick={() => setPicker(null)} className="ml-auto rounded-lg p-1 text-slate-400 hover:bg-black/10">
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>
            {picker.length === 0 ? (
              <p className="text-sm text-slate-500">{t("spotnote.noSessionPhotos")}</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {picker.map((p) => (
                  <img key={p.id} src={p.thumb_url || p.url} alt="" onClick={() => uebernehmen(p.id)}
                    className="h-24 w-24 cursor-pointer rounded-lg object-cover hover:ring-2 hover:ring-brand-400 sm:h-28 sm:w-28" />
                ))}
              </div>
            )}
          </div>
        </div>
      ), document.body)}

      {/* Vollbild: dieselbe Galerie wie ueberall, aber read-only — Herzchen/Melden haengen dort an
          Session-Fotos, hier gehoeren sie an die Beschreibung. */}
      {lb && (
        <Lightbox
          photos={lb.urls.map((u) => ({ url: u, session_id: 0 }))}
          index={lb.i} readOnly
          onClose={() => setLb(null)}
        />
      )}
    </Card>
  );
}
