import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, WatchLayout } from "../lib/api";
import { Card, Spinner } from "../components/ui";
import { LayoutPreview } from "../components/LayoutPreview";
import { ChevronIcon, CommunityIcon } from "../components/Icons";
import { PREVIEW_SIZES, WatchShape } from "../lib/watchLayout";
import { useT } from "../i18n";

// Community-Galerie: veröffentlichte Layouts ansehen und ins eigene Profil kopieren.
// Vorschau standardmäßig in der Größe der EIGENEN Uhr (aus den gepairten Geräten) — so sieht man
// sofort, was ein Layout für einen selbst bedeutet. Pro Karte umschaltbar auf „wie der Autor es
// entworfen hat". Filter sind Komfort, KEINE Schranke: kopieren darf man jedes Layout, auch von
// anderer Größe/Form (die Koordinaten sind relativ). Siehe docs/setup-and-watch-layouts.md.
const CATS = ["", "on_foil", "off_foil", "pause"] as const;

export default function LayoutGallery() {
  const t = useT();
  const [rows, setRows] = useState<WatchLayout[] | null>(null);
  const [cat, setCat] = useState("");
  const [shape, setShape] = useState("");
  const [sizeId, setSizeId] = useState("g240");
  const [ownSize, setOwnSize] = useState<{ w: number; h: number; shape: WatchShape; label: string } | null>(null);
  const [showData, setShowData] = useState(true);
  const [asAuthor, setAsAuthor] = useState<Record<number, boolean>>({});
  const [copied, setCopied] = useState<number[]>([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    // Eigene Uhr: die zuletzt gesehene mit bekannten Displaymaßen (Garmin liefert sie aus dem
    // Build-Katalog). Bis Apple/Wear ihre Maße melden, bleibt die Auswahl unten der Weg.
    api.myDevices().then((ds) => {
      const d = ds.find((x) => x.screen_w && x.screen_h);
      if (d?.screen_w && d.screen_h) {
        const s = { w: d.screen_w, h: d.screen_h, shape: (d.shape as WatchShape) || "round", label: d.model || d.label || "" };
        setOwnSize(s);
        const m = PREVIEW_SIZES.find((p) => p.w === s.w && p.shape === s.shape);
        if (m) setSizeId(m.id);
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    setRows(null);
    api.layoutCommunity({ category: cat || undefined, shape: shape || undefined })
      .then(setRows).catch(() => setRows([]));
  }, [cat, shape]);

  const size = useMemo(() => PREVIEW_SIZES.find((s) => s.id === sizeId) ?? PREVIEW_SIZES[2], [sizeId]);

  function copy(l: WatchLayout) {
    api.layoutCopy(l.id).then(() => setCopied((c) => [...c, l.id])).catch(() => setErr(t("lay.saveErr")));
  }

  const card = (l: WatchLayout) => {
    const mine = asAuthor[l.id] !== true;
    const w = mine ? size.w : l.authored_w || size.w;
    const h = mine ? size.h : l.authored_h || size.h;
    const sh = (mine ? size.shape : (l.authored_shape as WatchShape) || size.shape) as WatchShape;
    return (
      <Card key={l.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <LayoutPreview layout={l} w={w} h={h} shape={sh} px={150} showData={showData} />
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{l.name}</div>
          <div className="text-sm text-slate-300">{t("lay.byAuthor", { name: l.author ?? "?" })}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-slate-400">{t(`lay.cat.${l.category}`)}</span>
            {l.authored_w && (
              <span className="text-slate-400">
                {t("lay.authoredFor", { size: `${l.authored_w}×${l.authored_h}` })}
              </span>
            )}
            {(l.used_by ?? 0) > 0 && (
              <span className="text-brand-700 dark:text-brand-300">{t("lay.usedBy", { n: l.used_by ?? 0 })}</span>
            )}
            {(l.copies ?? 0) > 0 && <span className="text-slate-400">{t("lay.copies", { n: l.copies ?? 0 })}</span>}
            {l.has_freetext && <span className="text-amber-700 dark:text-amber-300">{t("lay.hasFreetext")}</span>}
          </div>
          <label className="mt-2 inline-flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={asAuthor[l.id] === true}
              onChange={(e) => setAsAuthor((m) => ({ ...m, [l.id]: e.target.checked }))}
              className="h-4 w-4 accent-brand-500" />
            {t("lay.asAuthor")}
          </label>
        </div>
        <div className="shrink-0">
          {copied.includes(l.id) ? (
            <Link to="/layouts" className="text-sm text-brand-700 hover:underline dark:text-brand-300">
              {t("lay.copiedGoto")}
            </Link>
          ) : (
            <button onClick={() => copy(l)}
              className="rounded-lg bg-brand-500 px-2.5 py-1.5 text-sm font-medium text-slate-950">
              {t("lay.copyToMine")}
            </button>
          )}
        </div>
      </Card>
    );
  };

  return (
    <div className="w-full">
      <Link to="/layouts" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-300 hover:text-slate-200">
        <ChevronIcon className="h-4 w-4 rotate-180" /> {t("lay.title")}
      </Link>
      <h2 className="mb-1 flex items-center gap-2 text-xl font-bold">
        <CommunityIcon className="h-5 w-5 text-brand-400" /> {t("lay.galleryTitle")}
      </h2>
      <p className="mb-4 text-sm text-slate-300">{t("lay.galleryHint")}</p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select value={cat} onChange={(e) => setCat(e.target.value)}
          className="rounded-xl border border-slate-700 bg-slate-900 px-2.5 py-2 text-sm text-slate-100">
          {CATS.map((c) => <option key={c} value={c}>{c ? t(`lay.cat.${c}`) : t("lay.allCats")}</option>)}
        </select>
        <select value={shape} onChange={(e) => setShape(e.target.value)}
          className="rounded-xl border border-slate-700 bg-slate-900 px-2.5 py-2 text-sm text-slate-100">
          <option value="">{t("lay.allShapes")}</option>
          {["round", "rect", "semioctagon"].map((s) => <option key={s} value={s}>{t(`lay.shape.${s}`)}</option>)}
        </select>
        <select value={sizeId} onChange={(e) => setSizeId(e.target.value)}
          className="rounded-xl border border-slate-700 bg-slate-900 px-2.5 py-2 text-sm text-slate-100">
          {PREVIEW_SIZES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <label className="inline-flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={showData} onChange={(e) => setShowData(e.target.checked)}
            className="h-4 w-4 accent-brand-500" />
          {t("lay.showData")}
        </label>
      </div>
      {ownSize && <p className="mb-4 text-sm text-slate-400">{t("lay.ownWatchNote", { name: ownSize.label })}</p>}
      {err && <p className="mb-3 text-sm text-red-700 dark:text-red-300">{err}</p>}

      {!rows ? <Spinner /> : rows.length === 0 ? (
        <p className="text-sm text-slate-400">{t("lay.galleryEmpty")}</p>
      ) : (
        <div className="space-y-3">{rows.map(card)}</div>
      )}
    </div>
  );
}
