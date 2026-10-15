using Toybox.Communications;
using Toybox.System;
using Toybox.Lang;
using Toybox.WatchUi;
using Toybox.PersistedContent;

// Laeuft der Handy-Recorder desselben Kontos? (Jan, 14.10.2026: „Handy verpackt — nimmt es auf?")
// Eigenes Modul statt Felder in SessionRecorder: die Klasse steht an der Grenze von 253 Mitgliedern
// (FR55, fenix 6, Instinct 2 brachen sonst beim Bauen ab).
//
// state: 0 = nichts anzeigen (Normalfall, fast alle fahren ohne Handy-Aufnahme), 1 = Handy nimmt
// auf, 2 = laeuft, aber seit agoMin Minuten keine Daten. Kommt mit dem Config-Abruf und alle 90 s
// per /devices/live-status, solange die Startseite offen ist — sonst saehe man einen erst NACH der
// Uhr-App gestarteten Handy-Recorder nicht. Fehlt die Antwort, bleibt 0.
module PhoneRec {
    var state = 0;
    var agoMin = 0;
    var _ctr = 0;

    // {"state": 0|1|2, "ago_min": n} — aus /config und /live-status gleich gelesen.
    // Auf den 96-KB-Uhren (lite) gibt es nur das Abmelden beim Verlassen (Jan, 14.10.2026), keine
    // Anzeige: dort zaehlt jedes KB.
    (:full)
    function lesen(pr) as Void {
        var alt = state;
        state = 0; agoMin = 0;
        if (pr instanceof Lang.Dictionary) {
            if (pr["state"] instanceof Lang.Number) { state = pr["state"]; }
            if (pr["ago_min"] instanceof Lang.Number) { agoMin = pr["ago_min"]; }
        }
        if (alt != state) { WatchUi.requestUpdate(); }
    }

    (:lite)
    function lesen(pr) as Void {}

    // Zeile fuer die Startseite oder null (Normalfall: nichts anzeigen).
    (:full)
    function zeile() {
        if (state == 1) { return Strings.s("phone.rec"); }
        if (state == 2) { return Strings.s("phone.recStale") + " " + agoMin.toString() + " " + Strings.s("phone.recAgo"); }
        return null;
    }
    (:lite)
    function zeile() { return null; }

    // Vom 1-Hz-Tick, nur ohne laufende Aufnahme. Auf den 96-KB-Uhren (lite) aus.
    (:full)
    function tickIdle() as Void {
        _ctr++;
        if (_ctr < 90) { return; }
        _ctr = 0;
        var token = Config.getString("deviceToken");
        if (token == null || token.equals("") || !System.getDeviceSettings().phoneConnected) { return; }
        // Nie neben einem laufenden Upload: der Uploader haelt selbst mehrere Anfragen offen, und
        // Connect IQ begrenzt die gleichzeitigen. Am 14.10. startete die fenix waehrend eines Uploads
        // neu (Phase „Startseite", ~90 s nach App-Start) — Ursache noch offen, das hier schliesst
        // diesen Verdacht aus.
        if (Uploader.isBusy() || Uploader.pendingCount() > 0) { return; }
        Communications.makeWebRequest(
            Config.baseUrl() + "/api/devices/live-status",
            {},
            {
                :method => Communications.HTTP_REQUEST_METHOD_GET,
                :headers => { "X-Device-Token" => token },
                :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON
            },
            new Lang.Method(PhoneRec, :onStatus));
    }
    (:lite)
    function tickIdle() as Void {}

    (:full)
    function onStatus(responseCode as Lang.Number, data as Lang.Dictionary or Lang.String or PersistedContent.Iterator or Null) as Void {
        if (responseCode == 200 && data instanceof Lang.Dictionary) { lesen(data["phone_rec"]); }
    }

    // Beim Verlassen der App ohne laufende Aufnahme (FoilApp.onStop): der Server zeigt die Uhr dann
    // nicht mehr als „nimmt vermutlich auf". Best effort — ob Connect IQ die Anfrage beim Beenden
    // noch rausschickt, ist nur auf echter Uhr pruefbar.
    function meldeAppZu() as Void {
        var token = Config.getString("deviceToken");
        if (token == null || token.equals("") || !System.getDeviceSettings().phoneConnected) { return; }
        // Wie bei der Handy-Abfrage: nie neben einem laufenden Upload. Dann entfaellt die Abmeldung,
        // und der Server zaehlt nach seiner 2-h-Regel. NUR isBusy, nicht „Sessions warten" — ohne Netz
        // warten sie oft, und dann meldete sich nie jemand ab.
        if (Uploader.isBusy()) { return; }
        Communications.makeWebRequest(
            Config.baseUrl() + "/api/devices/app-closed",
            {},
            {
                :method => Communications.HTTP_REQUEST_METHOD_POST,
                :headers => { "X-Device-Token" => token,
                              "Content-Type" => Communications.REQUEST_CONTENT_TYPE_JSON },
                :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON
            },
            new Lang.Method(PhoneRec, :onLeer));
    }

    function onLeer(responseCode as Lang.Number, data as Lang.Dictionary or Lang.String or PersistedContent.Iterator or Null) as Void {}

    // Erster GPS-Fix im Startbildschirm -> einmal je App-Start an den Server (Jan, 15.10.2026).
    // Der Server sucht den Spot im Umkreis von 1 km und merkt sich NUR den Spot, nicht die Position;
    // ohne Spot in der Naehe zaehlt man nicht als „gerade am Pumpen" (Emulator zu Hause). Auch auf
    // den 96-KB-Uhren (lite), wie das Abmelden. Vom Positions-Callback, nur ohne laufende Aufnahme.
    // _pos: 0 = noch nicht gemeldet, 1 = Anfrage unterwegs, 2 = erledigt. Hoechstens 3 Versuche.
    var _pos = 0;
    var _posVersuche = 0;

    function meldePosition(deg) as Void {
        if (_pos != 0 || _posVersuche >= 3) { return; }
        var token = Config.getString("deviceToken");
        if (token == null || token.equals("") || !System.getDeviceSettings().phoneConnected) { return; }
        if (Uploader.isBusy()) { return; }   // nie neben einem Upload (s. tickIdle); naechster Fix probiert es wieder
        _pos = 1;
        _posVersuche++;
        Communications.makeWebRequest(
            Config.baseUrl() + "/api/devices/position",
            { "lat" => deg[0], "lon" => deg[1] },
            {
                :method => Communications.HTTP_REQUEST_METHOD_POST,
                :headers => { "X-Device-Token" => token,
                              "Content-Type" => Communications.REQUEST_CONTENT_TYPE_JSON },
                :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON
            },
            new Lang.Method(PhoneRec, :onPos));
    }

    function onPos(responseCode as Lang.Number, data as Lang.Dictionary or Lang.String or PersistedContent.Iterator or Null) as Void {
        // 4xx (Token weg, Position abgelehnt): nicht wiederholen. Netzfehler/5xx: beim naechsten Fix nochmal.
        _pos = (responseCode >= 200 && responseCode < 500) ? 2 : 0;
    }
}
