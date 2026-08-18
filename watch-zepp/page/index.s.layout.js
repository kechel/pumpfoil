import * as hmUI from "@zos/ui";
import { px } from "@zos/utils";
import { DEVICE_WIDTH } from "../utils/config/device";

const W = DEVICE_WIDTH;
const c = (y, h, color, size) => ({
  x: 0, y: px(y), w: W, h: px(h), color, text_size: px(size),
  align_h: hmUI.align.CENTER_H, align_v: hmUI.align.CENTER_V,
});

// Eckige Zepp-OS-Geraete ziehen oben eine 64 px hohe Status-Bar ein (grau, linksbuendig, Text =
// `appName` aus app.json, deckend). Sie hat hier den eigenen Titel verdeckt und die Versionszeile
// angeschnitten (Jans Screenshots 18.08.) und kostet ein Siebtel des Schirms. Sie ist deshalb in
// page/index.js per setStatusBarVisible(false) abgeschaltet -- die Geometrie unten rechnet mit der
// VOLLEN Hoehe. Wird das je zurueckgedreht, muss hier oben Platz reserviert werden.
export const TITLE = { ...c(12, 40, 0x22d3ee, 34), text: "Pumpfoil" };
// Version + Seitenanzeige teilen sich die Zeile unter dem Titel.
export const VER = { ...c(52, 22, 0x64748b, 18), text: "" };
export const PAGE = { x: 0, y: px(14), w: W - px(20), h: px(32), color: 0x64748b, text_size: px(24), align_h: hmUI.align.RIGHT, align_v: hmUI.align.CENTER_V, text: "" };

export const F0V = { ...c(78, 68, 0x22d3ee, 62), text: "–" };
export const F0L = { ...c(144, 26, 0x9aa4b2, 23), text: "" };
export const F1V = { ...c(172, 54, 0xffffff, 48), text: "" };
export const F1L = { ...c(224, 24, 0x9aa4b2, 21), text: "" };
export const F2V = { ...c(248, 54, 0xffffff, 48), text: "" };
export const F2L = { ...c(300, 24, 0x9aa4b2, 21), text: "" };

export const STATUS = { ...c(326, 26, 0x64748b, 22), text: "…" };
export const BUTTON = {
  x: (W - px(320)) / 2, y: px(354), w: px(320), h: px(74), radius: px(37),
  normal_color: 0x22c55e, press_color: 0x16a34a, color: 0x052e16, text_size: px(34),
  text: "START",
};
