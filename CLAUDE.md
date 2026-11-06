# PumpFoil — Arbeitsregeln für Claude

Multi-Plattform-Pumpfoil-Tracker (FastAPI + Postgres, Web-PWA, Garmin/Wear/Apple/Huawei/Zepp/Suunto-Recorder,
Android/iOS-Apps), ~200 aktive Nutzer, Repo **öffentlich** (AGPL). Die ausführliche Projektübersicht steht in
`docs/PROJEKT.md` (bis 06.11.2026 war sie diese Datei); alles Weitere findet der Projekt-Atlas.

## Erst nachschlagen, dann handeln

**Sobald ein Thema aufkommt, das nicht schon im Kontext steht** (z. B. „Icons für Teams“, „Garmin-Release“,
„Backup“, „Polar-Import“), zuerst:

    scripts/kontext.py <stichpunkt>, <stichpunkt>, ...

Das durchsucht Memories, Skills, `docs/`, READMEs, Code-Verzeichnisse (Symbole je Datei, API-Routen,
Web-Seiten, Env-Variablen, UI-Texte), den Git-Verlauf und die SDK-Dokus (Connect IQ, Garmin Connect API,
SuuntoPlus). Es findet Wortanfänge, ähnliche Schreibweisen und — per Vektor — Bedeutungsverwandtes über
Deutsch/Englisch hinweg. Ausgabe ist eine **Übersicht je Quelle mit Treffer-Nummern**; Volltext nur für die
Treffer, die zählen: `scripts/kontext.py --voll <nr>,<nr>`. Weitere Schalter: `--quelle memory,repo`,
`--bis YYYY-MM-DD` (Stand zu einem Stichtag), `--mehr 3`. Danach gezielt Dateien lesen bzw. grep.

Der Index baut sich bei jedem Sitzungsstart selbst nach (`.claude/settings.json`, Hook auf
`scripts/atlas/bauen.py`); er liegt außerhalb des Repos (`~/pumpfoil-atlas/`), weil Memories Nutzer nennen.
**Neues Wissen gehört in eine Memory oder einen Doku-Absatz** — nie nur in die Antwort; dann findet es der
Atlas beim nächsten Start.

## Was immer gilt (ohne Stichwort)

- **Repo öffentlich:** keine Nutzernamen, Nutzerdaten, Geheimnisse in Code, Doku oder Commit-Nachrichten.
  Datenleck-Sperre (pre-commit + CI) **nie** mit `--no-verify` umgehen. Nach jedem Commit `git push`.
- **Nichts Unumkehrbares ungefragt:** nie ungefragt in die DB schreiben, nichts löschen/überschreiben
  (`rm`, `rsync --delete` …) ohne Jans OK. `server/data` + `server/media` sind mit den Backups hardgelinkt →
  neu schreiben und tauschen, nie an Ort und Stelle. „Schreib ein Skript“ heißt nur schreiben.
- **Nie öffentlich oder als Jan posten** (Banner, Social, GitHub, öffentliche Chats): nur Entwürfe. Antworten
  an Nutzer nur über das eigene Konto (id 230), nach Vorlage.
- **Alte App-Versionen sind im Feld:** Server-Änderungen bleiben abwärtskompatibel zu allen Uhren-/App-
  Fassungen, die noch hochladen. Uhren-Apps nicht ausbauen, nur Fehler beheben.
- **Qualität vor Tempo:** lange Testläufe vor jeder Einreichung, gegen die Vorfassung mit Zahlen vergleichen,
  Server-Daten prüfen statt Bildschirm, Vermutungen als Vermutungen kennzeichnen. Analyse-Pipeline
  (`server/app/analysis/`) nur mit Jans OK ändern.
- **Netz:** diese VM erreicht `pumpfoil.org` nicht — immer `curl http://localhost:8090/...`.
  `sudo systemctl restart foil-server` darf ich jederzeit (nach `server/`-Änderungen nötig, nach Import-Check).
- **Bauen:** Web und Garmin baue und deploye ich (`watch/bin` ist live → erst nach Store-Freigabe), Android/
  Wear nur kompilieren; signieren, iOS/Apple-Watch-Builds und Store-Uploads macht Jan. Nicht jedes Mal
  wiederholen. Versionen erst beim Release bumpen.
- **Tanz-App:** Code fließt nur `watch/` → `watch-dance/`, nie umgekehrt.
- **Stil:** Jan ist ITler — knapp und technisch, deutsch. Ein Befehl pro Code-Box.
