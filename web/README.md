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
Open http://localhost:3000, paste one or more book URLs (one per line) and your
archive.org credentials. Multiple URLs are downloaded in one job and bundled
into a single `books.zip`.

`PYTHON_BIN` defaults to `python3` if unset. Credentials are sent to the local
server per request, used only to run the download, and never stored.

## Run (Docker)
From the repo root:
```sh
cp .env.example .env   # optional: set a default archive.org account
docker compose up -d --build
```
Serves on http://localhost:8788 (Python + modules baked into the image).

### Default account
Set `ARCHIVE_EMAIL` / `ARCHIVE_PASSWORD` in `.env` to configure a default
archive.org account. Visitors can then leave the login fields blank; anyone
entering their own credentials overrides the default for that request. Secrets
are read at runtime and never baked into the image or committed (`.env` is
git-ignored).

## Test
```sh
npm test
../.venv/bin/python worker.py --selftest   # or: python3 worker.py --selftest
```
