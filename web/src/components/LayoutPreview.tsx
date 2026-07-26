import { LayoutElement, WatchLayout } from "../lib/api";
import {
  EL_DOTS, EL_LABEL, EL_LINE, EL_REC, EL_TEXT, EL_VALUE,
  MOCK_VALUE, PALETTE, SIZE_FACTOR, WatchShape, paletteColor, valueColor,
} from "../lib/watchLayout";
import { useT } from "../i18n";

// Vorschau eines Advanced-Layouts. Zeichnet genau das, was die Uhr zeichnen würde:
// Koordinaten sind relativ 0…1000, Größen sind Stufen (Garmin-Fonts sind diskret), Farben kommen
// aus der kuratierten Palette. `showData` schaltet zwischen Struktur (Feldnamen) und Beispieldaten
// um — Beispieldaten zeigen echte Textbreiten, Struktur zeigt beim Anordnen, welches Feld wo liegt.
// Labels/Feldnamen stehen in der Sprache des Nutzers (Keys `fw.*` = exakt die Uhr-Texte).

export type PreviewLayout = Pick<WatchLayout, "elements" | "bg_color" | "shape">;

function shapeStyle(shape: WatchShape): React.CSSProperties {
  if (shape === "round") return { borderRadius: "50%" };
  if (shape === "semioctagon") {
    // Instinct-Klasse: rund mit abgeflachtem Segment — grob als Achteck angedeutet.
    return { clipPath: "polygon(22% 0, 78% 0, 100% 22%, 100% 78%, 78% 100%, 22% 100%, 0 78%, 0 22%)" };
  }
  return { borderRadius: "14%" };
}

export function LayoutPreview({
  layout, w, h, px = 220, shape, showData = true,
  selected = -1, onPickElement, onElementPointerDown,
}: {
  layout: PreviewLayout;
  w: number; h: number;              // Zielauflösung (nur fürs Seitenverhältnis relevant)
  px?: number;                       // Breite der Vorschau auf dem Bildschirm
  shape?: WatchShape;                // überschreibt layout.shape (Größen-Umschalter)
  showData?: boolean;
  selected?: number;
  onPickElement?: (i: number) => void;
  onElementPointerDown?: (i: number, e: React.PointerEvent) => void;
}) {
  const t = useT();
  const sh = (shape ?? layout.shape) as WatchShape;
  const boxW = px;
  const boxH = Math.round((px * h) / w);
  const bg = layout.bg_color === 0 ? "#000000" : PALETTE[layout.bg_color] ?? "#000000";
  const els: LayoutElement[] = Array.isArray(layout.elements) ? layout.elements : [];

  const rel = (v: unknown, span: number) => (Number(v) / 1000) * span;
  const fontPx = (step: unknown) => Math.max(7, Math.round(SIZE_FACTOR[Number(step) || 0] * boxW));

  const align = (flags: number): { left: string; transform: string; textAlign: "left" | "center" | "right" } => {
    if (flags & 1) return { left: "0", transform: "translate(0,-50%)", textAlign: "left" };
    if (flags & 2) return { left: "0", transform: "translate(-100%,-50%)", textAlign: "right" };
    return { left: "0", transform: "translate(-50%,-50%)", textAlign: "center" };
  };

  return (
    <div className="relative shrink-0 overflow-hidden border-2 border-slate-700"
      style={{ width: boxW, height: boxH, background: bg, ...shapeStyle(sh) }}>
      {/* Trennlinien zuerst (liegen hinter Text) */}
      <svg className="pointer-events-none absolute inset-0" width={boxW} height={boxH}>
        {els.map((e, i) => Number(e[0]) === EL_LINE && (
          <line key={i} x1={rel(e[1], boxW)} y1={rel(e[2], boxH)}
            x2={rel(e[6], boxW)} y2={rel(e[7], boxH)}
            stroke={paletteColor(Number(e[4]), "line")}
            strokeWidth={Math.max(1, Number(e[3]) || 1)}
            opacity={selected === i ? 0.6 : 1} />
        ))}
      </svg>

      {els.map((e, i) => {
        const typ = Number(e[0]);
        if (typ === EL_LINE) return null;
        const flags = Number(e[5]) || 0;
        const a = align(flags);
        const box: React.CSSProperties = {
          position: "absolute",
          left: rel(e[1], boxW), top: rel(e[2], boxH),
          transform: a.transform, textAlign: a.textAlign,
          whiteSpace: "nowrap", lineHeight: 1,
          outline: selected === i ? "1px dashed #22d3ee" : undefined,
          cursor: onElementPointerDown ? "move" : undefined,
        };
        const pick = onPickElement ? () => onPickElement(i) : undefined;
        const down = onElementPointerDown ? (ev: React.PointerEvent) => onElementPointerDown(i, ev) : undefined;

        if (typ === EL_VALUE) {
          const fid = Number(e[6]) || 0;
          const auto = flags & 4 ? valueColor(fid, true) : null;
          return (
            <div key={i} style={{ ...box, fontSize: fontPx(e[3]), fontWeight: 700,
              color: auto ?? paletteColor(Number(e[4]), "value"), fontVariantNumeric: "tabular-nums" }}
              onClick={pick} onPointerDown={down}>
              {showData ? MOCK_VALUE[fid] ?? "--" : t(`field.${fid}`)}
            </div>
          );
        }
        if (typ === EL_LABEL) {
          return (
            <div key={i} style={{ ...box, fontSize: fontPx(e[3]), color: paletteColor(Number(e[4]), "label") }}
              onClick={pick} onPointerDown={down}>
              {t(`fw.${Number(e[6]) || 0}`)}
            </div>
          );
        }
        if (typ === EL_TEXT) {
          return (
            <div key={i} style={{ ...box, fontSize: fontPx(e[3]), color: paletteColor(Number(e[4]), "label") }}
              onClick={pick} onPointerDown={down}>
              {String(e[6] ?? "")}
            </div>
          );
        }
        if (typ === EL_REC) {
          const c = paletteColor(Number(e[4]) || 5, "value");
          const s = Math.max(4, Math.round(boxW * 0.03));
          return (
            <div key={i} style={{ ...box, display: "flex", alignItems: "center", gap: s / 2 }}
              onClick={pick} onPointerDown={down}>
              <span style={{ width: s, height: s, borderRadius: "50%", background: c, display: "inline-block" }} />
              <span style={{ fontSize: Math.max(7, Math.round(boxW * 0.055)), color: c }}>REC</span>
            </div>
          );
        }
        if (typ === EL_DOTS) {
          const c = paletteColor(Number(e[4]) || 2, "label");
          const s = Math.max(3, Math.round(boxW * 0.022));
          return (
            <div key={i} style={{ ...box, display: "flex", alignItems: "center", gap: s }}
              onClick={pick} onPointerDown={down}>
              {[0, 1, 2].map((d) => (
                <span key={d} style={{
                  width: s, height: s, borderRadius: "50%",
                  background: c, opacity: d === 0 ? 1 : 0.35, display: "inline-block",
                }} />
              ))}
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}
