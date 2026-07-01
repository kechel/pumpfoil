import * as hmUI from "@zos/ui";
import { px } from "@zos/utils";
import { DEVICE_WIDTH } from "../utils/config/device";

const W = DEVICE_WIDTH;
const c = (y, h, color, size) => ({
  x: 0, y: px(y), w: W, h: px(h), color, text_size: px(size),
  align_h: hmUI.align.CENTER_H, align_v: hmUI.align.CENTER_V,
});

export const TITLE = { ...c(16, 34, 0xffffff, 28), text: "Pumpfoil" };
export const PAGE = { x: 0, y: px(18), w: W - px(20), h: px(26), color: 0x64748b, text_size: px(18), align_h: hmUI.align.RIGHT, align_v: hmUI.align.CENTER_V, text: "" };

export const F0V = { ...c(62, 60, 0x22d3ee, 54), text: "–" };
export const F0L = { ...c(120, 20, 0x9aa4b2, 16), text: "" };
export const F1V = { ...c(150, 46, 0xffffff, 38), text: "" };
export const F1L = { ...c(194, 18, 0x9aa4b2, 15), text: "" };
export const F2V = { ...c(216, 46, 0xffffff, 38), text: "" };
export const F2L = { ...c(260, 18, 0x9aa4b2, 15), text: "" };

export const STATUS = { ...c(284, 22, 0x64748b, 18), text: "…" };
export const BUTTON = {
  x: (W - px(300)) / 2, y: px(312), w: px(300), h: px(70), radius: px(35),
  normal_color: 0x22c55e, press_color: 0x16a34a, color: 0x052e16, text_size: px(28),
  text: "START",
};
