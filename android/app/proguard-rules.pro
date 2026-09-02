# R8-Regeln der Phone-App (aktiviert 02.09.2026, nachdem Play „Verschleierung 0 %" gemeldet hat).
#
# Absichtlich FAST LEER: der komplette Durchlauf im Emulator lief mit NULL eigenen Regeln durch
# (Start, Sessionliste, Detail mit Karte/Farbmodi/Teilen, Verlauf, Spots, Foilers, Chat, Profil) —
# die Bibliotheken bringen ihre Regeln selbst mit (kotlinx-serialization, osmdroid, Coil,
# play-services, credentials). Wer hier etwas hinzufuegt, sollte begruenden koennen, WELCHER
# Fehler damit verhindert wird; jede zu allgemeine Keep-Regel nimmt R8 wieder Optimierung weg.
#
# Zwei Wege konnten wir hier NICHT durchklicken, weil sie ein echtes Google-Konto bzw. den
# Play-Store brauchen. Fuer die beiden steht eine gezielte Versicherung drin — beide Bibliotheken
# laden Klassen ueber Reflexion, und ein Fehler waere fuer NEUE Nutzer ein Totalausfall
# (Anmeldung), nicht bloss ein Schoenheitsfehler:
-keep class com.google.android.libraries.identity.googleid.** { *; }
-keep class com.google.android.play.core.review.** { *; }

# Warum KEINE Regel fuer die per Name gespeicherten Enums (SessionViewPrefs schreibt
# `ColorMode.name` in die SharedPreferences und liest mit `valueOf` zurueck): geprueft, R8
# benennt zwar die Felder um, laesst die NAMENS-Strings aber stehen. Belegt im Emulator —
# nach Umschalten stand `<string name="sd_color_mode">HR</string>` in den Prefs und nach einem
# Kaltstart war „Puls" wieder ausgewaehlt. Falls sich das mit einer kuenftigen R8-Version
# aendert, ist die Regel:  -keepclassmembers enum org.pumpfoil.app.** { <fields>; }
