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
