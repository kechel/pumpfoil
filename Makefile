# Pump-Foil-Tracker — Entwickler-Shortcuts
.PHONY: help server-venv server-dev server-test web-install web-dev web-build watch-sdk all-test

help:
	@echo "Targets:"
	@echo "  server-venv   venv anlegen + Server-Deps (inkl. dev,ml) installieren"
	@echo "  server-dev    FastAPI mit Reload auf :8000 (Web-Vite proxyt hierher)"
	@echo "  server-test   pytest"
	@echo "  web-install   npm install"
	@echo "  web-dev       Vite-Dev-Server auf :8090 (proxyt /api -> :8000)"
	@echo "  web-build     Produktions-Build nach web/dist"
	@echo "  watch-sdk     Connect IQ SDK + Dev-Key holen (setup-sdk.sh)"
	@echo "  all-test      Server-Tests + Web-Build"

server-venv:
	cd server && python3 -m venv .venv && . .venv/bin/activate && pip install -e ".[dev,ml]"

server-dev:
	cd server && . .venv/bin/activate && uvicorn app.main:app --reload --port 8000

server-test:
	cd server && . .venv/bin/activate && python -m pytest -q -p no:warnings

web-install:
	cd web && npm install

web-dev:
	cd web && npm run dev

web-build:
	cd web && npm run build

watch-sdk:
	cd watch && ./setup-sdk.sh

all-test: server-test web-build
