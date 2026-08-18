import * as hmUI from "@zos/ui";
import { px } from "@zos/utils";
import { DEVICE_WIDTH } from "../utils/config/device";

const W = DEVICE_WIDTH;
const c = (y, h, color, size) => ({
  x: 0, y: px(y), w: W, h: px(h), color, text_size: px(size),
  align_h: hmUI.align.CENTER_H, align_v: hmUI.align.CENTER_V,
});

// Cyan wie auf eckig (Marke #22d3ee) -- die abgenommenen Store-Bilder zeigen noch Weiss.
export const TITLE = { ...c(30, 44, 0x22d3ee, 36), text: "Pumpfoil" };
// Runde Geraete haben KEINEN System-Balken (Begruendung in index.s.layout.js): eigener Titel bleibt.
export const VER = { ...c(74, 22, 0x64748b, 18), text: "" };
// On a round screen, the usable area narrows significantly near the top and bottom.
// Einzug 120 statt 70, also rechte Kante bei x 360: mit 70 lag sie bei 410, der Kreis (Mitte
// 240/240, r 240) laesst auf der Oberkante der Schrift (y 40) aber nur bis x 373 zu -- die
// Seitenanzeige wurde diagonal angeschnitten und stand als "1/" da (Jans Screenshots 18.08., im
// Rohbild nachgemessen: helle Pixel bis Geraete-x 407, Kreis endet dort bei 391). Auf eckigen
// Geraeten gibt es das nicht, dort ist die ganze Flaeche sichtbar.
export const PAGE = { x: 0, y: px(36), w: W - px(120), h: px(34), color: 0x64748b, text_size: px(26), align_h: hmUI.align.RIGHT, align_v: hmUI.align.CENTER_V, text: "" };

// 3 Feld-Slots: Wert groß + kleines Label.
export const F0V = { ...c(94, 70, 0x22d3ee, 64), text: "–" };
export const F0L = { ...c(162, 28, 0x9aa4b2, 24), text: "" };
export const F1V = { ...c(188, 54, 0xffffff, 50), text: "" };
export const F1L = { ...c(240, 26, 0x9aa4b2, 22), text: "" };
export const F2V = { ...c(262, 54, 0xffffff, 50), text: "" };
export const F2L = { ...c(314, 26, 0x9aa4b2, 22), text: "" };

export const STATUS = { ...c(338, 28, 0x64748b, 22), text: "…" };
export const BUTTON = {
  x: (W - px(280)) / 2, y: px(366), w: px(280), h: px(70), radius: px(35),
  normal_color: 0x22c55e, press_color: 0x16a34a, color: 0x052e16, text_size: px(32),
  text: "START",
};
