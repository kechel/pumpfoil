# Gleicht die Android-Texte fuer Teams/Events/Referee mit dem Web ab (web/src/i18n/locales/*.ts ist die Quelle):
#  1. android/.../I18nTeams.kt: ALLE Web-Schluessel `team.*` (neue dazu, geaenderte Texte uebernommen, z. B. Team-Regeln
#     nach einem neuen REGELN_STAND); Android-eigene Schluessel ohne Web-Gegenstueck bleiben stehen.
#  2. android/.../I18nEvents.kt: weitere Schluessel aus WEITERE (Referee, Session-Event-Kennzeichen, Takt laut Uhr …),
#     von I18n.t ueber eventsText() gefragt.
# Wortlaut nie in den erzeugten Dateien aendern — im Web aendern und neu erzeugen.
# Aufruf: python3 scripts/gen-i18n-android-teams.py
import io, json, re, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
WEB = ROOT / "web/src/i18n/locales"
AND = ROOT / "android/app/src/main/java/org/pumpfoil/app"
LANGS = ["de", "gsw", "de-AT", "en", "fr", "it", "es", "fi", "nl", "cs", "pl", "pt", "pt-PT", "ja", "zh", "ru", "id", "nb"]
FUN = {c: "texte" + c.upper().replace("-", "") for c in LANGS}

# Praefixe/Schluessel ausserhalb von `team.*`, die die App braucht (Stand 16.11.2026).
WEITERE_PRAEFIXE = ("ref.",)
WEITERE = ["sd.eventZaehlt", "sd.eventKategorieHinweis", "sd.taktUhr"]


def lies(code):
    s = io.open(WEB / f"{code}.ts", encoding="utf-8").read()
    return {json.loads(k): json.loads(v) for k, v in
            re.findall(r'^  ("(?:[^"\\]|\\.)*"): ("(?:[^"\\]|\\.)*"),$', s, re.M)}


def kt(v):
    return json.dumps(v, ensure_ascii=False).replace("$", "\\$")


T = {c: lies(c) for c in LANGS}

# --- 1. I18nTeams.kt ---
p = AND / "I18nTeams.kt"
src = io.open(p, encoding="utf-8").read()
for c in LANGS:
    kopf = f"private fun {FUN[c]}(): Map<String, String> = mapOf(\n"
    a = src.index(kopf) + len(kopf)
    b = src.index("\n)\n", a)
    alt = dict((json.loads(k), json.loads(v)) for k, v in
               re.findall(r'^    ("(?:[^"\\]|\\.)*") to ("(?:[^"\\]|\\.)*"),$', src[a:b], re.M))
    neu = dict(alt)
    for k, v in T[c].items():
        if k.startswith("team."):
            neu[k] = v
    zeilen = [f"    {kt(k)} to {kt(v)}," for k, v in sorted(neu.items())]
    src = src[:a] + "\n".join(zeilen) + src[b:]
io.open(p, "w", encoding="utf-8").write(src)

# --- 2. I18nEvents.kt ---
keys = sorted({k for k in T["en"] if k.startswith(WEITERE_PRAEFIXE)} | set(WEITERE))
fehlt = [k for k in keys if k not in T["en"]]
if fehlt:
    sys.exit(f"FEHLT im Web (en): {fehlt}")
o = ["package org.pumpfoil.app", "",
     "// Referee, Event-Kennzeichen an Sessions, Takt laut Uhr (16.11.2026). ERZEUGT von scripts/gen-i18n-android-teams.py aus",
     "// web/src/i18n/locales/*.ts — Wortlaut im Web aendern und neu erzeugen, nie hier. Rueckfall gsw/de-AT -> de, pt-PT -> pt,",
     "// dann Englisch. Je Sprache eine Funktion (64-KB-Grenze je Methode).", "",
     "private val EVENTS_BRUECKE = mapOf(\"gsw\" to \"de\", \"de-AT\" to \"de\", \"pt-PT\" to \"pt\")",
     "private val EVENTS_SCHLUESSEL: Set<String> = setOf(" + ", ".join(kt(k) for k in keys) + ")", "",
     "private val EVENTS_TEXTE: Map<String, Map<String, String>> by lazy {", "    mapOf("]
o += [f"        {kt(c)} to e{FUN[c]}()," for c in LANGS]
o += ["    )", "}", "",
      "internal fun eventsText(key: String, lang: String): String? {",
      "    if (key !in EVENTS_SCHLUESSEL) return null",
      "    return EVENTS_TEXTE[lang]?.get(key) ?: EVENTS_BRUECKE[lang]?.let { EVENTS_TEXTE[it]?.get(key) } ?: EVENTS_TEXTE[\"en\"]?.get(key)",
      "}", ""]
for c in LANGS:
    o.append(f"private fun e{FUN[c]}(): Map<String, String> = mapOf(")
    o += [f"    {kt(k)} to {kt(T[c][k])}," for k in keys if k in T[c]]
    o.append(")")
    o.append("")
io.open(AND / "I18nEvents.kt", "w", encoding="utf-8").write("\n".join(o))
print(f"I18nTeams.kt abgeglichen, I18nEvents.kt: {len(keys)} Schluessel")
