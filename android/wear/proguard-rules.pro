# R8-Regeln der Wear-App (aktiviert 02.09.2026, s. app/proguard-rules.pro).
#
# LEER, und das ist geprueft: der Release-Build mit R8 wurde im Wear-Emulator durchgefahren —
# Pairing-Bildschirm, Geraete-Konfiguration vom Server (`/api/devices/config?p=wear&v=1.2.25`
# -> 200), eigenes Datenseiten-Layout, Aufnahme gestartet. Der Vordergrunddienst kam mit
# `types=00000108` hoch, also Standort + Health — dieselbe Kombination wie im unverschleierten
# Build. Health Services, ListenableFuture und play-services bringen ihre Regeln selbst mit.
