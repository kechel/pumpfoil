import { useEffect, useState } from "react";
import { api, Bewertung, BewertungAntworten } from "../lib/api";
import { CheckIcon, CloseIcon, StarIcon } from "./Icons";
import { useT } from "../i18n";
import { useCloseOnBack } from "../lib/useCloseOnBack";

// „Rate this analysis" (Jan, 22.10.2026): letzte Kachel in den Session-Zahlen, NUR auf eigenen Sessions.
// Die Antworten liegen an der Session (server/app/api/bewertung.py) und sind nur fuer den Besitzer und den
// Admin sichtbar (Admin-Tab „Bewertungen"). Alle Fragen sind optional; die echte Laufzahl ist fuer die
// Lauferkennung die wertvollste Antwort (Vergleichsdaten).

const LAEUFE = ["alle", "fehlen", "zuviele", "zerstueckelt"] as const;
const PUMPS = ["wenig", "passt", "viel", "weiss_nicht"] as const;
const PROBLEME = ["abbruch", "pause", "gps", "upload", "akku", "bedienung", "sonstiges"] as const;
const MAX = 2000;

function Chip({ an, onClick, children }: { an: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={`rounded-full px-3 py-1 text-sm ${an ? "bg-brand-500 font-semibold text-slate-950" : "bg-slate-800 text-slate-200 hover:bg-slate-700"}`}>
      {children}
    </button>
  );
}

function Frage({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <div className="mb-1 text-sm font-medium text-slate-200">{titel}</div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

export function SessionBewertungKachel({ sessionId }: { sessionId: number }) {
  const t = useT();
  const [b, setB] = useState<Bewertung | null>(null);
  const [laeufeJetzt, setLaeufeJetzt] = useState<number | null>(null);
  const [offen, setOffen] = useState(false);
  useEffect(() => {
    api.bewertung(sessionId).then((r) => { setB(r.bewertung); setLaeufeJetzt(r.laeufe_jetzt); }).catch(() => {});
  }, [sessionId]);
  const sterne = b?.antworten.sterne;
  return (
    <>
      <button type="button" onClick={() => setOffen(true)}
        className={`overflow-hidden rounded-xl border bg-slate-900/60 p-1.5 text-left hover:border-brand-500 ${b?.rueckfrage ? "border-amber-500" : "border-dashed border-slate-700"}`}>
        <div className="flex items-baseline gap-0.5 leading-none text-brand-400">
          {b
            ? (sterne
              ? Array.from({ length: 5 }, (_, i) => <StarIcon key={i} className="h-4 w-4" filled={i < sterne} />)
              : <CheckIcon className="h-5 w-5" />)
            : <StarIcon className="h-5 w-5" />}
        </div>
        <div className="mt-1 text-[10px] uppercase leading-tight tracking-wide text-slate-300">
          {b?.rueckfrage ? t("rate.recheckTile") : b ? t("rate.rated") : t("rate.tile")}
        </div>
      </button>
      {offen && (
        <BewertungDialog sessionId={sessionId} alt={b} laeufeJetzt={laeufeJetzt}
          onClose={() => setOffen(false)} onSaved={(neu) => { setB(neu); setOffen(false); }} />
      )}
    </>
  );
}

function BewertungDialog({ sessionId, alt, laeufeJetzt, onClose, onSaved }: {
  sessionId: number; alt: Bewertung | null; laeufeJetzt: number | null;
  onClose: () => void; onSaved: (b: Bewertung) => void;
}) {
  const t = useT();
  useCloseOnBack(true, onClose);
  const [a, setA] = useState<BewertungAntworten>(alt?.antworten ?? {});
  // Leer starten, unsere Zahl nur als Hinweis (22.10.2026: vorbelegt + „nur bei Aenderung speichern" verlor
  // jede BESTAETIGTE Zahl). Was drinsteht, wird gespeichert.
  const [echt, setEcht] = useState<string>(alt?.antworten.laeufe_echt != null ? String(alt.antworten.laeufe_echt) : "");
  const [kommentar, setKommentar] = useState(alt?.kommentar ?? "");
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState(false);
  const setze = <K extends keyof BewertungAntworten>(k: K, v: BewertungAntworten[K]) =>
    setA((x) => ({ ...x, [k]: x[k] === v ? undefined : v }));   // nochmal tippen = abwaehlen
  const art = a.probleme_art ?? [];

  async function senden() {
    const antworten: BewertungAntworten = { ...a };
    const n = parseInt(echt, 10);
    if (echt.trim() !== "" && Number.isFinite(n) && n >= 0) antworten.laeufe_echt = n;
    else delete antworten.laeufe_echt;
    if (antworten.probleme !== true) delete antworten.probleme_art;
    setBusy(true); setFehler(false);
    try {
      const r = await api.bewertungSpeichern(sessionId, antworten, kommentar.trim());
      onSaved(r.bewertung);
    } catch {
      setFehler(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[1600] flex items-center justify-center bg-black/40 p-3" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between">
          <h3 className="font-semibold text-slate-100">{t("rate.title")}</h3>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-200"><CloseIcon className="h-4 w-4" /></button>
        </div>
        <p className="mb-3 text-xs text-slate-400">{t("rate.intro")}</p>
        {/* Rueckfrage von uns („Back to rider" im Admin-Tab), bis neu bewertet wird. */}
        {alt?.rueckfrage && (
          <div className="mb-3 rounded-lg border border-amber-500/60 bg-amber-500/10 p-2 text-sm text-slate-100">
            <div className="font-medium text-amber-700 dark:text-amber-300">{t("rate.recheck")}</div>
            <div className="mt-1 whitespace-pre-wrap">{alt.rueckfrage.text}</div>
          </div>
        )}

        <Frage titel={t("rate.stars")}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" aria-label={`${n}`} onClick={() => setze("sterne", n)} className="text-brand-400">
              <StarIcon className="h-7 w-7" filled={(a.sterne ?? 0) >= n} />
            </button>
          ))}
        </Frage>

        <Frage titel={t("rate.runs")}>
          {LAEUFE.map((k) => <Chip key={k} an={a.laeufe === k} onClick={() => setze("laeufe", k)}>{t(`rate.runs.${k}`)}</Chip>)}
        </Frage>

        <div className="mb-3">
          <label className="mb-1 block text-sm font-medium text-slate-200" htmlFor="rate-echt">{t("rate.runsReal")}</label>
          <input id="rate-echt" type="number" min={0} max={500} inputMode="numeric" value={echt}
            placeholder={laeufeJetzt != null ? String(laeufeJetzt) : ""}
            onChange={(e) => setEcht(e.target.value)}
            className="w-24 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100" />
          {laeufeJetzt != null && <span className="ml-2 text-xs text-slate-400">{t("rate.runsRealHint", { n: laeufeJetzt })}</span>}
        </div>

        <Frage titel={t("rate.pumps")}>
          {PUMPS.map((k) => <Chip key={k} an={a.pumps === k} onClick={() => setze("pumps", k)}>{t(`rate.pumps.${k}`)}</Chip>)}
        </Frage>

        <Frage titel={t("rate.speedOk")}>
          <Chip an={a.tempo_ok === true} onClick={() => setze("tempo_ok", true)}>{t("rate.yes")}</Chip>
          <Chip an={a.tempo_ok === false} onClick={() => setze("tempo_ok", false)}>{t("rate.no")}</Chip>
        </Frage>

        <Frage titel={t("rate.problems")}>
          <Chip an={a.probleme === false} onClick={() => setze("probleme", false)}>{t("rate.no")}</Chip>
          <Chip an={a.probleme === true} onClick={() => setze("probleme", true)}>{t("rate.yes")}</Chip>
        </Frage>
        {a.probleme === true && (
          <div className="-mt-1 mb-3 flex flex-wrap gap-1.5">
            {PROBLEME.map((k) => (
              <Chip key={k} an={art.includes(k)}
                onClick={() => setA((x) => {
                  const alt2 = x.probleme_art ?? [];
                  return { ...x, probleme_art: alt2.includes(k) ? alt2.filter((y) => y !== k) : [...alt2, k] };
                })}>
                {t(`rate.prob.${k}`)}
              </Chip>
            ))}
          </div>
        )}

        <label className="mb-1 block text-sm font-medium text-slate-200" htmlFor="rate-kommentar">{t("rate.comment")}</label>
        <textarea id="rate-kommentar" value={kommentar} rows={3}
          onChange={(e) => setKommentar(e.target.value.slice(0, MAX))}
          placeholder={t("rate.commentPh")}
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100" />

        {fehler && <p className="mt-2 text-sm text-red-700 dark:text-red-300">{t("rate.error")}</p>}
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-slate-300 hover:text-slate-100">{t("rate.cancel")}</button>
          <button type="button" disabled={busy} onClick={senden}
            className="rounded-lg bg-brand-500 px-4 py-1.5 text-sm font-semibold text-slate-950 hover:bg-brand-400 disabled:opacity-50">
            {t("rate.send")}
          </button>
        </div>
      </div>
    </div>
  );
}
