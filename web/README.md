# Archive.org Downloader — Web UI

Local web wrapper around `../archive-org-downloader.py`.

## Requirements
- Node 18+ and npm
- Python 3 with the project's modules installed (`pip install -r ../requirements.txt`),
  e.g. the repo `.venv`.

## Run (dev)
```sh
cd web
npm install
PYTHON_BIN=../.venv/bin/python npm run dev   # point PYTHON_BIN at a python that has the modules
```
Open http://localhost:3000, paste a book URL and your archive.org credentials.

`PYTHON_BIN` defaults to `python3` if unset. Credentials are sent to the local
server per request, used only to run the download, and never stored.

## Run (Docker)
From the repo root:
```sh
docker compose up -d --build
```
Serves on http://localhost:8788 (Python + modules baked into the image).

## Test
```sh
npm test
../.venv/bin/python worker.py --selftest   # or: python3 worker.py --selftest
```
