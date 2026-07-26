import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, Board, Stab } from "../lib/api";
import { Button, Card, Spinner } from "../components/ui";
import { ChevronIcon, StarIcon, FoilIcon } from "../components/Icons";
import { useT } from "../i18n";

// Detailed Setup: Stab (Katalog), Mastlänge, Shim-Winkel und Boards — jede Komponente
// verhält sich wie die Foils: „meine" markieren, eine als Standard (Stern), je Session
// überschreibbar. Bewusst KEIN kombiniertes Setup-Objekt (man wechselt real meist nur
// Stab oder Shim). Siehe docs/setup-and-watch-layouts.md.
export default function Setup() {
  const t = useT();
  const [stabs, setStabs] = useState<Stab[] | null>(null);
  const [brands, setBrands] = useState<string[]>([]);
  const [brand, setBrand] = useState("");
  const [q, setQ] = useState("");
  const [boards, setBoards] = useState<Board[]>([]);
  // Nutzer-Auswahl (settings_json)
  const [myStabs, setMyStabs] = useState<number[]>([]);
  const [stabId, setStabId] = useState<number | null>(null);
  const [myMasts, setMyMasts] = useState<number[]>([]);
  const [mastLen, setMastLen] = useState<number | null>(null);
  const [myShims, setMyShims] = useState<number[]>([]);
  const [shimDeg, setShimDeg] = useState<number | null>(null);
  const [boardId, setBoardId] = useState<number | null>(null);
  const [newMast, setNewMast] = useState("");
  const [newShim, setNewShim] = useState("");
  const [newBoard, setNewBoard] = useState({ name: "", volume_l: "", length_cm: "" });

  useEffect(() => {
    api.stabs().then(setStabs).catch(() => setStabs([]));
    api.stabBrands().then(setBrands).catch(() => {});
    api.boards().then(setBoards).catch(() => {});
    api.getSettings().then((s) => {
      setMyStabs((s.my_stabs as number[]) ?? []);
      setStabId((s.stab_id as number) ?? null);
      setMyMasts((s.my_masts as number[]) ?? []);
      setMastLen((s.mast_len_cm as number) ?? null);
      setMyShims((s.my_shims as number[]) ?? []);
      setShimDeg(s.shim_deg == null ? null : (s.shim_deg as number));
      setBoardId((s.board_id as number) ?? null);
    }).catch(() => {});
  }, []);

  // Ein Patch speichern und den zurückgegebenen (validierten!) Stand übernehmen — so zeigt
  // die UI exakt, was der Server behalten hat (Clamping/Dedupe inklusive).
  function save(patch: Record<string, unknown>) {
    api.saveSettings(patch).then((res) => {
      setMyStabs((res.my_stabs as number[]) ?? []);
      setStabId((res.stab_id as number) ?? null);
      setMyMasts((res.my_masts as number[]) ?? []);
      setMastLen((res.mast_len_cm as number) ?? null);
      setMyShims((res.my_shims as number[]) ?? []);
      setShimDeg(res.shim_deg == null ? null : (res.shim_deg as number));
      setBoardId((res.board_id as number) ?? null);
    }).catch(() => {});
  }

  // --- Stabs (Katalog, wie Foils) ---
  function toggleStab(id: number) {
    const next = myStabs.includes(id) ? myStabs.filter((x) => x !== id) : [...myStabs, id];
    save({ my_stabs: next, stab_id: myStabs.includes(id) && stabId === id ? null : stabId });
  }
  function setStabDefault(id: number) {
    save({ my_stabs: myStabs.includes(id) ? myStabs : [...myStabs, id], stab_id: stabId === id ? null : id });
  }

  // --- Masten / Shims (reine Werte, kein Katalog) ---
  function addMast() {
    const v = Math.round(Number(newMast.replace(",", ".")));
    if (!Number.isFinite(v) || v < 30 || v > 130) return;
    setNewMast("");
    save({ my_masts: [...myMasts, v] });
  }
  function addShim() {
    const v = Number(newShim.replace(",", "."));
    if (!Number.isFinite(v) || v < -5 || v > 5) return;
    setNewShim("");
    save({ my_shims: [...myShims, v] });
  }
  const fmtShim = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1).replace(/\.0$/, "")}°`;

  // --- Boards (eigene Einträge) ---
  function addBoard() {
    const name = newBoard.name.trim();
    if (!name) return;
    const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));
    api.boardCreate({ name, volume_l: num(newBoard.volume_l), length_cm: num(newBoard.length_cm) })
      .then((b) => { setBoards((bs) => [...bs, b]); setNewBoard({ name: "", volume_l: "", length_cm: "" }); })
      .catch(() => {});
  }
  function delBoard(id: number) {
    if (!confirm(t("setup.boardDelConfirm"))) return;
    api.boardDelete(id).then(() => {
      setBoards((bs) => bs.filter((b) => b.id !== id));
      if (boardId === id) setBoardId(null);
    }).catch(() => {});
  }

  const filtered = useMemo(() => {
    if (!stabs) return [];
    const ql = q.trim().toLowerCase();
    return stabs.filter((s) =>
      (!brand || s.brand === brand) &&
      (!ql || `${s.brand} ${s.model} ${s.size}`.toLowerCase().includes(ql)));
  }, [stabs, brand, q]);
  const mineList = useMemo(
    () => filtered.filter((s) => myStabs.includes(s.id)).sort((a, b) => (a.id === stabId ? -1 : b.id === stabId ? 1 : 0)),
    [filtered, myStabs, stabId]);
  const restList = useMemo(() => filtered.filter((s) => !myStabs.includes(s.id)), [filtered, myStabs]);

  if (!stabs) return <Spinner />;

  // Ein „Chip" für Mast/Shim: anklicken = Standard setzen/abwählen, × = aus meiner Liste.
  const valueChip = (label: string, isDefault: boolean, onPick: () => void, onRemove: () => void) => (
    <span key={label} className={`inline-flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-sm ${
      isDefault ? "border-brand-500 bg-brand-500/10 text-brand-700 dark:text-brand-300" : "border-slate-700 bg-slate-900 text-slate-200"}`}>
      <button onClick={onPick} className="inline-flex items-center gap-1" title={t("setup.setDefault")}>
        <StarIcon className="h-3.5 w-3.5" filled={isDefault} />
        {label}
      </button>
      <button onClick={onRemove} className="pl-1 text-slate-400 hover:text-red-400" title={t("common.deleteLower")}>×</button>
    </span>
  );

  const stabCard = (s: Stab) => {
    const isMine = myStabs.includes(s.id);
    const isDef = s.id === stabId;
    return (
      <Card key={s.id} className={`flex items-center justify-between gap-3 px-4 py-3 ${isDef ? "border-brand-500" : isMine ? "border-slate-600" : ""}`}>
        <div className="min-w-0">
          <div className="font-semibold">{s.brand} {s.model} <span className="text-slate-400">{s.size}</span></div>
          <div className="text-sm text-slate-400">
            {s.area_cm2 != null ? `${s.area_cm2} cm²` : t("setup.noSpecs")}
            {s.span_cm != null && ` · ${s.span_cm} cm`}
            {s.aspect_ratio != null && ` · AR ${s.aspect_ratio}`}
            {s.specs_estimated && (
              <span className="ml-1 rounded bg-amber-500/15 px-1 text-sm text-amber-700 dark:text-amber-300" title={t("setup.estimatedHint")}>
                {t("foils.estimated")}
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button onClick={() => setStabDefault(s.id)} title={t("setup.setDefault")}
            className={`rounded-lg px-2 py-1.5 ${isDef ? "bg-brand-500 text-slate-950" : "text-slate-400 hover:text-amber-300"}`}>
            <StarIcon className="h-4 w-4" filled={isDef} />
          </button>
          <button onClick={() => toggleStab(s.id)}
            className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ${isMine ? "bg-slate-700 text-slate-100" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>
            {isMine ? t("foils.remove") : t("foils.add")}
          </button>
        </div>
      </Card>
    );
  };

  return (
    <div className="w-full">
      <Link to="/foils" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-300 hover:text-slate-200">
        <ChevronIcon className="h-4 w-4 rotate-180" /> {t("foils.title")}
      </Link>
      <h2 className="mb-1 flex items-center gap-2 text-xl font-bold">
        <FoilIcon className="h-5 w-5 text-brand-400" /> {t("setup.title")}
      </h2>
      <p className="mb-5 text-sm text-slate-300">{t("setup.hint")}</p>

      {/* Mastlänge */}
      <Card className="mb-4 p-4">
        <h3 className="mb-1 font-semibold">{t("setup.mastTitle")}</h3>
        <p className="mb-3 text-sm text-slate-400">{t("setup.mastDesc")}</p>
        <div className="mb-3 flex flex-wrap gap-2">
          {myMasts.length === 0 && <span className="text-sm text-slate-500">{t("setup.emptyList")}</span>}
          {myMasts.map((m) => valueChip(
            `${m} cm`, m === mastLen,
            () => save({ mast_len_cm: m === mastLen ? null : m }),
            () => save({ my_masts: myMasts.filter((x) => x !== m), mast_len_cm: m === mastLen ? null : mastLen })))}
        </div>
        <div className="flex flex-wrap gap-2">
          <input value={newMast} onChange={(e) => setNewMast(e.target.value)} inputMode="decimal"
            placeholder={t("setup.mastPlaceholder")}
            className="w-32 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100" />
          <Button onClick={addMast} className="text-sm">{t("setup.addValue")}</Button>
        </div>
      </Card>

      {/* Shim */}
      <Card className="mb-4 p-4">
        <h3 className="mb-1 font-semibold">{t("setup.shimTitle")}</h3>
        <p className="mb-3 text-sm text-slate-400">{t("setup.shimDesc")}</p>
        <div className="mb-3 flex flex-wrap gap-2">
          {myShims.length === 0 && <span className="text-sm text-slate-500">{t("setup.emptyList")}</span>}
          {myShims.map((s) => valueChip(
            fmtShim(s), s === shimDeg,
            () => save({ shim_deg: s === shimDeg ? null : s }),
            () => save({ my_shims: myShims.filter((x) => x !== s), shim_deg: s === shimDeg ? null : shimDeg })))}
        </div>
        <div className="flex flex-wrap gap-2">
          <input value={newShim} onChange={(e) => setNewShim(e.target.value)} inputMode="decimal"
            placeholder={t("setup.shimPlaceholder")}
            className="w-32 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100" />
          <Button onClick={addShim} className="text-sm">{t("setup.addValue")}</Button>
        </div>
      </Card>

      {/* Boards */}
      <Card className="mb-4 p-4">
        <h3 className="mb-1 font-semibold">{t("setup.boardTitle")}</h3>
        <p className="mb-3 text-sm text-slate-400">{t("setup.boardDesc")}</p>
        <div className="mb-3 space-y-2">
          {boards.length === 0 && <span className="text-sm text-slate-500">{t("setup.emptyList")}</span>}
          {boards.map((b) => (
            <div key={b.id} className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 ${
              b.id === boardId ? "border-brand-500 bg-brand-500/5" : "border-slate-700 bg-slate-900/50"}`}>
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-100">{b.name}</div>
                <div className="text-sm text-slate-400">
                  {[b.volume_l != null && `${b.volume_l} l`, b.length_cm != null && `${b.length_cm} cm`]
                    .filter(Boolean).join(" · ") || t("setup.noSpecs")}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button onClick={() => save({ board_id: b.id === boardId ? null : b.id })} title={t("setup.setDefault")}
                  className={`rounded-lg px-2 py-1.5 ${b.id === boardId ? "bg-brand-500 text-slate-950" : "text-slate-400 hover:text-amber-300"}`}>
                  <StarIcon className="h-4 w-4" filled={b.id === boardId} />
                </button>
                <button onClick={() => delBoard(b.id)}
                  className="rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700">
                  {t("common.deleteLower")}
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <input value={newBoard.name} onChange={(e) => setNewBoard({ ...newBoard, name: e.target.value })}
            placeholder={t("setup.boardNamePlaceholder")}
            className="min-w-[10rem] flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100" />
          <input value={newBoard.volume_l} onChange={(e) => setNewBoard({ ...newBoard, volume_l: e.target.value })}
            inputMode="decimal" placeholder={t("setup.boardVolPlaceholder")}
            className="w-24 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100" />
          <input value={newBoard.length_cm} onChange={(e) => setNewBoard({ ...newBoard, length_cm: e.target.value })}
            inputMode="decimal" placeholder={t("setup.boardLenPlaceholder")}
            className="w-24 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100" />
          <Button onClick={addBoard} className="text-sm">{t("setup.addValue")}</Button>
        </div>
      </Card>

      {/* Stabs (Katalog) */}
      <h3 className="mb-1 font-semibold">{t("setup.stabTitle")}</h3>
      <p className="mb-3 text-sm text-slate-400">{t("setup.stabDesc")}</p>
      <div className="mb-4 flex flex-wrap gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("foils.search")}
          className="min-w-[12rem] flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100" />
        <select value={brand} onChange={(e) => setBrand(e.target.value)}
          className="rounded-xl border border-slate-700 bg-slate-900 px-2.5 py-2 text-sm text-slate-100">
          <option value="">{t("foils.allBrands")}</option>
          {brands.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
      </div>
      {mineList.length > 0 && (
        <div className="mb-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-300">{t("setup.myStabs")} ({mineList.length})</p>
          <div className="space-y-2">{mineList.map(stabCard)}</div>
        </div>
      )}
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{t("foils.catalog")}</p>
      <div className="space-y-2">
        {restList.map(stabCard)}
        {restList.length === 0 && <p className="text-sm text-slate-500">{t("setup.stabCatalogEmpty")}</p>}
        {restList.length > 0 && <p className="pt-2 text-xs text-slate-500">{t("foils.count", { n: restList.length })}</p>}
      </div>
    </div>
  );
}
