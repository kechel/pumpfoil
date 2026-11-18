# Sprint-Genauigkeit: Versuche mit gleichzeitigen Aufnahmen (17.11.2026)

Rein lesend. Frage: Wie bekommen wir fliegende 100 m / 60 s genauer als „Uhr-Tempo integrieren“?
Ergebnis und Empfehlung: `docs/TODO.md`, Abschnitt C2 (Unterpunkt „Sprint-Genauigkeit, Versuche“).

Aufruf aus `server/` (mit `DATABASE_URL` im Env), Ausgaben ins Scratchpad:

    .venv/bin/python ../scripts/sprint-genauigkeit/bauen.py /tmp/.../daten.pkl
    .venv/bin/python ../scripts/sprint-genauigkeit/versuch.py daten.pkl erg.pkl [methode,methode,...]
    .venv/bin/python ../scripts/sprint-genauigkeit/tabelle.py erg.pkl ["" | uhr-uhr | brett] [methoden fuer Bootstrap]
    .venv/bin/python ../scripts/sprint-genauigkeit/alle_fenster.py ../scripts/sprint-genauigkeit daten.pkl dop,mix50p5,...
    .venv/bin/python ../scripts/sprint-genauigkeit/hut.py ../scripts/sprint-genauigkeit daten.pkl dop,mix50p5,...
    .venv/bin/python ../scripts/sprint-genauigkeit/brett_ref.py ../scripts/sprint-genauigkeit daten.pkl dop,mix50p5,...

- `bauen.py` — Paare gleichzeitiger Aufnahmen desselben Fahrers (versch. Geraete), Zeitabgleich per Kreuzkorrelation des
  Uhr-Tempos (0,1 s, +-8 s). Raus: derselbe GPS-Chip zweimal (mittlerer Abstand < 1,5 m, z. B. App + native
  Garmin-Aktivitaet), nicht zusammen gefahren (> 15 m), Korrelation < 0,45.
- `versuch.py` — die Schaetzer (Uhr-Tempo roh/geglaettet, Positionen roh/geglaettet, Spline, Kalman/RTS, Mischungen,
  adaptive Gewichte) und die Fenstersuche; Metriken „Bestwert“ und „gleiches Fenster“.
- `alle_fenster.py` — alle nicht ueberlappenden 100-m-/60-s-Fenster je gemeinsamem Lauf, Cluster-Bootstrap je
  Aufnahme-Paar, Niveau je Plattform.
- `hut.py` — Fehler je Geraeteklasse aus dem Paar-Netz (verallgemeinerter Three-Cornered Hat, NNLS).
- `brett_ref.py` — Uhr gegen Handy am Brett (Niveau-Referenz; das Brett schwingt nicht mit dem Arm).

FALLE: Uebereinstimmung allein belohnt Verfahren, die alle Werte schrumpfen (starke Glaettung). Immer das Niveau
mitpruefen (`alle_fenster.py` je Plattform, `brett_ref.py`).

Trockenlauf VERSION-7-Kandidat (18.11.2026, rein lesend):

- `v7.py` — patcht `app.analysis.sprint.lauf_sprints` (Mischung im Fensterzaehler, alle V6-Regeln bleiben); `CFG["W"]`.
- `paar_v7.py <ordner mit daten.pkl>` — Produktivform auf den Paar-Daten, inkl. V7a (Apple bleibt Uhr-Tempo).
- `trocken_alle.py out.jsonl` + `alle_ausw.py out.jsonl` — alle Sessions V6 vs. V7 je Plattform (ueber `mit_env`, volle `.env`).
- `event_v7.py <event-id> ...` — Event-Ranglisten gespeichert / V6 frisch / V7 / V7a (Cache aus, rollback).
- `guete.py` — GPS-Guete je Lauf aus einem Geraet (Zittern, Tempo-Unruhe, abw_10s); `guete_paare.py <ordner>` prueft sie gegen den Paar-Fehler und fittet sigma ~ c x abw; `guete_event.py <ordner>` Guete der Bestlaeufe je Event-Fahrer (braucht event_v7.json); `paar_kombi.py <ordner>` V6/V7 je Geraetekombination.
