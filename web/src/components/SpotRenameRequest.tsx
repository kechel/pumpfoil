import { useEffect, useState } from "react";
import { api, getToken } from "../lib/api";
import { useT } from "../i18n";
import { TagIcon } from "./Icons";
import { ErrorBox } from "./ui";
import { useCloseOnBack } from "../lib/useCloseOnBack";

/**
 * „Anderen Namen vorschlagen" auf der Spot-Seite.
 *
 * Spot-Namen kommen aus dem Geocoder (`spots.name_source = 'town'`) und treffen deshalb oft nicht
 * das, was die Leute vor Ort sagen — der ausloesende Fall: der Spot am Parc del Fòrum in Barcelona
 * hiess „Sant Adrià de Besòs", weil das die Nachbargemeinde ist (Nutzerwunsch, 12.09.2026).
 *
 * BEWUSST NUR EIN VORSCHLAG, kein Selbstbedienungs-Umbenennen (Vorgabe Jan, 12.09.2026: „bitte
 * nicht einfach automatisch aendern sowas durch user, sonst wird das ne witz-runde"). Ein
 * Spot-Name ist oeffentlich, steht unter den Aufnahmen ALLER dort Fahrenden und ist zugleich der
 * Schluessel des Spot-Chats — wer ihn aendert, aendert etwas Gemeinsames. Deshalb geht der Wunsch
 * als ganz normales Feedback bei uns ein und wird von Hand entschieden; das Umbenennen selbst
 * macht dann `POST /api/admin/spots/{id}/rename`, das die Kaskade (Sessions, Chat-Scope,
 * Homespot) mitzieht.
 *
 * Der Meldetext ist ENGLISCH und fest aufgebaut, nicht in der Sprache des Absenders: er landet in
 * unserer Feedback-Liste und soll dort ohne Uebersetzen lesbar und sortierbar sein. Wer ihn
 * geschickt hat, steht ohnehin an der Meldung (`feedback.user_id`).
 */
export function SpotRenameRequest({ spotId, spotName }: { spotId: number; spotName: string }) {
  const t = useT();
  const [offen, setOffen] = useState(false);
  // NUR fuer Leute, die hier selbst schon aufgenommen haben (Vorgabe Jan, 12.09.2026) — wer den
  // Spot nur anschaut, soll ihn nicht benennen wollen. Die Frage beantwortet der Server, weil sie
  // von hier aus nicht zu beantworten ist: eine Aufnahme ohne erkannten Lauf haengt an gar keinem
  // Spot (s. `/spot-mine`). Solange die Antwort laeuft, steht hier nichts — ein Knopf, der nach
  // einer Sekunde wieder verschwindet, waere schlimmer als einer, der etwas spaeter kommt.
  const [meiner, setMeiner] = useState(false);
  const angemeldet = !!getToken();
  useEffect(() => {
    if (!angemeldet) return;
    let weg = false;
    api.spotMine(spotId).then((r) => { if (!weg) setMeiner(!!r.mine); }).catch(() => {});
    return () => { weg = true; };
  }, [spotId, angemeldet]);
  if (!angemeldet || !meiner) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOffen(true)}
        className="inline-flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 hover:bg-slate-800"
      >
        <TagIcon className="h-4 w-4 text-brand-400" /> {t("spotRename.cta")}
      </button>
      {offen && <Dialog spotId={spotId} spotName={spotName} onClose={() => setOffen(false)} />}
    </>
  );
}

function Dialog({ spotId, spotName, onClose }:
  { spotId: number; spotName: string; onClose: () => void }) {
  const t = useT();
  useCloseOnBack(true, onClose);
  const [name, setName] = useState("");
  const [grund, setGrund] = useState("");
  const [busy, setBusy] = useState(false);
  const [fertig, setFertig] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  const vorschlag = name.trim();
  const kannSenden = vorschlag.length >= 2 && vorschlag !== spotName.trim() && !busy;

  async function senden() {
    setBusy(true);
    setFehler(null);
    try {
      // Fester Aufbau, damit die Meldung in der Feedback-Liste sofort als Namenswunsch erkennbar
      // ist. 500 Zeichen sind die Obergrenze des Endpunkts -> der Grund wird zur Not beschnitten,
      // Spot und Wunschname stehen davor und bleiben damit immer vollstaendig.
      const kopf = `Spot name change requested\nSpot: ${spotName} (#${spotId})\nProposed: ${vorschlag}`;
      const text = grund.trim() ? `${kopf}\nReason: ${grund.trim()}` : kopf;
      await api.submitFeedback(text.slice(0, 500), `/sessions?spot=${spotId}`);
      setFertig(true);
    } catch (e) {
      setFehler((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="rounded-2xl border border-slate-800 bg-white p-4 shadow-xl dark:bg-slate-900">
          <h3 className="mb-1 text-base font-bold text-slate-100">{t("spotRename.title")}</h3>
          {fertig ? (
            <>
              <p className="text-sm text-slate-200">{t("spotRename.sent")}</p>
              <button type="button" onClick={onClose}
                className="mt-3 rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-semibold text-slate-950 hover:bg-brand-400">
                {t("common.close")}
              </button>
            </>
          ) : (
            <>
              <p className="mb-3 text-sm text-slate-300">{t("spotRename.hint")}</p>
              <label className="mb-1 block text-xs font-semibold text-slate-400">{t("spotRename.current")}</label>
              <div className="mb-3 rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-300">
                {spotName}
              </div>
              <label className="mb-1 block text-xs font-semibold text-slate-400" htmlFor="spotRenameName">
                {t("spotRename.proposed")}
              </label>
              <input
                id="spotRenameName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                autoFocus
                className="mb-3 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-brand-500"
              />
              <label className="mb-1 block text-xs font-semibold text-slate-400" htmlFor="spotRenameWhy">
                {t("spotRename.reason")}
              </label>
              <textarea
                id="spotRenameWhy"
                value={grund}
                onChange={(e) => setGrund(e.target.value)}
                maxLength={200}
                rows={2}
                className="mb-3 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-brand-500"
              />
              {fehler && <div className="mb-3"><ErrorBox message={fehler} /></div>}
              <div className="flex gap-2">
                <button type="button" onClick={senden} disabled={!kannSenden}
                  className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-semibold text-slate-950 hover:bg-brand-400 disabled:opacity-40">
                  {busy ? "…" : t("spotRename.send")}
                </button>
                <button type="button" onClick={onClose}
                  className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800">
                  {t("common.cancel")}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
