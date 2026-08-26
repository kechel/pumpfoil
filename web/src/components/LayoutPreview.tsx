import { LayoutElement, WatchLayout } from "../lib/api";
import {
  DEFAULT_SCALES, EL_ARC, EL_BAR, EL_DOTS, EL_LABEL, EL_LINE, EL_PAUSED, EL_REC, EL_TEXT, EL_VALUE,
  MOCK_VALUE, PALETTE, SIZE_FACTOR, ValueScales, WatchShape, edgePath, graphicColor,
  graphicThicknessPx, paletteColor, scaleFraction, valueColor,
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
  pageCount = 3, pageIndex = 0, scales = DEFAULT_SCALES,
  selected = -1, onPickElement, onElementPointerDown,
}: {
  layout: PreviewLayout;
  w: number; h: number;              // Zielauflösung (nur fürs Seitenverhältnis relevant)
  px?: number;                       // Breite der Vorschau auf dem Bildschirm
  shape?: WatchShape;                // überschreibt layout.shape (Größen-Umschalter)
  showData?: boolean;
  // Seiten-Punkte sind auf der Uhr DYNAMISCH: so viele Punkte wie Seiten, plus die
  // Übersichts-Seite. Wer den echten Wert kennt (Seiten-Editor, Layout-Liste), gibt ihn hier
  // mit — sonst zeigt die Vorschau einen Platzhalter und lügt über die Anzahl (real gesehen:
  // Vorschau 3 Punkte, Uhr 5).
  pageCount?: number;
  pageIndex?: number;
  // Skalen der Wert-Grafiken (Puls-Zonen + Geschwindigkeitsspanne aus dem Profil). Ohne Angabe
  // der neutrale Rueckfall — die Vorschau soll auch ohne geladene Einstellungen etwas zeigen.
  scales?: ValueScales;
  selected?: number;
  onPickElement?: (i: number) => void;
  // `handle` sagt, WAS gegriffen wurde: "move" = ganzes Element verschieben, "a"/"b" = einzelner
  // Endpunkt einer Trennlinie. Ohne Endpunkt-Griffe wäre eine Linie nur schief zu ziehen.
  onElementPointerDown?: (i: number, e: React.PointerEvent, handle?: "move" | "a" | "b") => void;
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
      {/* Trennlinien zuerst (liegen hinter Text). Interaktiv nur im Editor (onElementPointerDown):
          eine unsichtbare, dicke Fang-Linie macht 1-px-Linien überhaupt greifbar, die zwei Griffe
          an den Enden machen sie frei ausrichtbar. */}
      <svg className="absolute inset-0" width={boxW} height={boxH}
        style={{ pointerEvents: onElementPointerDown ? undefined : "none" }}>
        {/* Wert-Grafiken: Rand-Segment (rund = Ring, eckig = Rahmen — der Renderer entscheidet
            anhand der echten Displayform) und Balken. Beide zeigen einen leeren Track plus den
            gefuellten Anteil, damit die Skala auch bei kleinem Wert erkennbar bleibt. */}
        {els.map((e, i) => {
          const typ = Number(e[0]);
          if (typ !== EL_ARC && typ !== EL_BAR) return null;
          const fid = Number(e[6]) || 0;
          const roh = parseFloat(MOCK_VALUE[fid] ?? "");
          const wert = showData ? roh : NaN;
          const frac = showData ? scaleFraction(fid, roh, scales) : 1;
          const byScale = (Number(e[5]) || 0) & 1 ? true : false;
          const dicke = graphicThicknessPx(Number(e[3]) || 1, boxW);
          const farbe = graphicColor(fid, wert, scales, byScale, Number(e[4]) || 1);
          const dash = selected === i ? { strokeDasharray: "4 3" } : undefined;
          if (typ === EL_ARC) {
            const inset = dicke / 2 + 1;
            const start = Number(e[1]) || 0;
            const laenge = Math.max(0, Math.min(1000, Number(e[2]) || 0));
            const track = edgePath(sh === "rect" ? "rect" : "round", boxW, boxH, inset, start, laenge);
            const fill = edgePath(sh === "rect" ? "rect" : "round", boxW, boxH, inset, start, laenge * frac);
            return (
              <g key={i} onClick={onPickElement ? () => onPickElement(i) : undefined}
                onPointerDown={onElementPointerDown ? (ev) => onElementPointerDown(i, ev, "move") : undefined}
                style={{ cursor: onElementPointerDown ? "move" : undefined }}>
                <path d={track} fill="none" stroke={farbe} strokeWidth={dicke} opacity={0.25} />
                {frac > 0 && <path d={fill} fill="none" stroke={farbe} strokeWidth={dicke} style={dash} />}
                {onElementPointerDown && (
                  <path d={track} fill="none" stroke="transparent" strokeWidth={Math.max(14, dicke)} />
                )}
              </g>
            );
          }
          const breite = (Math.max(50, Math.min(1000, Number(e[7]) || 400)) / 1000) * boxW;
          const x = rel(e[1], boxW) - breite / 2;
          const y = rel(e[2], boxH) - dicke / 2;
          return (
            <g key={i} onClick={onPickElement ? () => onPickElement(i) : undefined}
              onPointerDown={onElementPointerDown ? (ev) => onElementPointerDown(i, ev, "move") : undefined}
              style={{ cursor: onElementPointerDown ? "move" : undefined }}>
              <rect x={x} y={y} width={breite} height={dicke} fill={farbe} opacity={0.25} rx={dicke / 2} />
              {frac > 0 && (
                <rect x={x} y={y} width={Math.max(dicke, breite * frac)} height={dicke} fill={farbe}
                  rx={dicke / 2} stroke={selected === i ? "#22d3ee" : undefined} strokeWidth={1} />
              )}
            </g>
          );
        })}
        {els.map((e, i) => Number(e[0]) === EL_LINE && (
          <g key={i}>
            <line x1={rel(e[1], boxW)} y1={rel(e[2], boxH)}
              x2={rel(e[6], boxW)} y2={rel(e[7], boxH)}
              stroke={paletteColor(Number(e[4]), "line")}
              strokeWidth={Math.max(1, Number(e[3]) || 1)}
              opacity={selected === i ? 0.6 : 1} style={{ pointerEvents: "none" }} />
            {onElementPointerDown && (
              <line x1={rel(e[1], boxW)} y1={rel(e[2], boxH)}
                x2={rel(e[6], boxW)} y2={rel(e[7], boxH)}
                stroke="transparent" strokeWidth={12} style={{ cursor: "move" }}
                onClick={onPickElement ? () => onPickElement(i) : undefined}
                onPointerDown={(ev) => onElementPointerDown(i, ev, "move")} />
            )}
            {onElementPointerDown && selected === i && ([["a", e[1], e[2]], ["b", e[6], e[7]]] as const).map(
              ([hn, hx, hy]) => (
                <circle key={hn} cx={rel(hx, boxW)} cy={rel(hy, boxH)} r={5}
                  fill="#22d3ee" stroke="#0f172a" strokeWidth={1}
                  style={{ cursor: "crosshair" }}
                  onPointerDown={(ev) => { ev.stopPropagation(); onElementPointerDown(i, ev, hn); }} />
              ))}
          </g>
        ))}
      </svg>

      {els.map((e, i) => {
        const typ = Number(e[0]);
        if (typ === EL_LINE || typ === EL_ARC || typ === EL_BAR) return null;   // im SVG oben
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
        const down = onElementPointerDown ? (ev: React.PointerEvent) => onElementPointerDown(i, ev, "move") : undefined;

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
        if (typ === EL_PAUSED) {
          // „Pausiert"-Hinweis: in Pausen-Layouts Pflicht, hier genauso gezeichnet wie auf der Uhr
          // (übersetzter Text, kleine Stufe). Er ist auswählbar und ziehbar, aber nicht löschbar.
          return (
            <div key={i} style={{ ...box, fontSize: fontPx(e[3]), fontWeight: 700,
              color: paletteColor(Number(e[4]), "label"), letterSpacing: "0.05em" }}
              onClick={pick} onPointerDown={down}>
              {t("lay.pausedHint")}
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
          const n = Math.max(1, Math.min(12, pageCount));
          return (
            <div key={i} style={{ ...box, display: "flex", alignItems: "center", gap: s }}
              onClick={pick} onPointerDown={down}>
              {Array.from({ length: n }, (_, d) => (
                <span key={d} style={{
                  width: s, height: s, borderRadius: "50%",
                  background: c, opacity: d === pageIndex ? 1 : 0.35, display: "inline-block",
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
