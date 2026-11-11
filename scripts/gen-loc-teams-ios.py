# Erzeugt watch-apple/Sources-iOS/LocTeams.swift aus web/src/i18n/locales/*.ts (Teams & Events, 01.11.2026).
# Nimmt nur die team.*-Schluessel, die die Team-Dateien der App wirklich benutzen. Aufruf: python3 scripts/gen-loc-teams-ios.py
import io, json, re, pathlib, sys
ROOT = pathlib.Path(__file__).resolve().parent.parent
WEB = ROOT / "web/src/i18n/locales"
IOS = ROOT / "watch-apple/Sources-iOS"
LANGS = ["de", "gsw", "de-AT", "en", "fr", "it", "es", "fi", "nl", "cs", "pl", "pt", "pt-PT", "ja", "zh", "ru", "id", "nb"]
DATEIEN = ["TeamModels.swift", "TeamsApi.swift", "TeamFarben.swift", "TeamEventKachel.swift", "TeamKennzahlen.swift",
           "TeamView.swift", "TeamEventView.swift", "TeamsListen.swift",
           # Team-Verwaltung nativ, Teilen-Bild, Teams in den Einstellungen (App-Port, 04.11.2026)
           "TeamVerwaltung.swift", "TeamGrunddaten.swift", "TeamEventsVerwalten.swift", "TeamGruenden.swift",
           "TeamBestenlisten.swift", "EinstellungenView.swift",
           # Event-Abzeichen auf der Profilseite (10.11.2026)
           "FoilerView.swift",
           # Siegertreppchen und Event-Uebersicht als Bild (10.11.2026)
           "EventPodest.swift", "EventUebersichtBild.swift"]
# fw.* = die kurzen Uhr-Texte unter den Werten (Layout-Vorschau, 01.11.2026) — vorher zeigte iOS dort die langen
# Feldnamen, die ueberlappten und vom Web abwichen.
# team.regeln.* (10.11.2026): die Team-Regeln werden aus zusammengesetzten Schluesseln gelesen (TeamRegelnInhalt) und
# standen bisher nur in LocPort.swift — hier vollstaendig und aktuell (Abschnitt „global", web 9ed3e55c). LocTeam wird
# fuer team.* zuerst gefragt, ueberdeckt also den alten Stand in LocPort.
# wk.* (11.11.2026): Wertungsklasse (Einstellungen › Ich, Einrichtungs-Assistent, Filter der Event-Bestenlisten).
PRAEFIXE = ["team.event.status.", "team.err.", "team.rolle.", "team.k.", "team.adresseTeilen.", "fw.", "team.regeln.", "wk."]
EXTRA = ["sd.avgHrFoil", "leader.totalDistance", "leader.totalTime"]

def lies(code):
    s = io.open(WEB / f"{code}.ts", encoding="utf-8").read()
    return {json.loads(k): json.loads(v) for k, v in
            re.findall(r'^  ("(?:[^"\\]|\\.)*"): ("(?:[^"\\]|\\.)*"),$', s, re.M)}

T = {c: lies(c) for c in LANGS}
benutzt = set(EXTRA)
for f in DATEIEN:
    src = io.open(IOS / f, encoding="utf-8").read()
    benutzt |= set(re.findall(r'"(team\.[A-Za-z0-9_.]+[A-Za-z0-9_])"', src))
for k in T["de"]:
    if any(k.startswith(p) for p in PRAEFIXE):
        benutzt.add(k)
fehlend = sorted(k for k in benutzt if k not in T["de"] or k not in T["en"])
if fehlend:
    print("FEHLT in de/en:", fehlend); sys.exit(1)
KEYS = sorted(benutzt)
for c in LANGS:
    l = [k for k in KEYS if k not in T[c]]
    if l: print(f"  {c}: {len(l)} fehlen -> Rueckfall en: {l[:5]}")

def sw(v):
    j = json.dumps(v, ensure_ascii=False)
    return re.sub(r'\\u([0-9a-fA-F]{4})', r'\\u{\1}', j)

BLOCK = 45
out = []
out.append("import Foundation\n")
out.append("// Texte der Teams & Events (Native-Port Stufe 4, 01.11.2026). ERZEUGT aus web/src/i18n/locales/*.ts —")
out.append("// dort steht der Wortlaut in allen 18 Sprachen, hier nur die Kopie der Schluessel, die die App benutzt")
out.append("// (team.* sowie sd.avgHrFoil/sd.avgHrGesamt). Neue Schluessel: aus der Web-Datei uebernehmen, Wortlaut nie hier aendern.")
out.append("// Eigene Datei und eigener Zugriff wie LocOnboarding.swift: Loc.t() fragt sie fuer diese Schluessel zuerst.")
out.append("//")
out.append(f"// Je Sprache in Bloecke zu hoechstens {BLOCK} Eintraegen zerlegt: EIN grosses Literal ist fuer den")
out.append("// Swift-Type-Checker EIN Ausdruck, dessen Kosten ueberproportional wachsen (Loc.swift hing daran schon")
out.append("// einmal minutenlang). Zusammengefuehrt beim ersten Zugriff.")
out.append("")
out.append("enum LocTeam {")
out.append("    /// nil = Schluessel unbekannt (dann sucht Loc.t in den grossen Tabellen weiter).")
out.append("    static func t(_ key: String, _ lang: String) -> String? {")
out.append("        if let v = sprachen[lang]?[key] { return v }")
out.append("        if lang == \"pt-PT\", let v = sprachen[\"pt\"]?[key] { return v }")
out.append("        if lang == \"gsw\" || lang == \"de-AT\", let v = sprachen[\"de\"]?[key] { return v }")
out.append("        return sprachen[\"en\"]?[key]")
out.append("    }")
out.append("")
out.append("    static let sprachen: [String: [String: String]] = {")
out.append("        var d: [String: [String: String]] = [:]")
namen = {}
for c in LANGS:
    ident = "_" + c.replace("-", "_")
    keys = [k for k in KEYS if k in T[c]]
    bl = [keys[i:i+BLOCK] for i in range(0, len(keys), BLOCK)]
    namen[c] = [(f"{ident}{i}", b) for i, b in enumerate(bl)]
    out.append(f"        d[\"{c}\"] = zusammen([{', '.join(n for n, _ in namen[c])}])")
out.append("        return d")
out.append("    }()")
out.append("")
out.append("    private static func zusammen(_ teile: [[String: String]]) -> [String: String] {")
out.append("        var d: [String: String] = [:]")
out.append("        for p in teile { d.merge(p) { a, _ in a } }")
out.append("        return d")
out.append("    }")
for c in LANGS:
    for n, b in namen[c]:
        out.append("")
        out.append(f"    private static let {n}: [String: String] = [")
        for k in b:
            out.append(f"        {sw(k)}: {sw(T[c][k])},")
        out.append("    ]")
out.append("}")
io.open(IOS / "LocTeams.swift", "w", encoding="utf-8").write("\n".join(out) + "\n")
print(len(KEYS), "Schluessel,", sum(len(v) for v in namen.values()), "Bloecke")
