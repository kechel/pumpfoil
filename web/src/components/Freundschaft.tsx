// Freundschaft anfragen / annehmen / beenden (Jan, 15.10.2026). Der Dialog sagt WOERTLICH, was
// Freunde sehen — einen Schalter dafuer gibt es bewusst nicht: wer zustimmt, stimmt genau dem zu.
// Was der Server dann freigibt, regelt server/app/freunde.py; diese Komponente entscheidet nichts.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, Freundschaft } from "../lib/api";
import { useT } from "../i18n";

/** Der Text „Was Freunde sehen" — derselbe beim Anfragen, Annehmen und auf der Freunde-Seite. */
export function FreundeBedingungen({ className = "" }: { className?: string }) {
  const t = useT();
  return <p className={`text-sm leading-relaxed text-slate-300 ${className}`}>{t("friends.terms")}</p>;
}

type Art = "anfragen" | "annehmen" | "beenden" | "zurueckziehen";
// Getrennt notiert, damit der Light-Mode-Waechter die beiden Faelle nicht als EINE Klasse liest.
const ROT = "border border-red-500/40 bg-red-500/10 text-red-700 hover:bg-red-500/20 dark:text-red-300";
const JA = "bg-brand-500 text-slate-950 hover:bg-brand-400";

export function FreundschaftDialog({ art, name, onJa, onAblehnen, onClose, busy }: {
  art: Art; name: string; onJa: () => void; onAblehnen?: () => void; onClose: () => void; busy: boolean;
}) {
  const t = useT();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const titel = art === "anfragen" ? t("friends.request")
    : art === "annehmen" ? t("friends.incomingFrom", { name })
    : art === "beenden" ? t("friends.remove") : t("friends.withdraw");
  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-xl"
           onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <h3 className="mb-3 text-lg font-bold">{titel}</h3>
        {(art === "anfragen" || art === "annehmen") && (
          <>
            <p className="mb-2 text-sm font-semibold text-slate-200">{t("friends.termsTitle")}</p>
            <FreundeBedingungen className="mb-4" />
          </>
        )}
        {art === "beenden" && <p className="mb-4 text-sm text-slate-300">{t("friends.removeConfirm", { name })}</p>}
        {art === "zurueckziehen" && <p className="mb-4 text-sm text-slate-300">{t("friends.withdrawConfirm", { name })}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm text-slate-300 hover:bg-slate-800">
            {t("common.cancel")}
          </button>
          {onAblehnen && (
            <button onClick={onAblehnen} disabled={busy}
              className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800">
              {t("friends.decline")}
            </button>
          )}
          <button onClick={onJa} disabled={busy}
            className={`rounded-xl px-4 py-2 text-sm font-semibold ${art === "beenden" || art === "zurueckziehen" ? ROT : JA}`}>
            {art === "anfragen" ? t("friends.requestConfirm") : art === "annehmen" ? t("friends.accept")
              : art === "beenden" ? t("friends.remove") : t("friends.withdraw")}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Knopf fuer die Foiler-Seite: zeigt den Stand und oeffnet den passenden Dialog. */
export function FreundschaftKnopf({ userId, name, status, onChange }: {
  userId: number; name: string; status: Freundschaft; onChange: (s: Freundschaft) => void;
}) {
  const t = useT();
  const [dialog, setDialog] = useState<Art | null>(null);
  const [busy, setBusy] = useState(false);
  const fertig = (p: Promise<{ status: Freundschaft }>) => {
    setBusy(true);
    p.then((r) => { onChange(r.status); setDialog(null); }).catch(() => {}).finally(() => setBusy(false));
  };
  const art: Art = status === "freund" ? "beenden" : status === "angefragt" ? "zurueckziehen"
    : status === "eingehend" ? "annehmen" : "anfragen";
  const label = status === "freund" ? t("friends.isFriend") : status === "angefragt" ? t("friends.requested")
    : status === "eingehend" ? t("friends.accept") : t("friends.request");
  const hervor = status === "eingehend" || status == null;
  return (
    <>
      <button onClick={() => setDialog(art)}
        className={`inline-flex shrink-0 items-center gap-1 self-start rounded-xl px-3 py-2 text-sm ${hervor
          ? "bg-brand-500 font-semibold text-slate-950 hover:bg-brand-400"
          : "border border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800"}`}>
        {label}
      </button>
      {dialog && (
        <FreundschaftDialog art={dialog} name={name} busy={busy} onClose={() => setDialog(null)}
          onJa={() => fertig(dialog === "anfragen" ? api.friendRequest(userId)
            : dialog === "annehmen" ? api.friendAccept(userId) : api.friendRemove(userId))}
          onAblehnen={dialog === "annehmen" ? () => fertig(api.friendDecline(userId)) : undefined} />
      )}
    </>
  );
}

/** Anfragen an mich, ganz oben auf der Startseite (Jan, 16.10.2026: „sollte vermutlich auch in meinem
 *  home gleich ganz oben mit auftauchen"). Annehmen oeffnet den Dialog mit dem Wortlaut, Ablehnen geht
 *  sofort und still — der andere erfaehrt es nicht (Server: friends.ablehnen). */
export function FreundesAnfragen() {
  const t = useT();
  const [liste, setListe] = useState<{ user_id: number; name: string | null }[]>([]);
  const [offen, setOffen] = useState<{ id: number; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const laden = () => api.friends().then((d) => setListe(d.eingehend)).catch(() => {});
  useEffect(() => {
    api.friendsCount().then((c) => { if (c.incoming > 0) laden(); }).catch(() => {});
  }, []);
  const ausfuehren = (p: Promise<{ status: Freundschaft }>) => {
    setBusy(true);
    p.then(() => { setOffen(null); laden(); }).catch(() => {}).finally(() => setBusy(false));
  };
  if (liste.length === 0) return null;
  return (
    <div className="mb-5 rounded-xl border border-brand-500/40 bg-brand-500/10 px-4 py-3 text-sm text-slate-200">
      {liste.map((f) => (
        <div key={f.user_id} className="flex flex-wrap items-center gap-2 py-1">
          <span className="min-w-0 flex-1">
            {t("friends.incomingFrom", { name: "\u0000" }).split("\u0000").map((teil, i) => (
              <span key={i}>{i > 0 && <Link to={`/foiler/${f.user_id}`} className="font-semibold hover:underline">{f.name ?? "—"}</Link>}{teil}</span>
            ))}
          </span>
          <button onClick={() => ausfuehren(api.friendDecline(f.user_id))} disabled={busy}
            className="rounded-xl border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50">
            {t("friends.decline")}
          </button>
          <button onClick={() => setOffen({ id: f.user_id, name: f.name ?? "—" })} disabled={busy}
            className="rounded-xl bg-brand-500 px-3 py-1.5 text-sm font-semibold text-slate-950 hover:bg-brand-400 disabled:opacity-50">
            {t("friends.accept")}
          </button>
        </div>
      ))}
      <p className="mt-1 text-sm text-slate-400">{t("friends.declineSilent")}</p>
      {offen && (
        <FreundschaftDialog art="annehmen" name={offen.name} busy={busy} onClose={() => setOffen(null)}
          onJa={() => ausfuehren(api.friendAccept(offen.id))}
          onAblehnen={() => ausfuehren(api.friendDecline(offen.id))} />
      )}
    </div>
  );
}
