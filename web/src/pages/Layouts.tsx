import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, WatchLayout } from "../lib/api";
import { Button, Card, Spinner } from "../components/ui";
import { LayoutPreview } from "../components/LayoutPreview";
import { ChevronIcon, WatchIcon } from "../components/Icons";
import { PREVIEW_SIZES, defaultElements } from "../lib/watchLayout";
import { useT } from "../i18n";

// Eigene Advanced-Layouts verwalten (F2 P1). Ein Layout = EINE Seite; die Kategorie sagt, wann
// sie gilt. Siehe docs/setup-and-watch-layouts.md.
const CATS = ["on_foil", "off_foil", "pause"] as const;

export default function Layouts() {
  const t = useT();
  const [rows, setRows] = useState<WatchLayout[] | null>(null);
  const [showData, setShowData] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => { api.layouts().then(setRows).catch(() => setRows([])); }, []);

  function create(category: (typeof CATS)[number]) {
    const size = PREVIEW_SIZES.find((s) => s.id === "g240") ?? PREVIEW_SIZES[2];
    api.layoutCreate({
      name: t(`lay.cat.${category}`), category, shape: size.shape, bg_color: 0,
      elements: defaultElements(),
      authored_w: size.w, authored_h: size.h, authored_shape: size.shape,
    }).then((l) => setRows((r) => [...(r ?? []), l])).catch(() => setErr(t("lay.saveErr")));
  }
  function publish(l: WatchLayout) {
    api.layoutPublish(l.id, !l.published)
      .then((n) => setRows((r) => (r ?? []).map((x) => (x.id === n.id ? n : x))))
      .catch(() => setErr(t("lay.saveErr")));
  }
  function copy(l: WatchLayout) {
    api.layoutCopy(l.id).then((n) => setRows((r) => [...(r ?? []), n])).catch(() => setErr(t("lay.saveErr")));
  }
  function del(l: WatchLayout) {
    if (!confirm(t("lay.delConfirm"))) return;
    api.layoutDelete(l.id).then(() => setRows((r) => (r ?? []).filter((x) => x.id !== l.id)))
      .catch(() => setErr(t("lay.saveErr")));
  }

  if (!rows) return <Spinner />;

  const card = (l: WatchLayout) => {
    const size = PREVIEW_SIZES.find((s) => s.w === l.authored_w && s.shape === l.authored_shape);
    return (
      <Card key={l.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <LayoutPreview layout={l} w={l.authored_w || 240} h={l.authored_h || 240} px={150}
          showData={showData} />
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{l.name}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
            <span className={`rounded px-1.5 py-px ${l.published
              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
              : "bg-slate-800 text-slate-300"}`}>
              {l.published ? t("lay.published") : t("lay.draft")}
            </span>
            {l.authored_w && (
              <span className="text-slate-400">
                {t("lay.authoredFor", { size: size ? size.label : `${l.authored_w}×${l.authored_h}` })}
              </span>
            )}
            {l.has_freetext && <span className="text-amber-700 dark:text-amber-300">{t("lay.hasFreetext")}</span>}
            {l.copied_from_id && <span className="text-slate-400">{t("lay.isCopy")}</span>}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Link to={`/layouts/${l.id}`}
            className="rounded-lg bg-brand-500 px-2.5 py-1.5 text-sm font-medium text-slate-950">
            {t("lay.edit")}
          </Link>
          <button onClick={() => publish(l)}
            className="rounded-lg bg-slate-800 px-2.5 py-1.5 text-sm text-slate-200 hover:bg-slate-700">
            {l.published ? t("lay.unpublish") : t("lay.publish")}
          </button>
          <button onClick={() => copy(l)}
            className="rounded-lg bg-slate-800 px-2.5 py-1.5 text-sm text-slate-200 hover:bg-slate-700">
            {t("lay.copy")}
          </button>
          <button onClick={() => del(l)}
            className="rounded-lg bg-slate-800 px-2.5 py-1.5 text-sm text-slate-300 hover:bg-slate-700">
            {t("common.deleteLower")}
          </button>
        </div>
      </Card>
    );
  };

  return (
    <div className="w-full">
      <Link to="/account?tab=views" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-300 hover:text-slate-200">
        <ChevronIcon className="h-4 w-4 rotate-180" /> {t("lay.toSimple")}
      </Link>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-xl font-bold">
          <WatchIcon className="h-5 w-5 text-brand-400" /> {t("lay.title")}
        </h2>
      </div>
      <p className="mb-4 text-sm text-slate-300">{t("lay.hint")}</p>
      <label className="mb-5 inline-flex items-center gap-2 text-sm text-slate-300">
        <input type="checkbox" checked={showData} onChange={(e) => setShowData(e.target.checked)}
          className="h-4 w-4 accent-brand-500" />
        {t("lay.showData")}
      </label>
      {err && <p className="mb-3 text-sm text-red-700 dark:text-red-300">{err}</p>}

      {CATS.map((c) => {
        const list = rows.filter((l) => l.category === c);
        return (
          <div key={c} className="mb-6">
            <div className="mb-1 flex items-center justify-between gap-2">
              <h3 className="font-semibold">{t(`lay.cat.${c}`)}</h3>
              <Button onClick={() => create(c)} className="text-sm">{t("lay.new")}</Button>
            </div>
            <p className="mb-3 text-sm text-slate-400">{t(`lay.catDesc.${c}`)}</p>
            <div className="space-y-3">
              {list.length === 0 && <p className="text-sm text-slate-500">{t("lay.empty")}</p>}
              {list.map(card)}
            </div>
          </div>
        );
      })}
      <p className="text-sm text-slate-400">{t("lay.notOnWatchYet")}</p>
    </div>
  );
}
