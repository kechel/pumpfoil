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
    "calc.mastImmersion", "calc.mastImmersionHint",
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
    # 05.11.2026: Rangliste nach Oleks Entwurf (Ueberschriften „Bestenlisten – Mitglieder/Teams"), Uhren-Statistik-Reiter
    "home.leaderboards", "watchStats.sectionFoiling",
    # 05.11.2026: Region-Filter der Rangliste (Nationalitaet)
    "region.global", "region.basis", "region.ohneLand",
    "team.community",
    # 06.11.2026: globale Events, Event-Hinweise, Opt-out, Fehlt-Hinweis mit Vorlage
    "globalev.title", "globalev.hint", "globalev.switch", "foils.missingPrefill", "setup.missingStabPrefill",
    "team.eventsGlobal", "eventHinweis.live", "eventHinweis.bald", "eventHinweis.teamLive", "team.eventsMeineTeams",
    "team.event.keineGlobalen", "team.event.global", "team.event.globalHaken", "team.event.globalHinweis",
    "team.event.globalOptOut", "team.event.wertung", "team.event.wertungBeste", "team.event.wertungAlle",
    "team.event.teams", "team.event.neuLaden", "team.event.standUm", "team.event.endstand", "team.event.keineTeams",
    # 05.11.2026: Garmin Connect (Karte unter Uhr & Konten) und Quellenzeile unter Rekorden/Bestenlisten
    "settings.garmin.hint", "settings.garmin.connect", "settings.garmin.connected", "settings.garmin.unlink",
    "settings.garmin.noExport", "settings.garmin.help1", "settings.garmin.help2", "settings.garmin.help3",
    "settings.garmin.help4", "quellen.titel", "quellen.phone", "quellen.file",
    # 06.11.2026: Garmin „beides verbinden" (zwei Schritte, Home-Hinweis), Schliessen-Knopf
    "garmin.beides.schritt1", "garmin.beides.schritt2", "garmin.beides.zuGc", "garmin.beides.zuCode",
    "garmin.fehltGc", "garmin.fehltCode", "banner.dismiss",
    # 06.11.2026: Nachladen in den Session-Listen (Spot-Liste mit Knopf), Listenende
    "sessions.loadMore", "sessions.listEnd",
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
    # Nachtrag Abgleich 04.11.2026: Likes, Kommentare, Neu bei mir, Nationalitaet, Team-Seite, Einladung, Upload ersetzen
    "sd.whoLiked", "sd.likes", "comments.title", "comments.empty", "comments.placeholder", "comments.offOwner",
    "comments.offLink", "comments.settingHint", "comments.settingSwitch", "act.title", "act.comment", "act.like",
    "act.likeMany", "act.session", "profile.land", "profile.landHint", "tab.events", "tab.logbook",
    "tab.rules", "team.einladungUngueltig", "team.feed30", "team.alleMeine", "sessions.uploadReplaceAsk", "team.regeln.intro",
    "team.regeln.was.titel", "team.regeln.was.text", "team.regeln.rollen.titel", "team.regeln.rollen.text", "team.regeln.beitreten.titel", "team.regeln.beitreten.text",
    "team.regeln.oeffentlich.titel", "team.regeln.oeffentlich.text", "team.regeln.bestenlisten.titel", "team.regeln.bestenlisten.text", "team.regeln.statistik.titel", "team.regeln.statistik.text",
    "team.regeln.logbuch.titel", "team.regeln.logbuch.text", "team.regeln.chat.titel", "team.regeln.chat.text", "team.regeln.loeschen.titel", "team.regeln.loeschen.text",
    "team.regeln.konto.titel", "team.regeln.konto.text", "team.regeln.haftung.titel", "team.regeln.haftung.text", "team.regeln.events.titel", "notif.typeComment", "onb.watch.title", "home.topCommented", "theme.dark", "theme.light", "tech.hLong", "tech.hShort", "tech.lShort", "tech.allRuns", "team.regeln.events.text",
    # Uhr-Bereich wie im Web: Anleitung | Einstellungen | Meine Uhr(en) (Android, 04.11.2026)
    "account.tabGuide", "tab.watchSettings", "account.tabConnect",
    # iOS: Uhr-Reiter wie web Account.tsx (Anleitung | Einstellungen | Meine Uhr(en), Datenseiten | Alarm)
    "account.tabFaces", "account.tabAlarm",
    # iOS: Uhr › Anleitung je Plattform + Kompatibilitaet (web WatchGuide/WatchMatrix), Uhr › Einstellungen (5 Reiter)
    "account.tabCompat", "account.toLayouts", "tab.watchSettingsUhr", "guide.appleSub", "guide.a.s1Title", "guide.a.s1", "guide.a.s2Title", "guide.a.s2a",
    "guide.a.s2b", "guide.a.s3Title", "guide.a.s3", "guide.a.s4Title", "guide.a.s4", "guide.wearSub", "guide.w.s1Title", "guide.w.s1",
    "guide.w.s1Note", "guide.w.s2Title", "guide.w.s2a", "guide.w.s2b", "guide.w.s3Title", "guide.w.s3", "guide.w.s4Title", "guide.w.s4",
    "guide.amazfitSub", "guide.z.store", "guide.z.s1", "guide.z.s2", "guide.z.s3", "guide.z.s4", "guide.huaweiSub", "guide.h.s1",
    "guide.h.s2", "guide.h.s3", "guide.h.s4", "guide.preview", "guide.previewVer", "guide.cap.gStart", "guide.cap.gSettings", "guide.cap.gPairCode",
    "guide.cap.gPairOk", "guide.cap.gAlarm1", "guide.cap.gAlarm2", "guide.cap.gAlarm3", "guide.cap.onFoil", "guide.cap.wConnect", "guide.cap.wStart", "guide.cap.wAlarm",
    "guide.cap.wStats", "guide.cap.wRun", "guide.cap.wStop", "guide.cap.aConnect", "guide.cap.aCode", "guide.cap.aStart", "guide.cap.aAlarm", "guide.cap.aStop",
    "guide.cap.aUpload", "guide.settings.title", "guide.settings.intro", "guide.settings.intro2", "guide.settings.recordTitle", "guide.settings.record", "guide.settings.gnssTitle", "guide.settings.gnss",
    "guide.settings.gpsWarn", "guide.settings.zepp", "watches.title", "watches.intro", "watches.colDevice", "watches.colGps", "watches.colHr", "watches.colPump",
    "watches.colStatus", "watches.foot", "watches.legYes", "watches.legPartial", "watches.legNo", "watches.linkAccount", "watches.linkViaSuunto", "watches.nGarmin",
    "watches.nApple", "watches.nWear", "watches.nAmazfit", "watches.nHuaweiW5", "watches.nHuawei", "watches.nPolar", "watches.nSuunto", "watches.nXiaomi",
    "watches.nFitbit", "watches.nStrava", "watches.subStrava", "watches.st.avail", "watches.st.planned", "watches.st.import", "watches.st.no", "watches.st.nope",
    # Android: Uhr › Einstellungen › Uhr-Einstellungen, Hinweis wie im Web (04.11.2026)
    "account.recordModeMoved",
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
