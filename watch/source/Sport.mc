using Toybox.Lang;

// Sportart vor dem Start auf der Uhr waehlen (19.10.2026), Muster wie die Foil-Wahl.
//
// Server-Vertrag: GET /api/devices/config mit `sp=1` liefert zusaetzlich `sports` = bis zu 6
// Eintraege {id, name}, der Profil-Standard ZUERST (ohne `sp=1` fehlt der Key). Beim Upload geht
// die gewaehlte ID als `sport_class` mit /ingest/session raus — NUR wenn es eine Wahl gab (Liste
// mit mehr als einem Eintrag); der Server nimmt das als eigene Einordnung des Nutzers und
// ignoriert unbekannte IDs. `sport_class` steht in der Session-Meta (meta_<uuid>), damit auch
// ein spaeter fortgesetzter Upload sie mitschickt — genau wie foil_id.
//
// NUR im VOLL-Build (`(:layouts)`, >= 512 KB). LITE (96 KB) und ENG (128 KB) bekommen den
// Stub unten: kein `sp=1`, keine Liste, kein Menuepunkt, keine Anzeige. Bewusst ein eigenes
// Modul statt Felder/Methoden in SessionRecorder: die ENG-Stufe steht dort schon am Limit von
// 253 Instanz-Mitgliedern je Klasse (monkeyc bricht sonst ab). Die Namen kommen englisch vom
// Server und werden nicht uebersetzt.
(:layouts)
module Sport {
    var liste = [] as Lang.Array<Lang.Dictionary>;   // [{id, name}], hoechstens 6
    var id = null as Lang.String or Null;            // gewaehlte ID; null = keine Wahl -> kein sport_class
    var _gewaehlt = false;                           // eigene Wahl in diesem App-Lauf

    function param(p) as Void { p["sp"] = "1"; }

    // Liste uebernehmen: nur id + Name (gekuerzt), hoechstens 6 Eintraege; was nicht passt, wird
    // verworfen — lieber keine Wahl als ein Absturz. Vorauswahl = erster Eintrag (Profil-
    // Standard), ausser der Nutzer hat in diesem App-Lauf selbst gewaehlt und die Wahl steht noch
    // in der Liste. Rueckgabe: die bereinigte Liste (zum Cachen) oder null, wenn `arr` keine war.
    function setze(arr) {
        if (!(arr instanceof Lang.Array)) { return null; }
        var out = [] as Lang.Array<Lang.Dictionary>;
        for (var i = 0; i < arr.size() && out.size() < 6; i++) {
            var e = arr[i];
            if (e instanceof Lang.Dictionary && e["id"] instanceof Lang.String
                    && e["name"] instanceof Lang.String) {
                var n = e["name"] as Lang.String;
                if (n.length() > 24) { n = n.substring(0, 24); }
                out.add({ "id" => e["id"], "name" => n });
            }
        }
        liste = out;
        if (out.size() < 2) {
            id = null;
        } else if (!_gewaehlt || index() < 0) {
            id = out[0]["id"] as Lang.String;
        }
        return out;
    }

    // Gibt es eine Wahl? (Menuepunkt, Anzeige und sport_class nur dann.)
    function wahl() as Lang.Boolean { return liste.size() > 1; }

    // Position der gewaehlten ID in der Liste, -1 wenn nicht drin.
    function index() as Lang.Number {
        if (id == null) { return -1; }
        for (var i = 0; i < liste.size(); i++) {
            if ((liste[i]["id"] as Lang.String).equals(id)) { return i; }
        }
        return -1;
    }

    function name() as Lang.String {
        var i = index();
        return (i >= 0) ? (liste[i]["name"] as Lang.String) : "-";
    }

    function waehle(i) as Void {
        if (!(i instanceof Lang.Number) || i < 0 || i >= liste.size()) { return; }
        id = liste[i]["id"] as Lang.String;
        _gewaehlt = true;
    }

    // In die Session-Meta (geht beim Upload mit /ingest/session raus, auch beim Fortsetzen).
    function meta(m) as Void {
        if (id != null && wahl()) { m["sport_class"] = id; }
    }
}

// LITE/ENG: Sportart-Wahl gibt es dort nicht (Speicher). Nur die Aufrufe aus dem gemeinsamen Code.
(:nolayouts)
module Sport {
    function param(p) as Void { }
    function meta(m) as Void { }
    function wahl() as Lang.Boolean { return false; }
}
