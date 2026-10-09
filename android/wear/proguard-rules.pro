# R8-Regeln der Wear-App (aktiviert 02.09.2026, s. app/proguard-rules.pro).
#
# Bis 09.10. LEER (s. Nachtrag unten), und das war geprueft: der Release-Build mit R8 wurde im Wear-Emulator durchgefahren —
# Pairing-Bildschirm, Geraete-Konfiguration vom Server (`/api/devices/config?p=wear&v=1.2.25`
# -> 200), eigenes Datenseiten-Layout, Aufnahme gestartet. Der Vordergrunddienst kam mit
# `types=00000108` hoch, also Standort + Health — dieselbe Kombination wie im unverschleierten
# Build. Health Services, ListenableFuture und play-services bringen ihre Regeln selbst mit.

# NACHTRAG 09.10.2026 — Google Play hat Wear 1.2.40 (1050) abgelehnt: „Your app crashed when testing".
# Im Emulator mit dem R8-Release-Build nachgestellt: Absturz sofort beim Aufnahmestart, sobald alle
# Berechtigungen erteilt sind (erst dann laeuft der neue Health-Services-Messweg aus 1.2.40):
#   ExceptionInInitializerError in DataType.<clinit>
#   Caused by: RuntimeException: Field name_ for DataProto$DataType not found
# protobuf-lite (das Health Services fuer seine Datentypen benutzt) findet die Felder seiner
# Nachrichten-Klassen PER NAME ueber Reflexion; R8 hatte sie umbenannt. Health Services 1.0.0 bringt
# dafuer keine Regel mit. Der Debug-Build und der Test vom 02.09. (noch ohne ExerciseClient) konnten
# das nicht zeigen — deshalb: Release-Builds IMMER mit allen Berechtigungen bis in die Aufnahme fahren.
-keepclassmembers class * extends com.google.protobuf.GeneratedMessageLite { <fields>; }
