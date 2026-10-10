# Web App for Archive.org-Downloader — Design

Date: 2026-10-10

## Purpose

Wrap the functionality of `archive-org-downloader.py` in a browser UI so a book
can be downloaded without using the command line. Scope agreed with the user:

- **Local / self-host** single-user tool. No multi-user isolation, no auth, no
  abuse hardening.
- **Reuse the existing Python** download logic. Do not reimplement the AES-CTR
  image deobfuscation or PDF assembly.
- **Browser download** of the result (not a server directory).

Success = paste a book URL + archive.org credentials in a web form, watch live
progress, and have the PDF (or a ZIP of JPGs) download in the browser, with the
same output quality as the CLI.

## Architecture

Single Next.js server (App Router, TypeScript). Python is invoked on demand as
a short-lived worker subprocess per download job. No FastAPI, no second
always-on process, no CORS, no database.

```
archive-org-downloader.py          # UNCHANGED — loaded by path, functions reused
web/
  worker.py                        # one book; reuses script fns; emits JSON progress on stdout
  app/
    page.tsx                       # form + live progress UI
    api/download/route.ts          # POST → spawn worker → relay progress as SSE
    api/file/[id]/route.ts         # GET → stream the finished file as attachment, then delete
  lib/jobs.ts                      # temp-dir + job-id helpers
  package.json, tsconfig.json, next.config.*
```

The existing `archive-org-downloader.py` is left untouched. `worker.py` loads it
by path with `importlib.util.spec_from_file_location` (its hyphenated filename
is not a normal import) and calls its functions directly.

## Data flow

1. Browser submits the form to `POST /api/download` (JSON body: url, email,
   password, resolution, format, includeMeta, printDisabled).
2. The route generates a random job id, spawns `python worker.py` with options
   as argv and **credentials passed via environment variables** (never argv, so
   they do not appear in the process list), and sets the output temp dir to a
   per-job folder under the OS temp dir.
3. `worker.py` emits one JSON object per line on stdout as it progresses.
4. The route reads worker stdout, splits on newlines (buffering partial lines
   across chunk boundaries), and relays each event to the browser as an SSE
   `data:` message.
5. On success the worker writes the file into the job folder and emits
   `done {id, filename}`. The UI then navigates/fetches `GET /api/file/<id>`,
   which streams the file as a download attachment and deletes the job folder
   afterward.
6. On any failure the worker emits `error {message}` and exits non-zero; the
   route relays it and the UI shows the message.

## Components

### worker.py
- Input: argv options + `ARCHIVE_EMAIL` / `ARCHIVE_PASSWORD` env vars + output
  dir.
- Reuses from the script: `login`, `loan`, `get_book_infos`,
  `download_one_image`, `deobfuscate_image` (via `download_one_image`),
  `return_loan`, and `img2pdf` for PDF assembly.
- Replaces only the CLI orchestration loop so it can report per-page progress:
  after `get_book_infos` returns N links, it submits `download_one_image` tasks
  to a `ThreadPoolExecutor` and emits a `page` event as each future completes.
- The script's own `print()` output and `exit()`/`SystemExit` (it calls
  `exit()` on errors such as bad login) are redirected/caught so that **stdout
  carries only JSON**: library/script chatter is routed to stderr, and
  `SystemExit`/exceptions are converted into an `error` event.
- Output format:
  - `pdf` (default): assemble downloaded JPGs with `img2pdf` (carrying the same
    PDF metadata the CLI sets), write `<title>.pdf`.
  - `jpg`: zip the downloaded JPGs into `<title>.zip` using Python's stdlib
    `zipfile` (no JS zip dependency).
  - `includeMeta`: also place `metadata.json` in the job folder; for `jpg` it is
    added to the ZIP, for `pdf` it is ignored (matches CLI, where `-m` needs
    `-j`).

### Progress event contract (one JSON object per stdout line)
- `{"event":"login"}` — logging in.
- `{"event":"info","pages":N,"title":"..."}` — book resolved.
- `{"event":"page","done":k,"total":N}` — a page finished downloading.
- `{"event":"building"}` — assembling PDF/ZIP.
- `{"event":"done","id":"<jobId>","filename":"..."}` — file ready.
- `{"event":"error","message":"..."}` — failure; worker exits non-zero.

### app/api/download/route.ts
- POST handler returning a `text/event-stream` `Response`.
- Validates body: URL must start with `https://archive.org/details/`; email,
  password, resolution present; resolution in 0–10.
- Spawns the worker, relays stdout JSON as SSE events, forwards `error` events,
  and closes the stream when the worker exits.
- Kills the worker if the client disconnects (request abort signal).

### app/api/file/[id]/route.ts
- GET handler. Resolves the job folder from the id (validated as a safe id, no
  path traversal), streams the single output file with
  `Content-Disposition: attachment`, then deletes the job folder.
- Returns 404 if the job folder or file is missing.

### lib/jobs.ts
- `newJobId()` → random id (crypto). `jobDir(id)` → validated path under
  `os.tmpdir()/archive-dl/<id>`. `cleanup(id)`. Rejects ids that are not the
  expected random-token shape (path-traversal guard).

### app/page.tsx
- Client form: URL, email, password, resolution (0–10, default 3), format
  (PDF / JPGs ZIP), include metadata checkbox, print-disabled checkbox.
- On submit, opens the SSE stream, shows a progress bar driven by `page`
  events and status text from the others, and on `done` triggers the file
  download. Shows `error` messages inline.

## Error handling

- Invalid URL / missing fields → 400 from the route before spawning.
- Bad login, print-disabled-only book, unavailable book, deobfuscation failure
  → `error` event from the worker, shown in the UI. (The script already handles
  each of these; the worker converts its `exit()`/return-None paths into
  `error` events.)
- Client disconnect → route aborts the worker so no orphan download continues.
- Credentials are used only for the request's env and are never written to disk
  or logged.

## Non-goals (YAGNI)

- No multi-user, auth, accounts, or rate limiting (local tool).
- No persistent job queue or history — one job per request, temp files deleted
  after download.
- No exposed threads field (CLI default 50 is used; add later if needed).
- Multi-URL batch download deferred — single URL per job for the MVP. The form
  can grow a multi-line input later without changing the worker contract (loop
  over URLs = loop of jobs).

## Testing

- One runnable unit check on the non-trivial glue: the SSE relay's line
  buffering — feed byte chunks that split a JSON object across boundaries and
  assert whole events come out. (Node test.)
- `lib/jobs.ts` id validation: reject `../` and non-token ids.
- Worker's live network path is verified manually with a real archive.org
  account and a known borrowable book — it cannot be unit-tested without
  credentials and network.

## Dependencies

- Existing: Python with `requests`, `img2pdf`, `pycryptodome` (already in
  `requirements.txt`; `tqdm` no longer needed by the worker but stays for the
  CLI).
- New: Next.js + React + TypeScript. No other runtime JS deps (SSE and spawn
  are Node built-ins; ZIP is built in the Python worker with stdlib `zipfile`).
