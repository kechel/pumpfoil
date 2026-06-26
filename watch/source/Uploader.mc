using Toybox.Communications;
using Toybox.Application.Storage;
using Toybox.StringUtil;
using Toybox.System;
using Toybox.Lang;
using Toybox.PersistedContent;

// Robuster Multi-Session-Sync der gepufferten Roh-Sessions an den Server.
//
// Eigenschaften:
//  - merkt sich alle noch nicht vollständig hochgeladenen Sessions ("sessions"-Index)
//    und holt sie später nach (Verbindungen brechen ab / fehlen) — idempotent.
//  - lädt pro Session nur die noch fehlenden Chunks (Wasserstand sa_/sg_), löscht jeden
//    Chunk erst NACH Server-Bestätigung -> kein Datenverlust.
//  - während die Aufnahme läuft: /analyze (Live-Auswertung, Session bleibt offen);
//    nach Aktivitätsende (state.completed): /complete und danach lokal aufräumen.
//  - gleiche session_uuid => eine Session am Server, kein Duplikat.
//
// Sequentiell (eine Anfrage zur Zeit): Sessions nacheinander, Chunks nacheinander.

typedef WebData as Lang.Dictionary or Lang.String or PersistedContent.Iterator or Null;

module Uploader {

    var _busy = false;
    var _queue = null;
    var _job = null;

    // Fortschritt/Status für die UI (UploadView). Werden vom Job gepflegt.
    var _curSent = 0;            // bestätigte Chunks der aktuellen Session
    var _curTotal = 0;          // Gesamt-Chunks der aktuellen Session
    var _lastError = :none;     // :none | :offline | :auth | :server
    var _sentAny = false;       // mind. ein Chunk in diesem Lauf bestätigt (Aktivitätsnachweis)

    // Anzahl noch nicht vollständig hochgeladener Sessions (für UI-Feedback).
    function pendingCount() as Lang.Number {
        var s = Storage.getValue("sessions");
        return (s instanceof Lang.Array) ? s.size() : 0;
    }

    function isBusy() as Lang.Boolean {
        return _busy;
    }

    // Chunk-Fortschritt der gerade laufenden Session (für Fortschrittsbalken).
    function progressSent() as Lang.Number { return _curSent; }
    function progressTotal() as Lang.Number { return _curTotal; }

    // Letzter Fehlergrund des Sync-Laufs (für klare UI-Meldung statt „hängt").
    function lastError() as Lang.Symbol { return _lastError; }

    // Hat die Uhr aktuell eine Telefon-Verbindung? (Primärer Upload-Pfad.)
    function phoneConnected() as Lang.Boolean {
        return System.getDeviceSettings().phoneConnected;
    }

    // Vom Job gemeldet: Fehler einordnen (negativer Code = Transport/BLE/Netz weg).
    function noteResult(responseCode as Lang.Number) as Void {
        if (responseCode == 200) {
            _lastError = :none;
        } else if (responseCode <= 0) {
            _lastError = :offline;   // BLE/Netz nicht verfügbar, Timeout etc.
        } else if (responseCode == 401 || responseCode == 403) {
            _lastError = :auth;
        } else {
            _lastError = :server;
        }
    }

    // Alle ausstehenden Sessions hochladen (manuell, periodisch, App-Start, Background).
    function syncAll() as Void {
        if (_busy) { return; }
        var sessions = Storage.getValue("sessions");
        if (!(sessions instanceof Lang.Array) || sessions.size() == 0) { return; }
        _queue = [];
        for (var i = 0; i < sessions.size(); i++) { _queue.add(sessions[i]); }
        _busy = true;
        _lastError = :none;
        _sentAny = false;
        _curSent = 0; _curTotal = 0;
        _next();
    }

    // Nächste Session der Warteschlange starten (oder fertig).
    function _next() as Void {
        if (_queue == null || _queue.size() == 0) {
            _busy = false; _queue = null; _job = null;
            return;
        }
        var uuid = _queue[0];
        _queue.remove(uuid);
        _job = new SessionSyncJob(uuid);
        _job.begin();
    }

    // Wird vom Job am Ende (Erfolg, Fehler oder Abbruch) aufgerufen.
    function sessionDone() as Void {
        _next();
    }

    function _toast(msg as Lang.String) as Void {
        System.println(msg);
    }
}

// Sync einer einzelnen Session (Pairing -> Session anmelden -> fehlende Chunks ->
// abschließen/analysieren).
class SessionSyncJob {
    hidden var _uuid as Lang.String;
    hidden var _token as Lang.String;
    hidden var _meta;
    hidden var _accelTotal as Lang.Number = 0;
    hidden var _gpsTotal as Lang.Number = 0;
    hidden var _completed as Lang.Boolean = false;
    hidden var _sa as Lang.Number = 0;   // bestätigte Accel-Chunks
    hidden var _sg as Lang.Number = 0;   // bestätigte GPS-Chunks
    hidden var _phase as Lang.Symbol = :idle;
    hidden var _idx as Lang.Number = 0;
    hidden var _pendingKind = null;      // "accel"/"gps" des gerade gesendeten Chunks
    hidden var _pendingIdx as Lang.Number = 0;

    function initialize(uuid as Lang.String) {
        _uuid = uuid;
        var st = Storage.getValue("state_" + uuid);
        _meta = Storage.getValue("meta_" + uuid);
        _token = Config.getString("deviceToken");
        if (st instanceof Lang.Dictionary) {
            // Robust gegen fehlende/null Keys (z. B. GPS-only-Session ohne accel_chunks):
            // sonst null-Arithmetik in begin() -> Crash schon beim App-Start (Sync).
            _accelTotal = (st["accel_chunks"] instanceof Lang.Number) ? st["accel_chunks"] : 0;
            _gpsTotal = (st["gps_chunks"] instanceof Lang.Number) ? st["gps_chunks"] : 0;
            _completed = (st["completed"] == true);
        }
        var sa = Storage.getValue("sa_" + uuid); _sa = (sa == null) ? 0 : sa;
        var sg = Storage.getValue("sg_" + uuid); _sg = (sg == null) ? 0 : sg;
    }

    hidden function _opts() as Lang.Dictionary {
        return {
            :method => Communications.HTTP_REQUEST_METHOD_POST,
            :headers => {
                "Content-Type" => Communications.REQUEST_CONTENT_TYPE_JSON,
                "X-Device-Token" => _token
            },
            :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON
        };
    }

    hidden function _optsGet() as Lang.Dictionary {
        return {
            :method => Communications.HTTP_REQUEST_METHOD_GET,
            :headers => { "X-Device-Token" => _token },
            :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON
        };
    }

    function begin() as Void {
        if (!(_meta instanceof Lang.Dictionary)) {
            _removeFromIndex();           // kein Meta -> nichts hochzuladen
            Uploader.sessionDone();
            return;
        }
        // Chunk-Fortschritt der aktuellen Session für die UI initialisieren.
        Uploader._curTotal = _accelTotal + _gpsTotal;
        Uploader._curSent = _sa + _sg;
        if (_token == null || _token.equals("")) {
            var code = Config.getString("pairingCode");
            if (code == null || code.equals("")) { Uploader.sessionDone(); return; }
            _phase = :pair;
            Communications.makeWebRequest(
                Config.baseUrl() + "/api/devices/pair",
                { "code" => code },
                {
                    :method => Communications.HTTP_REQUEST_METHOD_POST,
                    :headers => { "Content-Type" => Communications.REQUEST_CONTENT_TYPE_JSON },
                    :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON
                },
                method(:onPair)
            );
            return;
        }
        _checkStatus();
    }

    function onPair(responseCode as Lang.Number, data as WebData) as Void {
        if (responseCode == 200 && data instanceof Lang.Dictionary && data.hasKey("device_token")) {
            _token = data["device_token"] as Lang.String;
            Config.setString("deviceToken", _token);
            _checkStatus();
        } else {
            Uploader.noteResult(responseCode);
            Uploader.sessionDone();   // später erneut
        }
    }

    // Zuerst mit dem Server abgleichen: ist die Session dort schon abgeschlossen?
    // Falls ja (z. B. verlorene /complete-Bestätigung) -> lokal aufräumen statt endlos
    // erneut hochzuladen. Sonst regulär hochladen.
    hidden function _checkStatus() as Void {
        _phase = :status;
        Communications.makeWebRequest(
            Config.baseUrl() + "/api/ingest/session/" + _uuid + "/status",
            {},
            _optsGet(),
            method(:onStatus)
        );
    }

    function onStatus(responseCode as Lang.Number, data as WebData) as Void {
        if (responseCode != 200) {
            Uploader.noteResult(responseCode);   // Server nicht erreichbar -> später erneut
            Uploader.sessionDone();
            return;
        }
        Uploader.noteResult(200);
        if (data instanceof Lang.Dictionary && data["status"] != null
                && (data["status"] as Lang.String).equals("complete")) {
            _cleanup();              // Server hat die Session bereits vollständig -> lokal weg
            Uploader.sessionDone();
            return;
        }
        _startSession();             // noch nicht abgeschlossen -> regulär (weiter)hochladen
    }

    hidden function _startSession() as Void {
        _phase = :start;
        Communications.makeWebRequest(
            Config.baseUrl() + "/api/ingest/session",
            _meta,
            _opts(),
            method(:onStep)
        );
    }

    // Callback für /session und jeden Chunk: bestätigt den vorherigen Chunk, schickt den nächsten.
    function onStep(responseCode as Lang.Number, data as WebData) as Void {
        if (responseCode != 200) {
            Uploader.noteResult(responseCode);
            Uploader.sessionDone(); return;   // Puffer bleibt -> später fortsetzen
        }
        Uploader.noteResult(200);
        if (_pendingKind != null) {
            if (_pendingKind.equals("accel")) {
                Storage.deleteValue("ca_" + _uuid + "_" + _pendingIdx);
                _sa = _pendingIdx + 1; Storage.setValue("sa_" + _uuid, _sa);
            } else {
                Storage.deleteValue("cg_" + _uuid + "_" + _pendingIdx);
                _sg = _pendingIdx + 1; Storage.setValue("sg_" + _uuid, _sg);
            }
            _pendingKind = null;
            Uploader._curSent = _sa + _sg;   // Fortschritt für die UI
            Uploader._sentAny = true;
        }
        _advance();
    }

    // Schickt den nächsten fehlenden Chunk; überspringt bereits gelöschte; sonst abschließen.
    hidden function _advance() as Void {
        if (_phase == :start) { _phase = :accel; _idx = _sa; }
        if (_phase == :accel) {
            while (_idx < _accelTotal) {
                var bytes = Storage.getValue("ca_" + _uuid + "_" + _idx);
                if (bytes == null) {
                    _sa = _idx + 1; Storage.setValue("sa_" + _uuid, _sa); _idx++; continue;
                }
                _sendAccel(_idx, bytes); return;
            }
            _phase = :gps; _idx = _sg;
        }
        if (_phase == :gps) {
            while (_idx < _gpsTotal) {
                var gdata = Storage.getValue("cg_" + _uuid + "_" + _idx);
                if (gdata == null) {
                    _sg = _idx + 1; Storage.setValue("sg_" + _uuid, _sg); _idx++; continue;
                }
                _sendGps(_idx, gdata); return;
            }
            _phase = :final;
        }
        if (_phase == :final) { _finalize(); }
    }

    hidden function _sendAccel(i as Lang.Number, bytes as Lang.ByteArray) as Void {
        _pendingKind = "accel"; _pendingIdx = i; _idx = i + 1;
        var b64 = StringUtil.convertEncodedString(bytes, {
            :fromRepresentation => StringUtil.REPRESENTATION_BYTE_ARRAY,
            :toRepresentation => StringUtil.REPRESENTATION_STRING_BASE64
        });
        Communications.makeWebRequest(
            Config.baseUrl() + "/api/ingest/session/" + _uuid + "/chunk",
            { "index" => i, "kind" => "accel", "encoding" => "int16-b64", "data" => b64 },
            _opts(),
            method(:onStep)
        );
    }

    hidden function _sendGps(i as Lang.Number, gdata) as Void {
        _pendingKind = "gps"; _pendingIdx = i; _idx = i + 1;
        Communications.makeWebRequest(
            Config.baseUrl() + "/api/ingest/session/" + _uuid + "/chunk",
            { "index" => i, "kind" => "gps", "encoding" => "json", "data" => gdata },
            _opts(),
            method(:onStep)
        );
    }

    hidden function _finalize() as Void {
        if (_completed) {
            _phase = :complete;
            Communications.makeWebRequest(
                Config.baseUrl() + "/api/ingest/session/" + _uuid + "/complete",
                { "total_chunks" => _gpsTotal },
                _opts(),
                method(:onFinal)
            );
        } else {
            _phase = :analyze;
            Communications.makeWebRequest(
                Config.baseUrl() + "/api/ingest/session/" + _uuid + "/analyze",
                {},
                _opts(),
                method(:onFinal)
            );
        }
    }

    function onFinal(responseCode as Lang.Number, data as WebData) as Void {
        Uploader.noteResult(responseCode);
        if (responseCode == 200 && _completed) {
            _cleanup();   // abgeschlossen + vollständig -> lokal aufräumen
        }
        Uploader.sessionDone();
    }

    // Session lokal vollständig entfernen (nur nach bestätigtem /complete).
    hidden function _cleanup() as Void {
        for (var i = 0; i < _accelTotal; i++) { Storage.deleteValue("ca_" + _uuid + "_" + i); }
        for (var i = 0; i < _gpsTotal; i++) { Storage.deleteValue("cg_" + _uuid + "_" + i); }
        Storage.deleteValue("state_" + _uuid);
        Storage.deleteValue("meta_" + _uuid);
        Storage.deleteValue("sa_" + _uuid);
        Storage.deleteValue("sg_" + _uuid);
        _removeFromIndex();
    }

    hidden function _removeFromIndex() as Void {
        var arr = Storage.getValue("sessions");
        if (arr instanceof Lang.Array) {
            arr.remove(_uuid);
            Storage.setValue("sessions", arr);
        }
    }
}

