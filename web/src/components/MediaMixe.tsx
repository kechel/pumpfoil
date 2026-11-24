// Media-Ansicht, Musik (docs/MEDIA.md, Jan 24.11.2026): Musik-Einstellungen unter freiem Namen speichern, in der
// Community teilen und auf Knopfdruck fuer den eigenen Lauf laden. Ein Mix enthaelt nur Stimmen/Vorlage/Effekte, keine
// Laufdaten — er passt auf jeden Lauf. Server: api/mixe.py (prueft jede Einstellung, weil sie bei anderen zu Code wird).

import { useEffect, useState } from "react";
import { useT } from "../i18n";
import { api, type MusikMixOut } from "../lib/api";
import { neueStimme, type MusikCfg } from "../lib/media/musik";
import { TrashIcon } from "./Icons";

/** Gespeicherter Stand -> Einstellung zum Bearbeiten (frische Stimmen-IDs, Musik an). */
function ausMix(m: MusikMixOut, alt: MusikCfg): MusikCfg {
  const c = m.cfg ?? {};
  return {
    ...alt, an: true,
    vorlage: c.vorlage ?? alt.vorlage,
    stimmen: (c.stimmen ?? []).map((v: any) => ({ ...neueStimme(), ...v, id: neueStimme().id })),
    fx: { ...alt.fx, ...(c.fx ?? {}) },
    fxLaut: typeof c.fxLaut === "number" ? c.fxLaut : alt.fxLaut,
  };
}
const zumSpeichern = (m: MusikCfg) => ({ vorlage: m.vorlage, stimmen: m.stimmen, fx: m.fx, fxLaut: m.fxLaut });

export function MediaMixe({ musik, setMusik }: { musik: MusikCfg; setMusik: (m: MusikCfg) => void }) {
  const t = useT();
  const [meine, setMeine] = useState<MusikMixOut[]>([]);
  const [community, setCommunity] = useState<MusikMixOut[]>([]);
  const [aktiv, setAktiv] = useState<MusikMixOut | null>(null);   // zuletzt geladener/gespeicherter EIGENER Mix
  const [name, setName] = useState("");
  const [teilen, setTeilen] = useState(false);
  const [offen, setOffen] = useState<"" | "meine" | "community">("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [gespeichert, setGespeichert] = useState(false);

  const neuLaden = () => {
    api.mixe().then((r) => setMeine(Array.isArray(r) ? r : [])).catch(() => {});
    api.mixeCommunity().then((r) => setCommunity(Array.isArray(r) ? r : [])).catch(() => {});
  };
  useEffect(neuLaden, []);

  const speichern = async (alsNeu: boolean) => {
    setFehler(null);
    const n = name.trim();
    if (!n) { setFehler(t("media.mix.nameMissing")); return; }
    try {
      let m = aktiv && !alsNeu ? await api.mixAendern(aktiv.id, n, zumSpeichern(musik)) : await api.mixSpeichern(n, zumSpeichern(musik), teilen);
      if (aktiv && !alsNeu && m.published !== teilen) m = await api.mixTeilen(m.id, teilen);
      setAktiv(m);
      setGespeichert(true);
      window.setTimeout(() => setGespeichert(false), 2000);
      neuLaden();
    } catch (e: any) { setFehler(String(e?.message ?? e)); }
  };

  const laden = (m: MusikMixOut) => {
    setMusik(ausMix(m, musik));
    if (m.eigen) { setAktiv(m); setName(m.name); setTeilen(m.published); }
    else { setAktiv(null); setName(m.name); setTeilen(false); api.mixGeladen(m.id).catch(() => {}); }
    setOffen("");
  };

  const zeile = (m: MusikMixOut, eigeneListe: boolean) => (
    <li key={m.id} className="flex flex-wrap items-center gap-2 py-1.5 text-sm">
      <span className="min-w-0 flex-1 truncate text-slate-200">
        {m.name}
        {!eigeneListe && m.author && <span className="text-slate-400"> · {m.author}</span>}
        {eigeneListe && m.published && <span className="ml-1 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300">{t("media.mix.shared")}</span>}
        {m.geladen > 0 && <span className="text-xs text-slate-400"> · {t("media.mix.loads", { n: String(m.geladen) })}</span>}
      </span>
      <button className="rounded-lg bg-brand-500 px-2.5 py-1 text-xs font-semibold text-slate-950 hover:bg-brand-400" onClick={() => laden(m)}>
        {t("media.mix.load")}
      </button>
      {eigeneListe && (
        <>
          <button className="rounded-lg bg-slate-800 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-700"
            onClick={() => api.mixTeilen(m.id, !m.published).then(neuLaden).catch(() => {})}>
            {m.published ? t("media.mix.unshare") : t("media.mix.share")}
          </button>
          <button className="rounded-lg bg-slate-800 px-2 py-1 text-slate-300 hover:bg-slate-700" title={t("media.v.delete")}
            onClick={() => {
              if (!window.confirm(t("media.mix.deleteConfirm", { name: m.name }))) return;
              api.mixLoeschen(m.id).then(() => { if (aktiv?.id === m.id) setAktiv(null); neuLaden(); }).catch(() => {});
            }}><TrashIcon className="h-4 w-4" /></button>
        </>
      )}
    </li>
  );

  return (
    <div className="space-y-2 rounded-xl border border-slate-800 p-3">
      <div className="text-sm font-semibold">{t("media.mix.title")}</div>
      <div className="flex flex-wrap items-center gap-2">
        <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder={t("media.mix.namePlaceholder")}
          className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100" />
        <button className="rounded-lg bg-brand-500 px-3 py-1 text-sm font-semibold text-slate-950 hover:bg-brand-400" onClick={() => speichern(false)}>
          {gespeichert ? t("media.mix.saved") : t("media.mix.save")}
        </button>
        {aktiv && (
          <button className="rounded-lg bg-slate-800 px-3 py-1 text-sm text-slate-300 hover:bg-slate-700" onClick={() => speichern(true)}>
            {t("media.mix.saveNew")}
          </button>
        )}
      </div>
      <label className="flex items-center gap-2 text-xs text-slate-300">
        <input type="checkbox" checked={teilen} onChange={(e) => setTeilen(e.target.checked)} className="accent-brand-400" />
        {t("media.mix.shareCheckbox")}
      </label>
      {fehler && <p className="text-xs text-red-700 dark:text-red-300">{fehler}</p>}
      <div className="flex flex-wrap gap-2">
        <button className={`rounded-lg px-2.5 py-1 text-xs ${offen === "meine" ? "bg-brand-500 text-slate-950" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}
          onClick={() => setOffen(offen === "meine" ? "" : "meine")}>{t("media.mix.mine", { n: String(meine.length) })}</button>
        <button className={`rounded-lg px-2.5 py-1 text-xs ${offen === "community" ? "bg-brand-500 text-slate-950" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}
          onClick={() => setOffen(offen === "community" ? "" : "community")}>{t("media.mix.community", { n: String(community.length) })}</button>
      </div>
      {offen === "meine" && (meine.length
        ? <ul className="divide-y divide-slate-800">{meine.map((m) => zeile(m, true))}</ul>
        : <p className="text-xs text-slate-400">{t("media.mix.noneMine")}</p>)}
      {offen === "community" && (community.length
        ? <ul className="divide-y divide-slate-800">{community.map((m) => zeile(m, false))}</ul>
        : <p className="text-xs text-slate-400">{t("media.mix.noneCommunity")}</p>)}
    </div>
  );
}
