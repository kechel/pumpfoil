package org.pumpfoil.app

import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle

/**
 * Text mit `<b>…</b>` als echte Fettung.
 *
 * Die Impressum-Texte kommen unveraendert aus den Web-Locales und enthalten dort `<b>`-Marken,
 * die der Browser rendert. Die App zeigte sie bis 31.08. als sichtbare Zeichen
 * („<b>Hochgeladene Fotos</b>: …") — in acht der Abschnitte. Statt die Marken zu entfernen
 * (und die Betonung zu verlieren) werden sie hier in eine AnnotatedString-Spanne uebersetzt.
 *
 * Bewusst ein einfacher Durchlauf statt HTML-Parser: in diesen Texten kommt genau `<b>` vor,
 * nichts sonst. Eine unpaarige Marke faellt hinten einfach weg statt aufzulaufen.
 */
fun richText(roh: String): AnnotatedString = buildAnnotatedString {
    var i = 0
    while (i < roh.length) {
        val auf = roh.indexOf("<b>", i)
        if (auf < 0) { append(roh.substring(i)); break }
        append(roh.substring(i, auf))
        val zu = roh.indexOf("</b>", auf + 3)
        if (zu < 0) { append(roh.substring(auf + 3)); break }
        withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append(roh.substring(auf + 3, zu)) }
        i = zu + 4
    }
}
