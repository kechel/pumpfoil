import * as hmUI from "@zos/ui";
import { px } from "@zos/utils";
import { DEVICE_WIDTH } from "../utils/config/device";

const W = DEVICE_WIDTH;
const c = (y, h, color, size) => ({
  x: 0, y: px(y), w: W, h: px(h), color, text_size: px(size),
  align_h: hmUI.align.CENTER_H, align_v: hmUI.align.CENTER_V,
});

export const TITLE = { ...c(36, 36, 0xffffff, 30), text: "Pumpfoil" };
export const PAGE = { x: 0, y: px(40), w: W - px(28), h: px(28), color: 0x64748b, text_size: px(20), align_h: hmUI.align.RIGHT, align_v: hmUI.align.CENTER_V, text: "" };

// 3 Feld-Slots: Wert groß + kleines Label.
export const F0V = { ...c(90, 62, 0x22d3ee, 56), text: "–" };
export const F0L = { ...c(150, 22, 0x9aa4b2, 18), text: "" };
export const F1V = { ...c(184, 48, 0xffffff, 40), text: "" };
export const F1L = { ...c(230, 20, 0x9aa4b2, 16), text: "" };
export const F2V = { ...c(256, 48, 0xffffff, 40), text: "" };
export const F2L = { ...c(302, 20, 0x9aa4b2, 16), text: "" };

export const STATUS = { ...c(326, 24, 0x64748b, 20), text: "…" };
export const BUTTON = {
  x: (W - px(300)) / 2, y: px(360), w: px(300), h: px(72), radius: px(36),
  normal_color: 0x22c55e, press_color: 0x16a34a, color: 0x052e16, text_size: px(30),
  text: "START",
};
