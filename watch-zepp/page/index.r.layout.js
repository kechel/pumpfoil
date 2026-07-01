import * as hmUI from "@zos/ui";
import { px } from "@zos/utils";
import { DEVICE_WIDTH } from "../utils/config/device";

const W = DEVICE_WIDTH;
const line = (y, h, color, size) => ({
  x: 0, y: px(y), w: W, h: px(h), color, text_size: px(size),
  align_h: hmUI.align.CENTER_H, align_v: hmUI.align.CENTER_V,
});

export const TITLE = { ...line(48, 40, 0xffffff, 32), text: "Pumpfoil" };
export const BIG = { ...line(120, 82, 0x22d3ee, 72), text: "–" };      // Speed groß
export const UNIT = { ...line(204, 26, 0x9aa4b2, 22), text: "km/h" };
export const DUR = { ...line(238, 30, 0xf59e0b, 26), text: "0:00" };    // Dauer
export const STATS = { ...line(274, 26, 0xcbd5e1, 21), text: "" };      // Dist · max · HR
export const STATUS = { ...line(306, 24, 0x64748b, 20), text: "…" };    // GPS/Pairing
export const BUTTON = {
  x: (W - px(300)) / 2, y: px(356), w: px(300), h: px(76), radius: px(38),
  normal_color: 0x22c55e, press_color: 0x16a34a, color: 0x052e16, text_size: px(30),
  text: "START",
};
