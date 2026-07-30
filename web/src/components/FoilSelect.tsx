import { useEffect, useState } from "react";
import { api, Board, Foil, SessionSummary, Stab } from "../lib/api";
import { FoilIcon } from "./Icons";
import { useT } from "../i18n";

// Setup einer Session anzeigen / (Owner) ändern: Foil + Stab + Mastlänge + Shim + Board.
// Jede Komponente ist unabhängig — man wechselt real meist nur Stab oder Shim (kein
// kombiniertes „Setup"-Objekt). Eigene zuerst, Standard = leere Auswahl (geerbt).
// Für den Owner erscheinen Auswahlfelder NUR für Komponenten, die er sich unter /setup
// eingerichtet hat — sonst bleibt die Badge-Zeile schlank.
export function FoilSelect({ session, owned, onMeta }: {
  session: SessionSummary; owned: boolean; onMeta: (s: SessionSummary) => void;
}) {
  const t = useT();
  const [foils, setFoils] = useState<Foil[] | null>(null);
  const [mine, setMine] = useState<number[]>([]);
  const [stabs, setStabs] = useState<Stab[]>([]);
  const [myStabs, setMyStabs] = useState<number[]>([]);
  const [myMasts, setMyMasts] = useState<number[]>([]);
  const [myShims, setMyShims] = useState<number[]>([]);
  const [boards, setBoards] = useState<Board[]>([]);

  useEffect(() => {
    if (!owned) return;
    api.foils().then(setFoils).catch(() => setFoils([]));
    api.getSettings().then((s) => {
      setMine((s.my_foils as number[]) ?? []);
      setMyStabs((s.my_stabs as number[]) ?? []);
      setMyMasts((s.my_masts as number[]) ?? []);
      setMyShims((s.my_shims as number[]) ?? []);
    }).catch(() => {});
    api.stabs().then(setStabs).catch(() => {});
    api.boards().then(setBoards).catch(() => {});
  }, [owned]);

  const foil = session.foil;
  const setup = session.setup;
  const fmtShim = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1).replace(/\.0$/, "")}°`;
  const stabLabel = (s: { brand: string; model: string; size: string }) => `${s.brand} ${s.model} ${s.size}`;

  const chip = (text: string, key?: string) => (
    <span key={key} className="inline-flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-xs text-slate-200">
      <FoilIcon className="h-3.5 w-3.5" /> {text}
    </span>
  );

  // Alle gesetzten Setup-Teile als Chips (Anzeige für Fremde bzw. solange nichts wählbar ist).
  const setupChips = () => {
    const out = [];
    if (setup?.stab) out.push(chip(stabLabel(setup.stab), "stab"));
    if (setup?.mast_len_cm != null) out.push(chip(`${setup.mast_len_cm} cm`, "mast"));
    if (setup?.shim_deg != null) out.push(chip(fmtShim(setup.shim_deg), "shim"));
    if (setup?.board) out.push(chip(setup.board.name, "board"));
    return out;
  };

  // Nicht-Owner: nur Anzeige (falls gesetzt).
  if (!owned || !foils) {
    return (
      <>
        {foil && chip(`${foil.brand} ${foil.model} ${foil.size}`, "foil")}
        {setupChips()}
      </>
    );
  }

  // Nutzer-Feedback: „Änderung von Sirus XXL auf Sirus XL — es muss nach oben gescrollt werden,
  // obwohl der XL auch in den Favoriten ist." Ursache: das Auswahlfeld klappt beim AUSGEWÄHLTEN
  // Eintrag auf. Steht der im langen Katalog-Block, liegen die Favoriten außerhalb des Sichtfelds.
  // Deshalb das aktuell gewählte Foil MIT in die Favoriten-Gruppe nehmen (und aus dem Katalog
  // lassen, damit es nicht doppelt erscheint) -> die Favoriten sind immer direkt sichtbar.
  const selId = session.foil_id ?? null;
  const quick = foils.filter((f) => mine.includes(f.id) || f.id === selId);
  const mineFoils = quick;
  const others = foils.filter((f) => !quick.some((q) => q.id === f.id));
  // Gleiche Logik für den Stabilizer (identische Falle, identische Lösung).
  const selStab = setup?.stab && setup.stab.is_default === false ? setup.stab.id : null;
  const mineStabs = stabs.filter((s) => myStabs.includes(s.id) || s.id === selStab);
  const otherStabs = stabs.filter((s) => !mineStabs.some((q) => q.id === s.id));

  const patch = (p: Parameters<typeof api.updateSessionMeta>[1]) =>
    api.updateSessionMeta(session.id, p).then(onMeta).catch(() => {});

  // Explizit für DIESE Session gesetzt? (sonst geerbter Nutzer-Standard -> leere Auswahl)
  const explicitStab = setup?.stab && setup.stab.is_default === false ? setup.stab.id : "";
  const explicitMast = setup?.mast_is_default === false ? setup.mast_len_cm ?? "" : "";
  const explicitShim = setup?.shim_is_default === false ? setup.shim_deg ?? "" : "";
  const explicitBoard = setup?.board && setup.board.is_default === false ? setup.board.id : "";

  const sel = "max-w-[14rem] rounded bg-slate-800 px-2 py-1 text-xs text-slate-200";

  return (
    <>
      <select value={session.foil_id ?? ""} onChange={(e) => patch({ foil_id: e.target.value === "" ? null : Number(e.target.value) })}
        className={sel} title={t("foil.label")}>
        <option value="">{t("foil.useDefault")}</option>
        {mineFoils.length > 0 && (
          <optgroup label={t("foils.title")}>
            {mineFoils.map((f) => <option key={f.id} value={f.id}>{f.brand} {f.model} {f.size}</option>)}
          </optgroup>
        )}
        <optgroup label={t("foils.allBrands")}>
          {others.map((f) => <option key={f.id} value={f.id}>{f.brand} {f.model} {f.size}</option>)}
        </optgroup>
      </select>

      {stabs.length > 0 && (
        <select value={explicitStab} onChange={(e) => patch({ stab_id: e.target.value === "" ? null : Number(e.target.value) })}
          className={sel} title={t("setup.stabTitle")}>
          <option value="">{setup?.stab ? stabLabel(setup.stab) : t("setup.stabTitle")}</option>
          {mineStabs.length > 0 && (
            <optgroup label={t("setup.myStabs")}>
              {mineStabs.map((s) => <option key={s.id} value={s.id}>{stabLabel(s)}</option>)}
            </optgroup>
          )}
          <optgroup label={t("foils.allBrands")}>
            {otherStabs.map((s) => <option key={s.id} value={s.id}>{stabLabel(s)}</option>)}
          </optgroup>
        </select>
      )}

      {myMasts.length > 0 && (
        <select value={explicitMast} onChange={(e) => patch({ mast_len_cm: e.target.value === "" ? null : Number(e.target.value) })}
          className={sel} title={t("setup.mastTitle")}>
          <option value="">{setup?.mast_len_cm != null ? `${setup.mast_len_cm} cm` : t("setup.mastTitle")}</option>
          {myMasts.map((m) => <option key={m} value={m}>{m} cm</option>)}
        </select>
      )}

      {myShims.length > 0 && (
        <select value={explicitShim} onChange={(e) => patch({ shim_deg: e.target.value === "" ? null : Number(e.target.value) })}
          className={sel} title={t("setup.shimTitle")}>
          <option value="">{setup?.shim_deg != null ? fmtShim(setup.shim_deg) : t("setup.shimTitle")}</option>
          {myShims.map((s) => <option key={s} value={s}>{fmtShim(s)}</option>)}
        </select>
      )}

      {boards.length > 0 && (
        <select value={explicitBoard} onChange={(e) => patch({ board_id: e.target.value === "" ? null : Number(e.target.value) })}
          className={sel} title={t("setup.boardTitle")}>
          <option value="">{setup?.board ? setup.board.name : t("setup.boardTitle")}</option>
          {boards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      )}
    </>
  );
}
