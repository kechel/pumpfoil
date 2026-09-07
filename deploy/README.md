# Deployment

`pumpfoil.org` → Apache-Reverse-Proxy (the reverse proxy) → VM `app-host:8090` (FastAPI).

## 1. Apache (auf the reverse proxy)
```bash
sudo cp pumpfoil.org.conf /etc/apache2/sites-available/
sudo a2ensite pumpfoil.org
sudo systemctl reload apache2
sudo certbot --apache -d pumpfoil.org   # erzeugt pumpfoil.org-le-ssl.conf
# danach den Proxy-Block aus pumpfoil.org-le-ssl.conf (in diesem Repo) übernehmen
sudo systemctl reload apache2
```
BasicAuth-Gate (optional, Pre-Public) ist in der SSL-Conf vorbereitet (auskommentiert).

## 2. Postgres (auf VM app-host)
```bash
sudo -u postgres createuser foil --pwprompt
sudo -u postgres createdb foil -O foil
```

## 3. Server (auf VM app-host)
```bash
sudo mkdir -p /opt/foil && sudo chown foil /opt/foil
git clone <repo> /opt/foil          # oder rsync des server/-Verzeichnisses
cd /opt/foil/server
python3 -m venv .venv && . .venv/bin/activate
pip install -e ".[postgres,ml]"   # ml = scipy/scikit-learn für Pump-Modell
cp .env.example .env
#   DATABASE_URL=postgresql+psycopg://foil:<pw>@localhost:5432/foil
#   JWT_SECRET=<langes zufälliges Secret>
#   WEB_DIST=/opt/foil/web/dist
sudo cp ../deploy/foil-server.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now foil-server
```

## 4. Frontend bauen
```bash
cd web && npm install && npm run build   # erzeugt web/dist (vom Server ausgeliefert)
```

## Smoke-Test
```bash
curl -s https://pumpfoil.org/api/health        # {"status":"ok"}
```

## Neustart ohne Ausfall — Stand und Plan

**Gemessen am 07.09.2026:** ein `systemctl restart foil-server` macht den Port **1,66 s lang
„connection refused"**. Nachmessen mit `python3 scripts/restart-ausfall-messen.py --restart`
(unterscheidet „abgewiesen" von „wartet" — das ist der Unterschied zwischen 502 und Verzögerung).

### Schritt 0 — auf der Proxy-VM, grösster Hebel, kleinste Änderung

Die Vorlage `pumpfoil.org-le-ssl.conf` hat ein nacktes `ProxyPass` **ohne `retry=`**. Der
mod_proxy-Standard ist **60 Sekunden**: scheitert der Verbindungsaufbau EIN Mal, gilt der Backend-
Worker als defekt und Apache antwortet bis zu eine Minute mit 503, *ohne* es erneut zu versuchen.
Unsere 1,66-Sekunden-Lücke kann beim Nutzer also als bis zu 60 s Ausfall ankommen. Deshalb:

```apache
ProxyPass         /  http://app-host:8090/ retry=0 connectiontimeout=2 timeout=300
```

`retry=0` heisst „immer wieder versuchen, keine Sperrzeit". **Auf der Proxy-VM zu prüfen und zu
setzen** — von der App-VM aus ist sie nicht erreichbar. Ohne diesen Schritt bringen die folgenden
nur die Hälfte.

### Schritt 1 — Socket-Aktivierung (auf dieser VM, klein und reversibel)

`foil-server.socket` in diesem Verzeichnis: der lauschende Socket gehört systemd, nicht dem
Prozess. Beim Neustart bleibt er offen, der Kernel nimmt Verbindungen an und legt sie in die
Accept-Queue. **Aus Ausfall wird Wartezeit.** Installation steht als Kommentar in der Datei; dazu
in `foil-server.service` `--host 0.0.0.0 --port 8090` durch `--fd 3` ersetzen und
`Requires=`/`After=foil-server.socket` ergänzen.

Eine Nebenwirkung, die man kennen muss: die Wartezeit ist so lang wie das Herunterfahren des
alten Prozesses. `--timeout-graceful-shutdown 300` würde eine hängende Anfrage also fünf Minuten
lang zur Warteschlange für ALLE machen. Mit Socket-Aktivierung deshalb **auf 15 s senken** —
Chunk-Uploads sind Millisekunden, und lange Läufe gehören nicht in einen HTTP-Request.

### Schritt 2 — Blau/Grün, falls auch die Wartezeit weg soll

Zwei Instanzen, beide am selben Port (`ReusePort=true` ist in der Socket-Datei schon gesetzt):
neue starten, Gesundheit prüfen, alte stoppen. Die alte bedient ihre laufenden Anfragen zu Ende,
die neue nimmt alles Neue — **keine abgewiesene Verbindung und keine Wartezeit.** Speicher reicht
locker (der Dienst braucht 918 MB, frei sind 24 GB).

Der Haken, den man dabei kennen muss: mit `SO_REUSEPORT` verteilt der Kernel neue Verbindungen
auf beide lauschenden Sockets, **sobald der Socket existiert** — also schon bevor die neue
Instanz ihre App importiert hat. Ohne Gegenmaßnahme warten ~50 % der Verbindungen ~1,5 s auf eine
Instanz, die noch startet. Zwei Wege daraus:

* **lokaler Proxy** (nginx/HAProxy auf 8090, Instanzen auf 8091/8092): Bereitschaft lässt sich je
  Instanz eindeutig prüfen, das Umschalten ist ein `reload`. Sauber, kostet eine Komponente mehr
  auf dem Weg — aktuell ist keiner davon installiert.
* **Socket erst spät erzeugen**: die neue Instanz ohne Socket-Aktivierung auf einem privaten Port
  starten, Gesundheit prüfen, und erst dann per `systemctl start foil-server@gruen.socket` in den
  gemeinsamen Port aufnehmen. Kein neues Paket, aber mehr Eigenbau im Umschalt-Skript.

**Noch nicht entschieden** — Schritt 0 und 1 sind unabhängig davon sofort nützlich.

## systemd-Timer (oneshot) — auf der App-VM

> ⚠️ **Pfad/User-Realität:** Die `.service`-Templates in diesem Ordner nennen historisch
> `/opt/foil` / `User=foil`. Die **aktuell live laufende App-VM** nutzt aber
> `/home/jan/garmin-connect-iq` / `User=jan` (siehe `systemctl cat foil-server`). Beim
> **Server-Umzug** in ALLEN `foil-*.service` die Pfade + `User` an das Zielsystem anpassen,
> nach `/etc/systemd/system/` kopieren, `daemon-reload`, dann die Timer `enable --now`.

Aktive Timer (`systemctl list-timers | grep foil`):
- **foil-server.service** — die App selbst (uvicorn :8090, 4 Worker), kein Timer.
- **foil-backup-latest.timer** (täglich 03:30) → `backup-latest.sh`: voller `pg_dump` (custom) +
  `rsync` von `data/` und `media/` als Hardlinks nach `$BACKUP_BASE/latest-backup`.
- **foil-backup-snapshot.timer** (Mi 04:00) → permanenter Hardlink-Snapshot.
- **foil-db-backup.timer** → zusätzlicher rotierender `pg_dump` (`scripts.backup_db`).
- **foil-records.timer** (täglich **03:15**, vor dem Backup) → `record_snapshot.py`: Community-
  Rekorde snapshotten, echte Verbesserungen in `record_events` loggen + Push. Installieren:
  ```bash
  sudo cp deploy/foil-records.{service,timer} /etc/systemd/system/
  sudo systemctl daemon-reload && sudo systemctl enable --now foil-records.timer
  ```

## Was wird gesichert? (Vollständigkeit)

Nichts geht verloren, wenn **DB + `data/` + `media/`** gesichert sind — genau das tut
`backup-latest.sh`:
- **Postgres** (`pg_dump --format=custom`, OHNE Tabellenfilter) → **alle** Tabellen automatisch,
  inkl. künftig neu hinzukommender (z. B. `record_snapshots`/`record_events`). Kein Pflegeaufwand
  pro Tabelle.
- **`data/`** (`DATA_DIR`) → die **Roh-Aufnahmen** jeder Session (GPS-JSON + int16-Accel je
  `session_uuid`). Beim FIT-Import wird die `.fit` NICHT aufgehoben, sondern direkt in dieses
  Roh-Format geparst → das Original muss nicht gesichert werden, die Daten liegen in `data/`.
- **`media/`** (`MEDIA_DIR`) → alle **Bilder** (Session-Fotos + Profilbilder als `.webp`).

Es gibt **keinen weiteren Ablageort** außerhalb von DB/`data/`/`media/`.
