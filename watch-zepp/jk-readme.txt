ZEPP OS / AMAZFIT — BEFEHLE FUER JAN
====================================
Nur die Befehle, in der Reihenfolge, in der sie gebraucht werden. Das Warum steht in
README.md; Store-Bilder in ../brand/stores/zepp/README.md.
Alles laeuft auf dem Mac (~/gits/pumpfoil/watch-zepp) — auf der Linux-VM ist Zepp nicht baubar.


1) SYNTAX PRUEFEN (geht auch ohne Mac, dauert eine Sekunde)
-----------------------------------------------------------
    cd watch-zepp
    node --experimental-vm-modules -e "
    const fs=require('fs'),vm=require('vm');
    for (const f of ['page/index.js','app-side/index.js','setting/index.js'])
      new vm.SourceTextModule(fs.readFileSync(f,'utf8'),{identifier:f});
    console.log('ok')"

`node --check` REICHT NICHT — es laesst doppelt deklarierte Top-Level-Konstanten durch.
Genau daran ist `zeus build` am 26.08. UND am 10.09.2026 abgebrochen (beide Male
MAX_PLAUSIBLE_MPS). Der Befehl oben findet es, weil er die Datei als ES-Modul kompiliert.
=> Vor jedem Build laufen lassen. Sagt er `ok`, baut Zeus auch.


2) SIMULATOR (Balance 2) — REIHENFOLGE IST PFLICHT
---------------------------------------------------
Falsche Reihenfolge = Endlos-"shake timeout" bei jedem Request, "verbinde…" bleibt haengen.
Der App-Side-Worker (macht die Anfragen an pumpfoil.org) spawnt nur, wenn alle drei Teile
verbunden sind.

  a) Bei AUSGESCHALTETEM Simulator den Cache weg:
        rm -rf dist .zeus build

     Zombie-Prozess? (kommt vor, wenn der Simulator hart beendet wurde)
        pkill -9 -f "zeus|qemu|simulator|side-service|mps2-an521"
        lsof -i :7650          # muss LEER sein

  b) Geraete-Simulator STARTEN und warten, bis die App geladen ist.
     `zeus dev` startet ihn NICHT selbst, es verbindet sich nur.
     Der Simulator lauscht auf 7650 (zeus) + 7833 (Bridge).

  c) zeus dev
     Erwartet: "simulator connected" + rebuild.

  d) Bridge EINSCHALTEN. Im Bridge-JS-Log muss stehen:
        status:opened  ->  [RAW] [R] … 675300000000000067  ->  createWorker
        ->  [pumpfoil] app-side onInit / onRun
     Erst wenn `onInit` steht, antwortet der Worker.

ZWEI getrennte Logs, beide anschauen:
  - Firmware/QEMU (die Uhr):     "LOG > pumpfoil > …"
  - Bridge/App-Side (das Handy): "[pumpfoil] …", "status:opened", "POST /api/… -> status="

NACH JEDEM CODE-CHANGE ODER `git pull`: Simulator KOMPLETT neu (zeus dev beenden, Fenster
schliessen, ab a) neu). Hot-Reload spawnt den Worker NICHT neu. Auf echter Uhr kein Thema —
dort spawnt er beim App-Start.

GPS im Simulator: es gibt keins. Zum Testen von Aufnahme+Upload in page/index.js
`DEV_FAKE_GPS` kurz auf true setzen — und VOR Uhr/Release zurueck auf false.
Aktueller Stand pruefen:
        grep -n "DEV_FAKE_GPS" page/index.js


3) AUF DER ECHTEN UHR TESTEN
-----------------------------
    zeus preview        # QR-Code, in der Zepp-App scannen

Nur hier gibt es echte Tasten und echtes GPS — der Simulator hat beides nicht.


4) STORE-PAKET BAUEN
---------------------
    rm -rf dist .zeus build
    zeus build

Ergebnis liegt in dist/. Hochladen in der Zepp-Konsole (developer.zepp.com, appId 1118995).


5) VERSIONS-BUMP — ZWEI STELLEN, IMMER BEIDE
---------------------------------------------
    app.json          ->  app.version.name  UND  app.version.code
    page/index.js     ->  const APP_VERSION = "…"     (Zeile ~98)

Pruefen, dass sie zusammenpassen:
    python3 -c "import json;print(json.load(open('app.json'))['app']['version'])"
    grep -n 'APP_VERSION = ' page/index.js

WARUM: APP_VERSION wird auf der Uhr angezeigt UND dem Server gemeldet (reqQ CONFIG).
Am 31.08.2026 wurde app.json auf 1.0.8 gebumpt und die Konstante blieb auf 1.0.7 — die Uhr
hiess dann "v1.0.7" und meldete 1.0.7, obwohl 1.0.8 im Paket war. Am 10.09. nachgezogen.
`code` muss steigen, `name` ist die Nummer, die im Store steht.


6) STORE-BILDER (bei jeder Einreichung mit hochladen)
------------------------------------------------------
Fertig zum Hochladen in ../brand/stores/zepp/ :
    app-icon-240.png            -> Feld "App Icon"
    screenshots-rund/  (7x)     -> Feld "Screenshots runde Uhren"
    screenshots-eckig/ (7x)     -> Feld "Screenshots eckige Uhren"

Neu bauen (nur wenn es neue Simulator-Mitschnitte gibt):
    python3 ../scripts/zepp-store-previews.py                 # schreibt und PRUEFT selbst
    ZEPP_OUT=/tmp/probe python3 ../scripts/zepp-store-previews.py   # erst zur Probe
    cp ../screenshots/watch/zepp/store360/eckig/*.png ../brand/stores/zepp/screenshots-eckig/

1.0.7 wurde ZWEIMAL abgelehnt, beide Male nur wegen dieser Bilder — nie wegen der App.
Details und die Fallen: ../brand/stores/zepp/README.md


7) BEKANNTE WARNUNG BEIM BUILD (kein Fehler)
---------------------------------------------
    "The minimum width and height of the image assets/common.r/icon.png needs to be 248"

Das Uhr-Icon im Paket ist 124x124, Zepp empfiehlt >=248. Steht seit 1.0.6 so und hat noch
keine Ablehnung verursacht. Wenn es weg soll: 248x248 mit TRANSPARENTEN Ecken erzeugen —
NICHT die Zeile aus brand/master/build.sh nehmen, die macht eine deckende Kachel
(s. ../brand/stores/zepp/README.md, Abschnitt "Falle im Generator").
