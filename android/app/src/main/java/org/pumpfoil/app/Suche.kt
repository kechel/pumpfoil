package org.pumpfoil.app

import java.text.Normalizer

// Suchtext vergleichbar machen — dieselbe Regel wie Server (server/app/suche.py) und Web
// (web/src/lib/suche.ts). Anlass (Jan, 01.10.2026): „vivo" fand „vívoactive®" nicht, „zurich" nicht
// Zürich, „fone" nicht F-One. Regel: der Suchtext zerfaellt in WORTE, jedes muss vorkommen;
// verglichen wird klein, ohne Akzente, ohne Bindestriche, Leerzeichen und ®™©.
private val MEHR = mapOf('ß' to "ss", 'æ' to "ae", 'œ' to "oe")
private val EXTRA = mapOf('ł' to 'l', 'đ' to 'd', 'ø' to 'o', 'ı' to 'i', 'ħ' to 'h', 'þ' to 't')
private val AKZENTE = Regex("\\p{Mn}+")
private val WEG = Regex("[-‐–—_®™©'’\\s]")

fun suchform(s: String?): String {
    val klein = (s ?: "").lowercase()   // VOR den Buchstaben unten, sonst bliebe das grosse Ł stehen
    val sb = StringBuilder()
    for (c in klein) { val m = MEHR[c]; if (m != null) sb.append(m) else sb.append(EXTRA[c] ?: c) }
    val ohne = AKZENTE.replace(Normalizer.normalize(sb, Normalizer.Form.NFD), "")
    return WEG.replace(ohne, "")
}

fun suchworte(q: String?): List<String> = (q ?: "").split(Regex("\\s+")).map { suchform(it) }.filter { it.isNotEmpty() }

/** Kommt jedes Wort der Suche `q` in einem der Texte vor (beliebig verteilt)? Leere Suche passt immer. */
fun passtZu(q: String?, vararg texte: String?): Boolean {
    val ws = suchworte(q)
    if (ws.isEmpty()) return true
    val t = texte.joinToString(" ") { suchform(it) }
    return ws.all { t.contains(it) }
}
