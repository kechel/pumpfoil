package org.pumpfoil.app

import androidx.compose.foundation.text.ClickableText
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight

/**
 * Text mit `<b>…</b>` als echte Fettung und `<a href="…">…</a>` als antippbarer Link.
 *
 * Die Impressum-Texte kommen unveraendert aus den Web-Locales und enthalten dort `<b>`-Marken,
 * die der Browser rendert. Die App zeigte sie bis 31.08. als sichtbare Zeichen
 * („<b>Hochgeladene Fotos</b>: …") — in acht der Abschnitte. Statt die Marken zu entfernen
 * (und die Betonung zu verlieren) werden sie hier in eine AnnotatedString-Spanne uebersetzt.
 *
 * LINKS (29.09.2026): seit dem Hosting-Block und in den Overlays fi/nl/cs/nb/pl stehen auch
 * `<a href>`-Marken in den Texten — die App zeigte sie als rohes HTML. Ein Link bekommt eine
 * "URL"-Annotation (auszuwerten mit [RichTextView]); relative Ziele wie `/datenloeschung` zeigen
 * auf pumpfoil.org. Jede ANDERE Marke faellt stumm weg, eine unpaarige ebenso, statt sichtbar
 * stehen zu bleiben.
 *
 * @param farbe optional zusaetzlich zur Fettung — der Social-Hinweis nutzt Marken-Cyan, weil der
 *   fette Satz dort die Aufforderung ist (Jan, 31.08.). Im Impressum bleibt es rein fett.
 * @param linkFarbe Farbe der Links; ohne Angabe nur unterstrichen.
 */
fun richText(roh: String, farbe: Color? = null, linkFarbe: Color? = null): AnnotatedString = buildAnnotatedString {
    val marke = Regex("<(/?)([a-zA-Z]+)([^>]*)>")
    val hrefRe = Regex("""href\s*=\s*"([^"]*)"""")
    var i = 0
    var fett = 0
    var link = false
    for (m in marke.findAll(roh)) {
        append(roh.substring(i, m.range.first))
        i = m.range.last + 1
        val zu = m.groupValues[1] == "/"
        when (m.groupValues[2].lowercase()) {
            "b", "strong" -> if (zu) { if (fett > 0) { pop(); fett-- } } else {
                pushStyle(if (farbe != null) SpanStyle(fontWeight = FontWeight.Bold, color = farbe)
                          else SpanStyle(fontWeight = FontWeight.Bold)); fett++
            }
            "a" -> if (zu) { if (link) { pop(); pop(); link = false } } else if (!link) {
                var ziel = hrefRe.find(m.groupValues[3])?.groupValues?.get(1) ?: ""
                if (ziel.startsWith("/")) ziel = "https://pumpfoil.org$ziel"
                pushStringAnnotation("URL", ziel)
                pushStyle(SpanStyle(color = linkFarbe ?: Color.Unspecified, textDecoration = TextDecoration.Underline))
                link = true
            }
            else -> {}
        }
    }
    append(roh.substring(i))
    if (link) { pop(); pop() }
    repeat(fett) { pop() }
}

/** [richText] als Text, dessen Links sich antippen lassen (oeffnet den Browser). */
@Composable
fun RichTextView(roh: String, style: TextStyle, color: Color, linkFarbe: Color = MaterialTheme.colorScheme.primary) {
    val text = richText(roh, linkFarbe = linkFarbe)
    if (text.getStringAnnotations("URL", 0, text.length).isEmpty()) {
        Text(text, style = style, color = color)
        return
    }
    val uri = LocalUriHandler.current
    @Suppress("DEPRECATION")
    ClickableText(text, style = style.copy(color = color)) { pos ->
        text.getStringAnnotations("URL", pos, pos).firstOrNull()?.let { a ->
            if (a.item.isNotEmpty()) runCatching { uri.openUri(a.item) }
        }
    }
}
