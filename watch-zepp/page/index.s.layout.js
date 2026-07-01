import * as hmUI from "@zos/ui";
import { px } from "@zos/utils";
import { DEVICE_WIDTH } from "../utils/config/device";

const W = DEVICE_WIDTH;
const line = (y, h, color, size) => ({
  x: 0, y: px(y), w: W, h: px(h), color, text_size: px(size),
  align_h: hmUI.align.CENTER_H, align_v: hmUI.align.CENTER_V,
});

export const TITLE = { ...line(24, 38, 0xffffff, 30), text: "Pumpfoil" };
export const BIG = { ...line(90, 78, 0x22d3ee, 66), text: "–" };
export const UNIT = { ...line(170, 24, 0x9aa4b2, 20), text: "km/h" };
export const DUR = { ...line(200, 28, 0xf59e0b, 24), text: "0:00" };
export const STATS = { ...line(232, 24, 0xcbd5e1, 19), text: "" };
export const STATUS = { ...line(262, 22, 0x64748b, 18), text: "…" };
export const BUTTON = {
  x: (W - px(300)) / 2, y: px(302), w: px(300), h: px(72), radius: px(36),
  normal_color: 0x22c55e, press_color: 0x16a34a, color: 0x052e16, text_size: px(30),
  text: "START",
};
