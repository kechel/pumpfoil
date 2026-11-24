// Media-Ansicht, Musik (docs/MEDIA.md, Jan 24.11.2026): frei kombinierbare Stimmen — je Stimme Instrument, Muster,
// wann sie spielt und welche Daten Tonhoehe, Lautstaerke, Klangfarbe, Dichte und Richtung steuern. Dieselben Daten
// duerfen mehrere Stimmen steuern. Vorlagen (die frueheren Stile) laden eine fertige Liste.

import { useT } from "../i18n";
import { CopyIcon, TrashIcon } from "./Icons";
import {
  DICHTE_Q, FARBE_Q, KITS, LAUT_Q, MUSTER, SAMPLES, STILE, SYNTHS, TON_Q, WANN,
  neueStimme, vorlage, type MusikCfg, type Stimme, type Verfuegbar,
} from "../lib/media/musik";

const SEL = "min-w-0 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100";

function Feld({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0 text-xs text-slate-400">
      {label}
      <div className="mt-0.5">{children}</div>
    </label>
  );
}

export function MediaStimmen({ musik, setMusik, klaengeDa, da }: {
  musik: MusikCfg; setMusik: (m: MusikCfg) => void; klaengeDa: boolean; da: Verfuegbar;
}) {
  const t = useT();
  const setze = (id: string, teil: Partial<Stimme>) =>
    setMusik({ ...musik, stimmen: musik.stimmen.map((v) => (v.id === id ? { ...v, ...teil } : v)) });
  const quelleDa = (q: string) => !((q === "puls" && !da.puls) || (q === "pumpfreq" && !da.pumps) || (q === "carve" && !da.carves));
  const wannDa = (w: string) => !((w === "pump" && !da.pumps) || (w === "sprint" && !da.sprints)
    || (w === "carve" && !da.carves) || (w === "gleiten" && !da.glides));
  const knopf = (an: boolean) => `h-7 min-w-7 rounded-md px-1.5 text-xs font-bold ${an ? "bg-brand-500 text-slate-950" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm text-slate-300">
        <span>{t("media.music.template")}</span>
        <select value={musik.vorlage} className={`${SEL} w-auto`}
          onChange={(e) => {
            const st = e.target.value as MusikCfg["vorlage"];
            setMusik({ ...musik, vorlage: st, stimmen: vorlage(st), basisMix: null });
          }}>
          {STILE.map((st) => <option key={st} value={st}>{t(`media.style.${st}`)}</option>)}
        </select>
        <button className="rounded-lg bg-slate-800 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-700"
          onClick={() => setMusik({ ...musik, stimmen: vorlage(musik.vorlage), basisMix: null })}>{t("media.music.reset")}</button>
      </div>
      <p className="text-xs text-slate-400">{t("media.music.voicesHint")}</p>

      {musik.stimmen.map((v, i) => {
        const kit = v.instrument.startsWith("kit:");
        return (
          <div key={v.id} className={`space-y-2 rounded-xl border border-slate-800 p-3 ${v.stumm ? "opacity-50" : ""}`}>
            <div className="flex items-center gap-2">
              <input value={v.name} maxLength={24} onChange={(e) => setze(v.id, { name: e.target.value })}
                aria-label={t("media.v.name")}
                className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-1 py-0.5 text-sm font-semibold text-slate-100 hover:border-slate-700 focus:border-slate-600" />
              <button className={knopf(v.stumm)} title={t("media.v.mute")} onClick={() => setze(v.id, { stumm: !v.stumm })}>M</button>
              <button className={knopf(v.solo)} title={t("media.v.solo")} onClick={() => setze(v.id, { solo: !v.solo })}>S</button>
              <button className={knopf(false)} title={t("media.v.duplicate")} onClick={() => {
                const kopie = neueStimme({ ...v, id: undefined as unknown as string, name: `${v.name} 2`, solo: false });
                const l = musik.stimmen.slice(); l.splice(i + 1, 0, { ...kopie, id: neueStimme().id });
                setMusik({ ...musik, stimmen: l });
              }}><CopyIcon className="mx-auto h-4 w-4" /></button>
              <button className={knopf(false)} title={t("media.v.delete")}
                onClick={() => setMusik({ ...musik, stimmen: musik.stimmen.filter((x) => x.id !== v.id) })}><TrashIcon className="mx-auto h-4 w-4" /></button>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Feld label={t("media.v.instrument")}>
                <select className={SEL} value={v.instrument} onChange={(e) => {
                  const instrument = e.target.value;
                  const nachKit = instrument.startsWith("kit:");
                  setze(v.id, { instrument, ...(nachKit && v.muster !== "treffer" && v.muster !== "beat" ? { muster: "treffer" as const } : {}) });
                }}>
                  <optgroup label={t("media.v.synths")}>{SYNTHS.map((x) => <option key={x} value={x}>{t(`media.instr.${x.replace(":", "_")}`)}</option>)}</optgroup>
                  {klaengeDa && <optgroup label={t("media.music.instruments")}>{SAMPLES.map((x) => <option key={x} value={x}>{t(`media.instr.${x}`)}</option>)}</optgroup>}
                  <optgroup label={t("media.v.drums")}>{KITS.filter((x) => klaengeDa || x === "kit:synth").map((x) => <option key={x} value={x}>{t(`media.instr.${x.replace(":", "_")}`)}</option>)}</optgroup>
                </select>
              </Feld>
              <Feld label={t("media.v.pattern")}>
                <select className={SEL} value={v.muster} onChange={(e) => setze(v.id, { muster: e.target.value as Stimme["muster"] })}>
                  {MUSTER.filter((m) => !kit || m === "treffer" || m === "beat").map((m) => <option key={m} value={m}>{t(`media.m.${m}`)}</option>)}
                </select>
              </Feld>
              <Feld label={t("media.v.when")}>
                <select className={SEL} value={v.wann} onChange={(e) => setze(v.id, { wann: e.target.value as Stimme["wann"] })}>
                  {WANN.filter((w) => wannDa(w) || w === v.wann).map((w) => <option key={w} value={w}>{t(`media.w.${w}`)}</option>)}
                </select>
              </Feld>
              {!kit && (
                <Feld label={t("media.v.pitch")}>
                  <select className={SEL} value={v.ton} onChange={(e) => setze(v.id, { ton: e.target.value as Stimme["ton"] })}>
                    {TON_Q.filter((q) => quelleDa(q) || q === v.ton).map((q) => <option key={q} value={q}>{t(`media.q2.${q}`)}</option>)}
                  </select>
                </Feld>
              )}
              <Feld label={t("media.v.volume")}>
                <select className={SEL} value={v.laut} onChange={(e) => setze(v.id, { laut: e.target.value as Stimme["laut"] })}>
                  {LAUT_Q.filter((q) => quelleDa(q) || q === v.laut).map((q) => <option key={q} value={q}>{t(`media.q2.${q}`)}</option>)}
                </select>
              </Feld>
              <Feld label={t("media.v.brightness")}>
                <select className={SEL} value={v.farbe} onChange={(e) => setze(v.id, { farbe: e.target.value as Stimme["farbe"] })}>
                  {FARBE_Q.filter((q) => quelleDa(q) || q === v.farbe).map((q) => <option key={q} value={q}>{t(`media.q2.${q}`)}</option>)}
                </select>
              </Feld>
              {v.wann !== "pump" && v.wann !== "meter" && v.muster !== "akkord" && (
                <Feld label={t("media.v.density")}>
                  <select className={SEL} value={v.dichte} onChange={(e) => setze(v.id, { dichte: e.target.value as Stimme["dichte"] })}>
                    {DICHTE_Q.filter((q) => quelleDa(q) || q === v.dichte).map((q) => <option key={q} value={q}>{t(`media.q2.${q}`)}</option>)}
                  </select>
                </Feld>
              )}
              {da.carves && (
                <Feld label={t("media.v.pan")}>
                  <select className={SEL} value={v.pan} onChange={(e) => setze(v.id, { pan: e.target.value as Stimme["pan"] })}>
                    <option value="mitte">{t("media.v.center")}</option>
                    <option value="carve">{t("media.v.panCarve")}</option>
                  </select>
                </Feld>
              )}
              {!kit && (
                <Feld label={t("media.v.octave")}>
                  <select className={SEL} value={v.oktave} onChange={(e) => setze(v.id, { oktave: Number(e.target.value) })}>
                    {[1, 2, 3, 4, 5, 6].map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </Feld>
              )}
            </div>
            <label className="flex items-center gap-3 text-xs text-slate-400">
              {t("media.v.level")}
              <input type="range" min={0} max={1} step={0.05} value={v.lautstaerke}
                onChange={(e) => setze(v.id, { lautstaerke: Number(e.target.value) })} className="min-w-0 flex-1 accent-brand-400" />
              <span className="w-8 text-right tabular-nums">{Math.round(v.lautstaerke * 100)}</span>
            </label>
          </div>
        );
      })}
      <button className="rounded-lg border border-dashed border-slate-600 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
        onClick={() => setMusik({ ...musik, stimmen: [...musik.stimmen, neueStimme({ name: t("media.v.newName"), instrument: klaengeDa ? "pf_piano" : "synth:triangle" })] })}>
        + {t("media.v.add")}
      </button>
      {klaengeDa && <p className="text-xs text-slate-400">{t("media.music.instrLicense")}</p>}
    </div>
  );
}
