import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, LayoutElement, WatchLayout } from "../lib/api";
import { Button, Card, Spinner } from "../components/ui";
import { LayoutPreview } from "../components/LayoutPreview";
import { ChevronIcon } from "../components/Icons";
import { FIELD_OPTIONS } from "../lib/fields";
import {
  EL_DOTS, EL_LABEL, EL_LINE, EL_REC, EL_TEXT, EL_VALUE,
  MAX_ELEMENTS, MAX_SIZE_STEP, MAX_TEXT_LEN, MAX_TEXT_STEP, MOCK_VALUE, PALETTE, PREVIEW_SIZES,
  SIZE_STEPS, SMALLEST, undisplayableChars, watchTextWidthRatio,
} from "../lib/watchLayout";
import { useT } from "../i18n";

// Editor für EIN Advanced-Layout (F2 P1). Frei positionieren per Ziehen; Koordinaten sind relativ
// 0…1000, damit dasselbe Layout auf jeder Auflösung/Form läuft. Die Uhrengröße oben ist ein
// PRÜF-Werkzeug (und legt beim Speichern die Entstehungs-Angabe fest) — kein zweiter Datensatz.
// Design/Constraints: docs/setup-and-watch-layouts.md.

const ADDABLE = [
  { typ: EL_VALUE, key: "addValue" },
  { typ: EL_LABEL, key: "addLabel" },
  { typ: EL_TEXT, key: "addText" },
  { typ: EL_LINE, key: "addLine" },
  { typ: EL_REC, key: "addRec" },
  { typ: EL_DOTS, key: "addDots" },
];

export default function LayoutEditor() {
  const t = useT();
  const { id } = useParams();
  const nav = useNavigate();
  const [l, setL] = useState<WatchLayout | null | undefined>(undefined);
  const [sizeId, setSizeId] = useState("g240");
  // Wurde die Uhrengröße vom Nutzer bewusst gewählt? Nur dann darf sie beim Speichern die
  // Entstehungs-Angabe überschreiben — sonst würde ein Layout, das für eine hier nicht
  // gelistete Größe entworfen wurde, beim ersten Speichern stillschweigend „umgetauft".
  const [sizeTouched, setSizeTouched] = useState(false);
  const [showData, setShowData] = useState(true);
  const [sel, setSel] = useState(-1);
  const [saved, setSaved] = useState(false);
  // Echte Seitenzahl der Uhr = eigene Seiten + Übersichts-Seite. Nur so stimmen die
  // Seiten-Punkte in der Vorschau mit dem Gerät überein.
  const [pageCount, setPageCount] = useState(3);
  const [pageIndex, setPageIndex] = useState(0);
  const [err, setErr] = useState("");
  const boxRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<
    { i: number; handle: "move" | "a" | "b"; grabX: number; grabY: number; started: boolean } | null
  >(null);

  const size = PREVIEW_SIZES.find((s) => s.id === sizeId) ?? PREVIEW_SIZES[2];

  useEffect(() => {
    api.layouts().then((rows) => {
      const found = rows.find((x) => String(x.id) === id) ?? null;
      setL(found);
      if (found?.authored_w) {
        const m = PREVIEW_SIZES.find((s) => s.w === found.authored_w && s.shape === found.authored_shape);
        if (m) setSizeId(m.id);
      }
    }).catch(() => setL(null));
    api.getSettings().then((st) => {
      const pg = (st.pages as unknown[]) ?? (st.views as unknown[]) ?? [];
      setPageCount(pg.length + 1);
      const i = pg.findIndex((x) => typeof x === "number" && String(x) === id);
      setPageIndex(i >= 0 ? i : 0);
    }).catch(() => {});
  }, [id]);

  function patchEl(i: number, next: LayoutElement) {
    setL((p) => (p ? { ...p, elements: p.elements.map((e, k) => (k === i ? next : e)) } : p));
    setSaved(false);
  }
  function setField(i: number, pos: number, v: number | string) {
    const e = [...(l?.elements[i] ?? [])];
    e[pos] = v;
    patchEl(i, e);
  }
  function addElement(typ: number) {
    if (!l || l.elements.length >= MAX_ELEMENTS) { setErr(t("lay.maxElements")); return; }
    const base: LayoutElement =
      typ === EL_LINE ? [typ, 150, 500, 1, 3, 0, 850, 500]
      : typ === EL_TEXT ? [typ, 500, 700, 1, 0, 0, t("lay.newText")]
      : typ === EL_VALUE || typ === EL_LABEL ? [typ, 500, 500, typ === EL_VALUE ? 3 : 1, 0, 0, 1]
      : [typ, 500, typ === EL_REC ? 85 : 920, 1, typ === EL_REC ? 5 : 2, 0];
    setL({ ...l, elements: [...l.elements, base] });
    setSel(l.elements.length);
    setErr("");
    setSaved(false);
  }
  function delElement(i: number) {
    if (!l) return;
    setL({ ...l, elements: l.elements.filter((_, k) => k !== i) });
    setSel(-1);
    setSaved(false);
  }

  // --- Ziehen: Pointer auf dem Element greifen, Bewegung auf die 0…1000-Skala umrechnen ---
  // Bei einer Trennlinie hängt es am Griff: „move" verschiebt die GANZE Linie (beide Punkte,
  // Ausrichtung und Länge bleiben), „a"/„b" zieht einen Endpunkt frei.
  function onDown(i: number, e: React.PointerEvent, handle: "move" | "a" | "b" = "move") {
    setSel(i);
    const el = l?.elements[i];
    const grabX = Number(el?.[1]) || 0;
    const grabY = Number(el?.[2]) || 0;
    dragRef.current = { i, handle, grabX, grabY, started: false };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }
  function onMove(e: React.PointerEvent) {
    const d = dragRef.current;
    const box = boxRef.current;
    if (!d || !box || !l) return;
    const r = box.getBoundingClientRect();
    const x = Math.max(0, Math.min(1000, Math.round(((e.clientX - r.left) / r.width) * 1000)));
    const y = Math.max(0, Math.min(1000, Math.round(((e.clientY - r.top) / r.height) * 1000)));
    const el = [...l.elements[d.i]];
    const isLine = Number(el[0]) === EL_LINE;
    if (isLine && d.handle === "b") {
      el[6] = x; el[7] = y;
    } else if (isLine && d.handle === "move") {
      // Gegriffen wird irgendwo AUF der Linie: den Versatz zum ersten Punkt beibehalten, damit die
      // Linie nicht zum Zeiger springt, und den zweiten Punkt mitziehen.
      if (!d.started) { d.grabX = x - (Number(el[1]) || 0); d.grabY = y - (Number(el[2]) || 0); d.started = true; }
      const dx = x - d.grabX - (Number(el[1]) || 0);
      const dy = y - d.grabY - (Number(el[2]) || 0);
      const cl = (v: number) => Math.max(0, Math.min(1000, v));
      el[1] = cl((Number(el[1]) || 0) + dx); el[2] = cl((Number(el[2]) || 0) + dy);
      el[6] = cl((Number(el[6]) || 0) + dx); el[7] = cl((Number(el[7]) || 0) + dy);
    } else {
      el[1] = x; el[2] = y;
    }
    patchEl(d.i, el);
  }
  function onUp() { dragRef.current = null; }

  // Ausrichtung/Länge einer Trennlinie: um die Mitte herum neu setzen, damit sie beim Umschalten
  // nicht wegwandert. „frei" lässt die Punkte, wie sie sind (Diagonalen bleiben möglich).
  function lineGeom(el: LayoutElement) {
    const x1 = Number(el[1]) || 0, y1 = Number(el[2]) || 0;
    const x2 = Number(el[6]) || 0, y2 = Number(el[7]) || 0;
    const dx = Math.abs(x2 - x1), dy = Math.abs(y2 - y1);
    const orient = dy <= 2 && dx > 2 ? "h" : dx <= 2 && dy > 2 ? "v" : "free";
    const len = orient === "v" ? dy : orient === "h" ? dx : Math.round(Math.hypot(dx, dy));
    return { x1, y1, x2, y2, cx: (x1 + x2) / 2, cy: (y1 + y2) / 2, orient, len };
  }
  function setLine(i: number, orient: "h" | "v", len?: number) {
    if (!l) return;
    const el = [...l.elements[i]];
    const g = lineGeom(el as LayoutElement);
    const half = Math.max(10, Math.min(1000, len ?? (g.orient === "free" ? 700 : g.len))) / 2;
    const c = (v: number) => Math.max(0, Math.min(1000, Math.round(v)));
    if (orient === "h") {
      el[1] = c(g.cx - half); el[6] = c(g.cx + half); el[2] = c(g.cy); el[7] = c(g.cy);
    } else {
      el[2] = c(g.cy - half); el[7] = c(g.cy + half); el[1] = c(g.cx); el[6] = c(g.cx);
    }
    patchEl(i, el);
  }

  // --- Warnungen: Überlauf auf der kleinsten Uhr + Zeichen, die die Uhr nicht kann ---
  const warnings = useMemo(() => {
    if (!l) return [] as string[];
    const out: string[] = [];
    const boxW = SMALLEST.w;
    for (const e of l.elements) {
      const typ = Number(e[0]);
      const step = Number(e[3]) || 0;
      let text = "";
      if (typ === EL_VALUE) text = MOCK_VALUE[Number(e[6]) || 0] ?? "--";
      else if (typ === EL_LABEL) text = t(`fw.${Number(e[6]) || 0}`);
      else if (typ === EL_TEXT) text = String(e[6] ?? "");
      if (text) {
        // Breite, die die UHR braucht (aus den im Simulator gemessenen Fontbreiten), nicht die
        // Breite in der Vorschau-Schrift — gewarnt werden soll ja vor Überlauf auf dem Gerät.
        const wPx = watchTextWidthRatio(text, step) * boxW;
        const cx = (Number(e[1]) / 1000) * boxW;
        const flags = Number(e[5]) || 0;
        const left = flags & 1 ? cx : flags & 2 ? cx - wPx : cx - wPx / 2;
        if (left < 0 || left + wPx > boxW) out.push(t("lay.warnOverflow", { text }));
      }
      if (typ === EL_TEXT) {
        const bad = undisplayableChars(String(e[6] ?? ""));
        if (bad.length) out.push(t("lay.warnChars", { chars: bad.join(" ") }));
      }
    }
    return [...new Set(out)];
  }, [l, t]);

  function save() {
    if (!l) return;
    const keep = !sizeTouched && l.authored_w != null;
    api.layoutUpdate(l.id, {
      name: l.name, category: l.category,
      shape: (keep ? (l.authored_shape as typeof size.shape) : size.shape) || size.shape,
      bg_color: l.bg_color, elements: l.elements,
      authored_w: keep ? l.authored_w : size.w,
      authored_h: keep ? l.authored_h : size.h,
      authored_shape: keep ? l.authored_shape : size.shape,
    }).then((n) => { setL(n); setSaved(true); setErr(""); }).catch(() => setErr(t("lay.saveErr")));
  }

  if (l === undefined) return <Spinner />;
  if (l === null) {
    return (
      <div className="w-full">
        <p className="text-sm text-slate-300">{t("lay.notFound")}</p>
        <Link to="/layouts" className="mt-2 inline-block text-sm text-brand-700 dark:text-brand-300">{t("lay.backToList")}</Link>
      </div>
    );
  }

  const e = sel >= 0 ? l.elements[sel] : null;
  const typ = e ? Number(e[0]) : 0;
  const swatch = (idx: number, active: boolean, onPick: () => void) => (
    <button key={idx} onClick={onPick} title={PALETTE[idx]}
      className={`h-6 w-6 rounded border ${active ? "border-brand-400 ring-2 ring-brand-500" : "border-slate-600"}`}
      style={{ background: PALETTE[idx] === "auto" ? "linear-gradient(135deg,#fff 50%,#94a3b8 50%)" : PALETTE[idx] }} />
  );

  return (
    <div className="w-full">
      <Link to="/layouts" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-300 hover:text-slate-200">
        <ChevronIcon className="h-4 w-4 rotate-180" /> {t("lay.title")}
      </Link>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input value={l.name} onChange={(ev) => { setL({ ...l, name: ev.target.value }); setSaved(false); }}
          className="min-w-[10rem] flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100" />
        <select value={l.category} onChange={(ev) => { setL({ ...l, category: ev.target.value as WatchLayout["category"] }); setSaved(false); }}
          className="rounded-xl border border-slate-700 bg-slate-900 px-2.5 py-2 text-sm text-slate-100">
          {["on_foil", "off_foil", "pause"].map((c) => <option key={c} value={c}>{t(`lay.cat.${c}`)}</option>)}
        </select>
        <Button onClick={save} className="text-sm">{t("common.save")}</Button>
        {saved && <span className="text-sm text-emerald-700 dark:text-emerald-400">{t("account.saved")}</span>}
      </div>
      {err && <p className="mb-3 text-sm text-red-700 dark:text-red-300">{err}</p>}

      <div className="flex flex-col gap-5 lg:flex-row">
        {/* Vorschau + Ziehen */}
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <select value={sizeId} onChange={(ev) => { setSizeId(ev.target.value); setSizeTouched(true); }}
              className="rounded-xl border border-slate-700 bg-slate-900 px-2.5 py-2 text-sm text-slate-100">
              {PREVIEW_SIZES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
            <label className="inline-flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={showData} onChange={(ev) => setShowData(ev.target.checked)}
                className="h-4 w-4 accent-brand-500" />
              {t("lay.showData")}
            </label>
          </div>
          <div ref={boxRef} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}
            className="inline-block touch-none">
            <LayoutPreview layout={{ ...l, shape: size.shape }} w={size.w} h={size.h} px={280}
              showData={showData} selected={sel} pageCount={pageCount} pageIndex={pageIndex}
              onPickElement={setSel} onElementPointerDown={onDown} />
          </div>
          <p className="mt-2 max-w-[280px] text-sm text-slate-400">{t("lay.dragHint")}</p>

          <div className="mt-3">
            <div className="mb-1 text-sm text-slate-300">{t("lay.bgColor")}</div>
            <div className="flex flex-wrap gap-1.5">
              {PALETTE.map((_, i) => swatch(i, l.bg_color === i, () => { setL({ ...l, bg_color: i }); setSaved(false); }))}
            </div>
          </div>
        </div>

        {/* Elemente + Eigenschaften */}
        <div className="min-w-0 flex-1">
          <div className="mb-3 flex flex-wrap gap-2">
            {ADDABLE.map((a) => (
              <button key={a.typ} onClick={() => addElement(a.typ)}
                className="rounded-lg bg-slate-800 px-2.5 py-1.5 text-sm text-slate-200 hover:bg-slate-700">
                + {t(`lay.${a.key}`)}
              </button>
            ))}
          </div>

          <Card className="mb-4 p-4">
            {!e ? (
              <p className="text-sm text-slate-400">{t("lay.selectHint")}</p>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold">{t(`lay.type.${typ}`)}</div>
                  <button onClick={() => delElement(sel)}
                    className="rounded-lg bg-slate-800 px-2.5 py-1.5 text-sm text-slate-300 hover:bg-slate-700">
                    {t("lay.delElement")}
                  </button>
                </div>

                {(typ === EL_VALUE || typ === EL_LABEL) && (
                  <label className="block text-sm text-slate-300">
                    {t("lay.field")}
                    <select value={Number(e[6]) || 0} onChange={(ev) => setField(sel, 6, Number(ev.target.value))}
                      className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-slate-100">
                      {FIELD_OPTIONS.filter((o) => o.id !== 0).map((o) => (
                        <option key={o.id} value={o.id}>{t(`field.${o.id}`)}</option>
                      ))}
                    </select>
                  </label>
                )}

                {typ === EL_TEXT && (
                  <label className="block text-sm text-slate-300">
                    {t("lay.text")}
                    <input value={String(e[6] ?? "")} maxLength={MAX_TEXT_LEN}
                      onChange={(ev) => setField(sel, 6, ev.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-slate-100" />
                    <span className="text-sm text-slate-400">{t("lay.textHint", { n: MAX_TEXT_LEN })}</span>
                  </label>
                )}

                {typ === EL_LINE && (() => {
                  const g = lineGeom(e);
                  const btn = (on: boolean) =>
                    `rounded-lg px-2.5 py-1.5 text-sm ${on ? "bg-brand-600 text-white" : "bg-slate-800 text-slate-200 hover:bg-slate-700"}`;
                  return (
                    <div className="space-y-3">
                      <div>
                        <div className="mb-1 text-sm text-slate-300">{t("lay.lineOrient")}</div>
                        <div className="flex flex-wrap gap-2">
                          <button className={btn(g.orient === "h")} onClick={() => setLine(sel, "h")}>
                            {t("lay.lineH")}
                          </button>
                          <button className={btn(g.orient === "v")} onClick={() => setLine(sel, "v")}>
                            {t("lay.lineV")}
                          </button>
                          <span className={`rounded-lg px-2.5 py-1.5 text-sm ${g.orient === "free" ? "bg-slate-700 text-slate-200" : "text-slate-500"}`}>
                            {t("lay.lineFree")}
                          </span>
                        </div>
                      </div>
                      {g.orient !== "free" && (
                        <label className="block text-sm text-slate-300">
                          <span className="flex items-baseline justify-between gap-2">
                            <span>{t("lay.lineLength")}</span>
                            <span className="text-slate-400">{Math.round(g.len / 10)} %</span>
                          </span>
                          <input type="range" min={20} max={1000} step={10} value={g.len}
                            onChange={(ev) => setLine(sel, g.orient === "v" ? "v" : "h", Number(ev.target.value))}
                            className="mt-1 w-full accent-brand-500" />
                        </label>
                      )}
                      <p className="text-sm text-slate-400">{t("lay.lineHint")}</p>
                    </div>
                  );
                })()}

                {/* Schriftgröße je Element: EINE Stufe = EIN echter Garmin-Font. Wert-Elemente
                    dürfen in die großen NUMBER-Fonts, Labels/Texte nicht (dort fehlen Buchstaben). */}
                <label className="block text-sm text-slate-300">
                  <span className="flex flex-wrap items-baseline justify-between gap-2">
                    <span>{typ === EL_LINE ? t("lay.thickness") : t("lay.size")}</span>
                    {typ !== EL_LINE && (
                      <span className="text-slate-400">
                        {t(`lay.size.${SIZE_STEPS[Number(e[3]) || 0]?.key ?? "medium"}`)}
                        {" · "}
                        <code className="text-slate-500">{SIZE_STEPS[Number(e[3]) || 0]?.font}</code>
                      </span>
                    )}
                  </span>
                  <input type="range" min={typ === EL_LINE ? 1 : 0}
                    max={typ === EL_LINE ? 4 : typ === EL_VALUE ? MAX_SIZE_STEP : MAX_TEXT_STEP}
                    value={Number(e[3]) || 0}
                    onChange={(ev) => setField(sel, 3, Number(ev.target.value))}
                    className="mt-1 w-full accent-brand-500" />
                  {typ !== EL_LINE && typ !== EL_VALUE && (
                    <span className="text-sm text-slate-400">{t("lay.sizeTextCap")}</span>
                  )}
                </label>

                <div>
                  <div className="mb-1 text-sm text-slate-300">{t("lay.color")}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {PALETTE.map((_, i) => swatch(i, Number(e[4]) === i, () => setField(sel, 4, i)))}
                  </div>
                </div>

                {typ !== EL_LINE && (
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="text-sm text-slate-300">{t("lay.align")}</div>
                    {[["c", 0], ["l", 1], ["r", 2]].map(([k, v]) => (
                      <button key={k as string} onClick={() => setField(sel, 5, ((Number(e[5]) || 0) & 4) | (v as number))}
                        className={`rounded-lg px-2.5 py-1.5 text-sm ${
                          ((Number(e[5]) || 0) & 3) === v ? "bg-brand-500 text-slate-950" : "bg-slate-800 text-slate-200"}`}>
                        {t(`lay.align.${k}`)}
                      </button>
                    ))}
                  </div>
                )}

                {typ === EL_VALUE && (
                  <label className="flex items-center gap-2 text-sm text-slate-300">
                    <input type="checkbox" checked={(Number(e[5]) || 0) & 4 ? true : false}
                      onChange={(ev) => setField(sel, 5, ((Number(e[5]) || 0) & 3) | (ev.target.checked ? 4 : 0))}
                      className="h-4 w-4 accent-brand-500" />
                    {t("lay.colorByValue")}
                  </label>
                )}

                {typ === EL_LINE && (
                  <div className="flex flex-wrap gap-2">
                    {[6, 7].map((pos) => (
                      <label key={pos} className="text-sm text-slate-300">
                        {pos === 6 ? t("lay.lineX2") : t("lay.lineY2")}
                        <input type="number" min={0} max={1000} value={Number(e[pos]) || 0}
                          onChange={(ev) => setField(sel, pos, Number(ev.target.value))}
                          className="mt-1 w-24 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100" />
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* Elementliste zum Anwählen (auch für Linien, die sich schlecht treffen lassen) */}
          <div className="mb-4 flex flex-wrap gap-2">
            {l.elements.map((el, i) => (
              <button key={i} onClick={() => setSel(i)}
                className={`rounded-lg px-2.5 py-1.5 text-sm ${
                  sel === i ? "bg-brand-500 text-slate-950" : "bg-slate-800 text-slate-200 hover:bg-slate-700"}`}>
                {t(`lay.type.${Number(el[0])}`)}
              </button>
            ))}
          </div>

          {warnings.length > 0 && (
            <Card className="border-amber-600/50 p-4">
              <div className="mb-1 font-semibold text-amber-700 dark:text-amber-300">
                {t("lay.warnTitle", { size: `${SMALLEST.w}×${SMALLEST.h}` })}
              </div>
              <ul className="list-inside list-disc space-y-1 text-sm text-slate-200">
                {warnings.map((w) => <li key={w}>{w}</li>)}
              </ul>
            </Card>
          )}

          <p className="mt-4 text-sm text-slate-400">{t("lay.notOnWatchYet")}</p>
          <button onClick={() => nav("/layouts")} className="mt-3 text-sm text-slate-300 hover:text-slate-200">
            {t("lay.backToList")}
          </button>
        </div>
      </div>
    </div>
  );
}
