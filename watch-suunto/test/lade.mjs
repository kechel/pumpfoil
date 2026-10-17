// Laedt ES5-Quelldateien der Uhr-App in einen vm-Kontext, wie die Firmware sie global auswertet.
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function kontext(dateien, extra = {}) {
  const ctx = vm.createContext({ Math, Float32Array, Uint8Array, Int8Array, ...extra });
  for (const d of dateien) vm.runInContext(fs.readFileSync(path.join(WURZEL, d), "utf8"), ctx, { filename: d });
  return ctx;
}
