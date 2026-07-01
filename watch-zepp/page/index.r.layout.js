import * as hmUI from "@zos/ui";
import { px } from "@zos/utils";
import { DEVICE_WIDTH } from "../utils/config/device";

const W = DEVICE_WIDTH;

export const TITLE = {
  x: 0, y: px(56), w: W, h: px(44), color: 0xffffff, text_size: px(34),
  align_h: hmUI.align.CENTER_H, align_v: hmUI.align.CENTER_V, text: "Pumpfoil",
};
export const BIG = {
  x: 0, y: px(150), w: W, h: px(84), color: 0x22d3ee, text_size: px(72),
  align_h: hmUI.align.CENTER_H, align_v: hmUI.align.CENTER_V, text: "–",
};
export const UNIT = {
  x: 0, y: px(236), w: W, h: px(30), color: 0x9aa4b2, text_size: px(24),
  align_h: hmUI.align.CENTER_H, align_v: hmUI.align.CENTER_V, text: "km/h",
};
export const SUB = {
  x: 0, y: px(276), w: W, h: px(32), color: 0xf59e0b, text_size: px(26),
  align_h: hmUI.align.CENTER_H, align_v: hmUI.align.CENTER_V, text: "",
};
export const STATUS = {
  x: 0, y: px(312), w: W, h: px(28), color: 0x64748b, text_size: px(22),
  align_h: hmUI.align.CENTER_H, align_v: hmUI.align.CENTER_V, text: "GPS?",
};
export const BUTTON = {
  x: (W - px(300)) / 2, y: px(362), w: px(300), h: px(76), radius: px(38),
  normal_color: 0x22c55e, press_color: 0x16a34a, color: 0x052e16, text_size: px(30),
  text: "START",
};
