# -*- coding: utf-8 -*-
"""Erzeugt die Onboarding-Texte fuer Android und iOS AUS den Web-Sprachdateien.

Keine neue Uebersetzung: web/src/i18n/locales/*.ts ist die Quelle, dort stehen alle 18
Sprachen bereits. So kann der Wortlaut zwischen PWA und Apps nicht auseinanderlaufen.
"""
import io, json, re, pathlib

WEB = pathlib.Path("web/src/i18n/locales")
BASIS = ["de", "gsw", "de-AT", "en", "fr", "it", "es"]          # Zeilen der Grundtabelle
OVERLAY = ["fi", "nl", "cs", "pt", "pt-PT", "ja", "zh", "ru", "id", "nb", "pl"]

# Texte, die der Assistent MITBENUTZT und die in den Apps anders (oder gar nicht) heissen.
# Sie wandern unter einem "onb."-Alias in dieselbe Tabelle: so bleibt der Wortlaut an EINER
# Stelle (den Web-Sprachdateien), ohne ihn dort unter zwei Schluesseln zu doppeln, und der
# Zugriff ueber das "onb."-Praefix funktioniert unveraendert.
ALIAS = {
    "onb.x.lang": "lang.label", "onb.x.name": "profile.displayName",
    "onb.x.namePh": "profile.namePlaceholder", "onb.x.saved": "profile.saved",
    "onb.x.nameTaken": "profile.nameTaken", "onb.x.nameLen": "profile.nameLen",
    "onb.x.saveErr": "profile.saveError", "onb.x.save": "common.save",
    "onb.x.weight": "profile.weight", "onb.x.add": "foils.add", "onb.x.remove": "foils.remove",
    "onb.x.missingCta": "foils.missingCta", "onb.x.claimTitle": "account.claimTitle",
    "onb.x.claimPh": "account.claimPlaceholder", "onb.x.claimBtn": "account.claimBtn",
    "onb.x.claimOk": "account.claimOk", "onb.x.claimAlready": "account.claimAlready",
    "onb.x.phonerec": "phonerec.label", "onb.x.pwaNote": "phonerec.pwaNote",
    "onb.x.chat": "chat.globalName", "onb.x.feedback": "feedback.open",
    "onb.x.linked": "linked.title",
    "onb.x.polarTitle": "settings.polar.title", "onb.x.polarConnect": "settings.polar.connect",
    "onb.x.corosTitle": "settings.coros.title", "onb.x.corosConnect": "settings.coros.connect",
    "onb.x.suuntoTitle": "settings.suunto.title", "onb.x.suuntoConnect": "settings.suunto.connect",
}
for _s in ("pumpfoil", "wingfoil", "kitefoil", "surf_downwind", "efoil", "foildrive", "other"):
    ALIAS[f"onb.x.sport.{_s}"] = f"cls.sport.{_s}"
for _s in ("normal", "light", "attempts"):
    ALIAS[f"onb.x.sens.{_s}"] = f"foilsens.{_s}"


def lies(code):
    s = io.open(WEB / f"{code}.ts", encoding="utf-8").read()
    alle = {json.loads(k): json.loads(v) for k, v in
            re.findall(r'^  ("(?:[^"\\]|\\.)*"): ("(?:[^"\\]|\\.)*"),$', s, re.M)}
    d = {k: v for k, v in alle.items() if k.startswith("onb.")}
    for alias, quelle in ALIAS.items():
        if quelle in alle:
            d[alias] = alle[quelle]
    return d

T = {c: lies(c) for c in BASIS + OVERLAY}
KEYS = sorted(T["de"])
# Aliasse duerfen in einer Sprache fehlen (die Datei ist dort kleiner) — dann greift der
# Rueckfall auf Englisch bzw. Deutsch, genau wie bei jedem anderen Schluessel.
for c in list(T):
    luecken = [k for k in KEYS if k not in T[c]]
    if luecken:
        print(f"  {c}: {len(luecken)} Alias(se) nicht uebersetzt -> Rueckfall")
    T[c] = {k: T[c][k] for k in KEYS if k in T[c]}
fehlt_de = [k for k in KEYS if k not in T["de"]]
assert not fehlt_de, fehlt_de
print(f"{len(KEYS)} Schluessel aus {len(T)} Sprachen gelesen "
      f"({len([k for k in KEYS if k.startswith('onb.x.')])} davon geliehen).")

def kot(s):   # Kotlin-Literal
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"').replace("$", "\\$") + '"'
def swi(s):   # Swift-Literal
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'

# ---------------------------------------------------------------- Android ---------------------
zeilen = ['package org.pumpfoil.app', '',
 '// Texte des Einrichtungs-Assistenten (/onboarding). ERZEUGT aus web/src/i18n/locales/*.ts',
 '// (scripts/i18n-onboarding-native.py) — dort steht der Wortlaut, hier nur die Kopie, damit',
 '// PWA und App nicht auseinanderlaufen. Eigene Datei und eigener Zugriff: die Schluessel',
 '// beginnen alle mit "onb.", I18n.t() fragt sie vor der grossen Tabelle ab. Damit bleiben die',
 '// bestehenden Tabellen unberuehrt.', '',
 'object OnbI18n {',
 '    fun get(key: String, lang: String): String? {',
 '        EXTRA[lang]?.get(key)?.let { return it }',
 '        if (lang == "pt-PT") EXTRA["pt"]?.get(key)?.let { return it }',
 '        val row = BASE[key] ?: return null',
 '        val rueckfall = if (lang in EXTRA.keys) (row["en"] ?: row["de"]) else row["de"]',
 '        return row[lang] ?: rueckfall ?: row["en"]',
 '    }', '',
 '    // Eigener Zeilen-Helfer: das `row()` in I18n.kt ist dateiprivat.',
 '    private fun row(de: String, gsw: String, deAT: String, en: String, fr: String,',
 '                    it: String, es: String) = mapOf(',
 '        "de" to de, "gsw" to gsw, "de-AT" to deAT, "en" to en, "fr" to fr, "it" to it, "es" to es)',
 '',
 '    private val BASE: Map<String, Map<String, String>> = mapOf(']
for k in KEYS:
    zeilen.append('        %s to row(%s),' % (kot(k), ", ".join(kot(T[c].get(k, T["de"][k])) for c in BASIS)))
zeilen += ['    )', '',
 '    private val EXTRA: Map<String, Map<String, String>> = mapOf(']
for c in OVERLAY:
    zeilen.append('        "%s" to mapOf(' % c)
    for k in KEYS:
        if k in T[c]: zeilen.append('            %s to %s,' % (kot(k), kot(T[c][k])))
    zeilen.append('        ),')
zeilen += ['    )', '}', '']
io.open("android/app/src/main/java/org/pumpfoil/app/I18nOnboarding.kt", "w",
        encoding="utf-8").write("\n".join(zeilen))
print("Android:", len(zeilen), "Zeilen")

# ---------------------------------------------------------------- iOS -------------------------
# Woerterbuecher in Bloecke <= 30 Eintraege: ein Literal mit allem waere fuer den Swift-
# Type-Checker EIN Ausdruck (s. Loc.swift, der Build hing dort schon einmal minutenlang).
def bloecke(paare, n=30):
    return [paare[i:i+n] for i in range(0, len(paare), n)]

s = ['import Foundation', '',
 '// Texte des Einrichtungs-Assistenten. ERZEUGT aus web/src/i18n/locales/*.ts',
 '// (scripts/i18n-onboarding-native.py) — dort steht der Wortlaut, hier nur die Kopie.',
 '// Eigene Datei und eigener Zugriff: alle Schluessel beginnen mit "onb.", Loc.t() fragt sie',
 '// vor der grossen Tabelle ab; die bestehenden Tabellen bleiben unberuehrt.',
 '//',
 '// Woerterbuecher in Bloecke zerlegt: EIN Literal mit allen Eintraegen ist fuer den',
 '// Swift-Type-Checker EIN Ausdruck, dessen Kosten ueberproportional wachsen (Loc.swift hing',
 '// daran schon einmal minutenlang). Zusammengefuehrt beim ersten Zugriff.', '',
 'enum LocOnb {',
 '    static func t(_ key: String, _ lang: String) -> String? {',
 '        if let d = extra[lang], let v = d[key] { return v }',
 '        if lang == "pt-PT", let d = extra["pt"], let v = d[key] { return v }',
 '        guard let row = base[key] else { return nil }',
 '        let rueckfall = extra[lang] != nil ? (row["en"] ?? row["de"]) : row["de"]',
 '        return row[lang] ?? rueckfall ?? row["en"]',
 '    }', '']
teile = bloecke(KEYS)
s.append('    static let base: [String: [String: String]] = {')
s.append('        var d: [String: [String: String]] = [:]')
s.append('        for p in [%s] { d.merge(p) { a, _ in a } }' % ", ".join(f"_b{i}" for i in range(len(teile))))
s.append('        return d')
s.append('    }()')
for i, teil in enumerate(teile):
    s.append(f'    private static let _b{i}: [String: [String: String]] = [')
    for k in teil:
        paare = ", ".join(f'"{c}": {swi(T[c].get(k, T["de"][k]))}' for c in BASIS)
        s.append(f'        {swi(k)}: [{paare}],')
    s.append('    ]')
s.append('')
s.append('    static let extra: [String: [String: String]] = {')
s.append('        var d: [String: [String: String]] = [:]')
for c in OVERLAY:
    name = c.replace("-", "_")
    s.append(f'        d[{swi(c)}] = _{name}')
s.append('        return d')
s.append('    }()')
for c in OVERLAY:
    name = c.replace("-", "_")
    teile_c = bloecke(KEYS)
    s.append(f'    private static let _{name}: [String: String] = {{')
    s.append('        var d: [String: String] = [:]')
    s.append('        for p in [%s] { d.merge(p) { a, _ in a } }' % ", ".join(f"_{name}{i}" for i in range(len(teile_c))))
    s.append('        return d')
    s.append('    }()')
    for i, teil in enumerate(teile_c):
        s.append(f'    private static let _{name}{i}: [String: String] = [')
        for k in teil:
            if k in T[c]: s.append(f'        {swi(k)}: {swi(T[c][k])},')
        s.append('    ]')
s += ['}', '']
io.open("watch-apple/Sources-iOS/LocOnboarding.swift", "w", encoding="utf-8").write("\n".join(s))
print("iOS:", len(s), "Zeilen")
