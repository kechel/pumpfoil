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
