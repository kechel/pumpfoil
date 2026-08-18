import * as hmUI from "@zos/ui";
import { px } from "@zos/utils";
import { DEVICE_WIDTH } from "../utils/config/device";

const W = DEVICE_WIDTH;
const c = (y, h, color, size) => ({
  x: 0, y: px(y), w: W, h: px(h), color, text_size: px(size),
  align_h: hmUI.align.CENTER_H, align_v: hmUI.align.CENTER_V,
});

// Eckige Zepp-OS-Geraete ziehen oben einen SYSTEM-BALKEN ein und schreiben den `appName` aus
// app.json hinein: grau, linksbuendig, Systemschrift — und deckend. Alles, was wir dort zeichnen,
// ist unsichtbar. Genau das war Jans Befund (18.08.): der eigene Titel lag unter dem Balken, und
// dessen Unterkante hat "v1.0.5" oben angeschnitten.
//
// Warum das nicht an dieser Datei liegt: `BUTTON` von hier greift nachweislich (Breite 320 im
// Screenshot — die runde Fassung hat 280), also werden Farbe, Groesse und Ausrichtung aus derselben
// Datei angewendet. Dann kann der graue, linksbuendige, zu grosse Titel nicht aus demselben Objekt
// stammen. Auf RUNDEN Geraeten gibt es den Balken nicht, index.r.layout.js bleibt unberuehrt.
const BALKEN = 76;

// Kein eigener Titel auf eckig — der Name steht schon im Balken, zweimal "Pumpfoil" waere Unsinn.
// Das Widget bleibt (index.js erzeugt es unbedingt), nur ohne Text.
export const TITLE = { ...c(BALKEN - 22, 20, 0xffffff, 20), text: "" };
// Version + Seitenanzeige teilen sich die erste Zeile UNTER dem Balken (auf rund teilen sie sich
// die Titelzeile).
export const VER = { ...c(BALKEN + 2, 22, 0x64748b, 18), text: "" };
export const PAGE = { x: 0, y: px(BALKEN + 2), w: W - px(20), h: px(22), color: 0x64748b, text_size: px(20), align_h: hmUI.align.RIGHT, align_v: hmUI.align.CENTER_V, text: "" };

export const F0V = { ...c(100, 62, 0x22d3ee, 56), text: "–" };
export const F0L = { ...c(160, 24, 0x9aa4b2, 22), text: "" };
export const F1V = { ...c(184, 48, 0xffffff, 42), text: "" };
export const F1L = { ...c(230, 22, 0x9aa4b2, 20), text: "" };
export const F2V = { ...c(252, 48, 0xffffff, 42), text: "" };
export const F2L = { ...c(298, 22, 0x9aa4b2, 20), text: "" };

export const STATUS = { ...c(320, 26, 0x64748b, 22), text: "…" };
export const BUTTON = {
  x: (W - px(320)) / 2, y: px(350), w: px(320), h: px(72), radius: px(36),
  normal_color: 0x22c55e, press_color: 0x16a34a, color: 0x052e16, text_size: px(34),
  text: "START",
};
