"""Schnappschuss des Setups beim Anlegen einer Session.

Warum es das gibt: `sessions.stab_id/board_id/mast_len_cm/shim_deg` waren beim Anlegen immer
NULL, und NULL heisst „Standard des Nutzers" — aufgeloest erst beim LESEN gegen
`users.settings_json` (`api/sessions._resolve_setup`). Damit wirkte der Stern im Profil
RUECKWIRKEND: wer seinen Standard-Stab wechselte, sah den neuen Stab in seiner ganzen Historie.
Gemeldet von einem Nutzer am 10.09.2026, bestaetigt an seinen Daten (er hat 17 Sessions per Hand
repariert). Unsere eigene UI verspricht das Gegenteil: „The star marks the default FOR NEW
SESSIONS" (`setup.mastDesc`).

Das Foil machte es schon richtig (`api/ingest` schreibt `foil_id` beim Anmelden fest). Dieses
Modul zieht die restlichen vier Felder auf dasselbe Muster nach — EIN Ort, damit die drei
Anlege-Wege (Uhr-Upload, Datei-Import, Zusammenfuehren) nicht auseinanderlaufen.

Der BESTAND bleibt bewusst NULL (Jan, 10.09.): den heutigen Standard nachtraeglich
hineinzuschreiben wuerde eine Angabe einfrieren, die fuer die meisten alten Sessions sachlich
falsch ist. Unbeschriftet ist besser als falsch beschriftet; wer will, traegt nach.
"""
from __future__ import annotations

import json

from . import models

# Genau die Felder, die `_resolve_setup` sonst beim Lesen erbt. `foil_id` steht NICHT hier —
# das setzen die Aufrufer selbst (die Uhr darf es je Session ueberschreiben).
FELDER = ("stab_id", "board_id", "mast_len_cm", "shim_deg")


def standard_setup(db, user: models.User | None) -> dict:
    """Standard-Setup des Nutzers als Feld->Wert-Abbildung, direkt in `models.Session(**…)`
    einsetzbar. Fehlende oder ungueltige Werte fehlen im Ergebnis (bleiben also NULL).

    Ids werden gegen den Katalog geprueft — wie beim Foil (`db.get(models.Foil, …) is not None`),
    damit ein Standard, der auf eine geloeschte Zeile zeigt, keine kaputte Referenz einfriert.
    """
    if user is None or not user.settings_json:
        return {}
    try:
        st = json.loads(user.settings_json) or {}
    except ValueError:
        return {}

    out: dict = {}
    sid = st.get("stab_id")
    if sid is not None and db.get(models.Stab, int(sid)) is not None:
        out["stab_id"] = int(sid)
    bid = st.get("board_id")
    if bid is not None and db.get(models.Board, int(bid)) is not None:
        out["board_id"] = int(bid)
    mast = st.get("mast_len_cm")
    if mast is not None:
        try:
            out["mast_len_cm"] = int(mast)
        except (TypeError, ValueError):
            pass
    shim = st.get("shim_deg")
    if shim is not None:            # 0.0 ist ein gueltiger Wert -> nur auf None pruefen
        try:
            out["shim_deg"] = float(shim)
        except (TypeError, ValueError):
            pass
    return out


def uebernehmen(quelle: models.Session) -> dict:
    """Setup einer bestehenden Session uebernehmen (Zusammenfuehren) — ohne Umweg ueber die
    Nutzer-Einstellungen, sonst bekaeme die zusammengefuehrte Session den HEUTIGEN Standard
    statt des Setups der Teile."""
    out = {}
    for f in FELDER:
        v = getattr(quelle, f, None)
        if v is not None:
            out[f] = v
    return out
