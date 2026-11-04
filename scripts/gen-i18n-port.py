# Erzeugt die Texte des App-Ports (docs/UX-IA.md „App-Port ab 04.11.2026") fuer BEIDE Apps aus
# web/src/i18n/locales/*.ts: android/.../I18nPort.kt und watch-apple/Sources-iOS/LocPort.swift.
# Wortlaut nie in den erzeugten Dateien aendern — im Web aendern und neu erzeugen. Neue Schluessel unten in SCHLUESSEL.
# Schluessel, die eine App schon in ihren eigenen Tabellen hat, werden fuer DIESE App uebersprungen (die App-Namensraeume
# weichen vom Web ab; ein gleichnamiger Schluessel mit anderem Wortlaut soll nicht still ueberschrieben werden).
# Aufruf: python3 scripts/gen-i18n-port.py
import io, json, re, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
WEB = ROOT / "web/src/i18n/locales"
AND = ROOT / "android/app/src/main/java/org/pumpfoil/app"
IOS = ROOT / "watch-apple/Sources-iOS"
LANGS = ["de", "gsw", "de-AT", "en", "fr", "it", "es", "fi", "nl", "cs", "pl", "pt", "pt-PT", "ja", "zh", "ru", "id", "nb"]

SCHLUESSEL = [
    # Phase 3: Home-Reiter
    "tab.overview", "tab.team", "tab.stats", "tab.insights",
    # Phase 2: Leiste unten — „Einstellungen" statt „Profil" (Zahnrad)
    "nav.settings",
    # Phase 4: Home › Spots
    "nav.spots", "mySpots.title", "mySpots.empty", "mySpots.last", "mySpots.since", "mySpots.sports", "mySpots.all",
    "team.stat.sessions", "team.stat.zeit", "team.stat.strecke", "team.stat.laeufe", "team.stat.pumps",
    "foiler.homespot", "sessions.title", "spots.heatmap", "tab.weather", "tab.descriptions", "tab.spotPage",
    # Phase 5: Home › Profil
    "nav.profile", "phome.profileHint", "phome.asFriends", "phome.asAll", "phome.previewHidden", "ptab.privacy",
    # Phase 6: Einstellungen-Reiter
    "ptab.watches", "friends.title", "ptab.me", "ptab.riding", "ptab.display", "ptab.account",
    "team.finden", "team.findenPlatzhalter", "team.gruenden", "friends.termsTitle",
    # Phase 7: Ausruestung
    "gear.title", "gear.mastShim", "gear.searchHint", "gear.noHits", "setup.stabTitle", "setup.boardTitle",
    # Phase 8: Community-Reiter, Team-Bestenlisten
    "tab.rankings", "tab.media", "land.teamsTitle", "team.vergleich.titel", "team.vergleich.hinweis",
    "team.vergleich.top", "team.vergleich.ausFahrern", "team.vergleich.leer", "team.bild.titel", "team.aktivste",
    "team.alle",
    # Phase 9: Spots-Reiter
    "tab.map", "tab.list", "tab.routes",
    # Nachtrag aus dem iOS-Port (fehlten in den App-Tabellen)
    "team.keineTeams", "tab.watchAccounts", "team.profilKnopf", "team.profilHinweis", "period.yesterday",
    # Nachtrag aus dem Android-Port
    "tab.noRecords", "setup.stabSearch", "foils.hint", "profile.avatar", "profile.dataTitle", "profile.calculator",
    # Team-Verwaltung nativ, Home › Stats, Windfenster (04.11.2026)
    "brett.erkl.titel", "brett.erkl.was", "brett.erkl.wie", "brett.erkl.bringt", "brett.erkl.daten", "brett.erkl.mehr",
    "region.earth", "region.eu", "region.af", "region.as", "region.na", "region.sa", "region.oc",
    "profile.landNone", "team.herkunft", "share.errImage", "spot.windTitle", "spot.windText", "spot.windNote", "tab.noData",
    "fontscale.label", "fontscale.hint", "sd.avgHrTotal",
]


def lies(code):
    s = io.open(WEB / f"{code}.ts", encoding="utf-8").read()
    return {json.loads(k): json.loads(v) for k, v in
            re.findall(r'^  ("(?:[^"\\]|\\.)*"): ("(?:[^"\\]|\\.)*"),$', s, re.M)}


T = {c: lies(c) for c in LANGS}
fehlt = [k for k in SCHLUESSEL if k not in T["de"] or k not in T["en"]]
if fehlt:
    sys.exit(f"FEHLT im Web (de/en): {fehlt}")


def schon_da(verz, muster, ausser):
    da = set()
    for f in verz.glob(muster):
        if f.name == ausser:
            continue
        src = io.open(f, encoding="utf-8").read()
        for k in SCHLUESSEL:
            if f'"{k}"' in src and re.search(r'"' + re.escape(k) + r'"\s*(to|:)', src):
                da.add(k)
    return da


def wert(c, k):
    return T[c].get(k)


# --- Android ---
and_da = schon_da(AND, "I18n*.kt", "I18nPort.kt")
ak = [k for k in SCHLUESSEL if k not in and_da]
o = ["package org.pumpfoil.app", "",
     "// Texte des App-Ports (docs/UX-IA.md, ab 04.11.2026). ERZEUGT von scripts/gen-i18n-port.py aus",
     "// web/src/i18n/locales/*.ts — Wortlaut im Web aendern und neu erzeugen, nie hier. I18n.t fragt diese Tabelle",
     "// nach NEU und den Teams-Texten; Rueckfall gsw/de-AT -> de, pt-PT -> pt, dann Englisch.", "",
     "private val PORT_BRUECKE = mapOf(\"gsw\" to \"de\", \"de-AT\" to \"de\", \"pt-PT\" to \"pt\")", "",
     "private val PORT_TEXTE: Map<String, Map<String, String>> by lazy {", "    mapOf("]
for c in LANGS:
    paare = [(k, wert(c, k)) for k in ak if wert(c, k) is not None]
    o.append(f"        {json.dumps(c)} to mapOf(")
    for k, v in paare:
        o.append(f"            {json.dumps(k)} to {json.dumps(v, ensure_ascii=False).replace('$', chr(92) + '$')},")
    o.append("        ),")
o += ["    )", "}", "",
      "internal fun portText(key: String, lang: String): String? =",
      "    PORT_TEXTE[lang]?.get(key) ?: PORT_BRUECKE[lang]?.let { PORT_TEXTE[it]?.get(key) } ?: PORT_TEXTE[\"en\"]?.get(key)", ""]
io.open(AND / "I18nPort.kt", "w", encoding="utf-8").write("\n".join(o))

# --- iOS ---
ios_da = schon_da(IOS, "Loc*.swift", "LocPort.swift")
ik = [k for k in SCHLUESSEL if k not in ios_da]


def sw(v):
    return re.sub(r'\\u([0-9a-fA-F]{4})', r'\\u{\1}', json.dumps(v, ensure_ascii=False))


BLOCK = 45
o = ["import Foundation", "",
     "// Texte des App-Ports (docs/UX-IA.md, ab 04.11.2026). ERZEUGT von scripts/gen-i18n-port.py aus",
     "// web/src/i18n/locales/*.ts — Wortlaut im Web aendern und neu erzeugen, nie hier. Loc.t fragt diese Tabelle zuerst.",
     f"// Je Sprache Bloecke zu hoechstens {BLOCK} Eintraegen (Swift-Type-Checker, s. LocTeams.swift).", "",
     "enum LocPort {",
     "    /// nil = Schluessel unbekannt (dann sucht Loc.t in den grossen Tabellen weiter).",
     "    static func t(_ key: String, _ lang: String) -> String? {",
     "        guard schluessel.contains(key) else { return nil }",
     "        if let v = sprachen[lang]?[key] { return v }",
     "        if lang == \"pt-PT\", let v = sprachen[\"pt\"]?[key] { return v }",
     "        if lang == \"gsw\" || lang == \"de-AT\", let v = sprachen[\"de\"]?[key] { return v }",
     "        return sprachen[\"en\"]?[key]",
     "    }", "",
     "    static let schluessel: Set<String> = [" + ", ".join(sw(k) for k in ik) + "]", "",
     "    static let sprachen: [String: [String: String]] = {",
     "        var r: [String: [String: String]] = [:]"]
for c in LANGS:
    paare = [(k, wert(c, k)) for k in ik if wert(c, k) is not None]
    o.append(f"        var m{c.replace('-', '')}: [String: String] = [:]")
    for i in range(0, len(paare), BLOCK):
        teil = paare[i:i + BLOCK]
        o.append(f"        let b{c.replace('-', '')}{i // BLOCK}: [String: String] = [" + ", ".join(f"{sw(k)}: {sw(v)}" for k, v in teil) + "]")
        o.append(f"        m{c.replace('-', '')}.merge(b{c.replace('-', '')}{i // BLOCK}) {{ a, _ in a }}")
    o.append(f"        r[{sw(c)}] = m{c.replace('-', '')}")
o += ["        return r", "    }()", "}", ""]
io.open(IOS / "LocPort.swift", "w", encoding="utf-8").write("\n".join(o))
print(f"Android: {len(ak)} Schluessel ({len(and_da)} schon da: {sorted(and_da)}) · iOS: {len(ik)} ({len(ios_da)} schon da: {sorted(ios_da)})")
