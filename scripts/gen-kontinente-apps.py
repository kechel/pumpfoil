# Kontinent-Umrisse der Team-Herkunft fuer BEIDE Apps aus web/src/lib/kontinente.ts (dort aus Natural Earth erzeugt,
# scripts/kontinente-erzeugen.py): android/.../KontinentPfade.kt und watch-apple/Sources-iOS/KontinentPfade.swift.
# Nie in den erzeugten Dateien aendern. Aufruf: python3 scripts/gen-kontinente-apps.py
import io, json, re, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
src = io.open(ROOT / "web/src/lib/kontinente.ts", encoding="utf-8").read()
pfade = dict(re.findall(r'^\s+(\w+): "([^"]+)",?$', src, re.M))
assert set(pfade) == {"earth", "eu", "af", "as", "na", "sa", "oc"}, sorted(pfade)
kopf = "Kontinent-Umrisse (48x36, 4:3 wie die Flaggen) fuer die Team-Herkunft. ERZEUGT von scripts/gen-kontinente-apps.py aus web/src/lib/kontinente.ts."

kt = ["package org.pumpfoil.app", "", f"// {kopf}", "internal val KONTINENT_PFADE: Map<String, String> = mapOf("]
kt += [f"    {json.dumps(k)} to {json.dumps(v)}," for k, v in pfade.items()] + [")", ""]
io.open(ROOT / "android/app/src/main/java/org/pumpfoil/app/KontinentPfade.kt", "w", encoding="utf-8").write("\n".join(kt))

sw = ["import Foundation", "", f"// {kopf}", "enum KontinentPfade {"]
sw += [f"    static let {k if k != 'as' else 'asien'}: String = {json.dumps(v)}" for k, v in pfade.items()]
sw += ["", "    static func pfad(_ k: String) -> String? {", "        switch k {"]
sw += [f"        case {json.dumps(k)}: return {k if k != 'as' else 'asien'}" for k in pfade]
sw += ["        default: return nil", "        }", "    }", "}", ""]
io.open(ROOT / "watch-apple/Sources-iOS/KontinentPfade.swift", "w", encoding="utf-8").write("\n".join(sw))
print("ok", {k: len(v) for k, v in pfade.items()})
