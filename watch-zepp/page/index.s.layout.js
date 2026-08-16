import * as hmUI from "@zos/ui";
import { px } from "@zos/utils";
import { DEVICE_WIDTH } from "../utils/config/device";

const W = DEVICE_WIDTH;
const c = (y, h, color, size) => ({
  x: 0, y: px(y), w: W, h: px(h), color, text_size: px(size),
  align_h: hmUI.align.CENTER_H, align_v: hmUI.align.CENTER_V,
});

export const TITLE = { ...c(12, 40, 0xffffff, 34), text: "Pumpfoil" };
export const PAGE = { x: 0, y: px(14), w: W - px(20), h: px(32), color: 0x64748b, text_size: px(24), align_h: hmUI.align.RIGHT, align_v: hmUI.align.CENTER_V, text: "" };

export const F0V = { ...c(74, 70, 0x22d3ee, 64), text: "–" };
export const F0L = { ...c(140, 28, 0x9aa4b2, 24), text: "" };
export const F1V = { ...c(168, 56, 0xffffff, 50), text: "" };
export const F1L = { ...c(220, 26, 0x9aa4b2, 22), text: "" };
export const F2V = { ...c(244, 56, 0xffffff, 50), text: "" };
export const F2L = { ...c(296, 26, 0x9aa4b2, 22), text: "" };

export const STATUS = { ...c(322, 28, 0x64748b, 23), text: "…" };
export const BUTTON = {
  x: (W - px(320)) / 2, y: px(354), w: px(320), h: px(74), radius: px(37),
  normal_color: 0x22c55e, press_color: 0x16a34a, color: 0x052e16, text_size: px(34),
  text: "START",
};
