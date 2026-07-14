import { useState } from "react";
import { getFontScale, setFontScale, FontScale } from "../lib/fontscale";

// Schriftgröße-Umschalter (Barrierefreiheit). Wirkt sofort (Root-font-size), Persistenz via
// localStorage. Prozentwerte sind universell -> keine Übersetzung nötig.
export function FontScaleSelect() {
  const [fs, setFs] = useState<FontScale>(getFontScale());
  const opts: FontScale[] = ["100", "120", "150"];
  const choose = (v: FontScale) => { setFontScale(v); setFs(v); };
  return (
    <div className="inline-flex gap-1 rounded-xl border border-slate-700 bg-slate-900/60 p-1">
      {opts.map((o) => (
        <button
          key={o}
          onClick={() => choose(o)}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
            fs === o ? "bg-brand-500 text-slate-950" : "text-slate-200 hover:bg-slate-800"
          }`}
        >
          {o} %
        </button>
      ))}
    </div>
  );
}
