import sys, os, json, argparse, contextlib, importlib.util, zipfile, shutil
from concurrent import futures

REAL_OUT = sys.stdout
HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(os.path.dirname(HERE), "archive-org-downloader.py")


def emit(**kw):
    REAL_OUT.write(json.dumps(kw) + "\n")
    REAL_OUT.flush()


def parse_book_id(url):
    # strip query/fragment, then take the segment after /details/
    path = url.split("?")[0].split("#")[0]
    parts = [p for p in path.split("/") if p]
    # parts = ['https:', 'archive.org', 'details', '<book_id>', ...]
    return parts[3]


def load_script():
    spec = importlib.util.spec_from_file_location("aod", SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    with contextlib.redirect_stdout(sys.stderr):
        spec.loader.exec_module(mod)
    return mod


def build_pdf_meta(metadata, book_id):
    from datetime import datetime
    meta = dict(metadata)
    for key in ["title", "creator", "associated-names"]:
        if key in meta and isinstance(meta[key], list):
            meta[key] = "; ".join(meta[key])
    pdfmeta = {}
    if "title" in meta:
        pdfmeta["title"] = meta["title"]
    if "creator" in meta and "associated-names" in meta:
        pdfmeta["author"] = meta["creator"] + "; " + meta["associated-names"]
    elif "creator" in meta:
        pdfmeta["author"] = meta["creator"]
    elif "associated-names" in meta:
        pdfmeta["author"] = meta["associated-names"]
    if "date" in meta:
        try:
            pdfmeta["creationdate"] = datetime.strptime(str(meta["date"])[0:4], "%Y")
        except Exception:
            pass
    pdfmeta["keywords"] = [f"https://archive.org/details/{book_id}"]
    return pdfmeta


def process_book(aod, session, url, args, book_no, books_total, out_dir):
    """Download + assemble one book into out_dir. Returns the output file path,
    or None if the book was skipped (a book-error event was already emitted)."""
    try:
        book_id = parse_book_id(url)
    except Exception:
        emit(event="book-error", book=book_no, books=books_total, message="Invalid book URL")
        return None

    try:
        with contextlib.redirect_stdout(sys.stderr):
            session = aod.loan(session, book_id)
            title, links, metadata = aod.get_book_infos(session, url, args.print_disabled)
    except SystemExit:
        emit(event="book-error", book=book_no, books=books_total,
             message="Could not borrow or read this book.")
        return None

    if not links:
        emit(event="book-error", book=book_no, books=books_total,
             message="Book not available (it may be restricted to print-disabled patrons).")
        return None

    total = len(links)
    title = title or book_id
    emit(event="info", book=book_no, books=books_total, pages=total, title=title)

    scaled = [f"{link}&rotate=0&scale={args.resolution}" for link in links]
    done = 0
    with contextlib.redirect_stdout(sys.stderr):
        with futures.ThreadPoolExecutor(max_workers=50) as ex:
            tasks = [
                ex.submit(aod.download_one_image, session=session, link=link, i=i,
                          directory=out_dir, book_id=book_id, pages=total)
                for i, link in enumerate(scaled)
            ]
            for _ in futures.as_completed(tasks):
                done += 1
                emit(event="page", book=book_no, books=books_total, done=done, total=total)

    emit(event="building", book=book_no, books=books_total)
    images = [aod.image_name(total, i, out_dir) for i in range(total)]

    if args.format == "pdf":
        import img2pdf
        with contextlib.redirect_stdout(sys.stderr):
            pdf = img2pdf.convert(images, **build_pdf_meta(metadata, book_id))
        out_file = os.path.join(out_dir, f"{title}.pdf")
        with open(out_file, "wb") as f:
            f.write(pdf)
    else:
        out_file = os.path.join(out_dir, f"{title}.zip")
        with zipfile.ZipFile(out_file, "w", zipfile.ZIP_DEFLATED) as z:
            for img in images:
                z.write(img, os.path.basename(img))
            if args.meta:
                z.writestr("metadata.json", json.dumps(metadata))

    for img in images:
        try:
            os.remove(img)
        except OSError:
            pass

    with contextlib.redirect_stdout(sys.stderr):
        try:
            aod.return_loan(session, book_id)
        except (SystemExit, Exception):
            pass

    return out_file


def run(args):
    email = os.environ.get("ARCHIVE_EMAIL")
    password = os.environ.get("ARCHIVE_PASSWORD")
    if not email or not password:
        emit(event="error", message="Missing credentials")
        sys.exit(1)

    urls = args.url or []
    if not urls:
        emit(event="error", message="No book URL provided")
        sys.exit(1)

    # test seam: exercise the outer error handler without network (see selftest)
    if os.environ.get("WORKER_CRASHTEST"):
        raise RuntimeError("crashtest")

    aod = load_script()
    os.makedirs(args.out, exist_ok=True)
    work = os.path.join(args.out, "_work")
    os.makedirs(work, exist_ok=True)

    emit(event="login")
    try:
        with contextlib.redirect_stdout(sys.stderr):
            session = aod.login(email, password)
    except SystemExit:
        emit(event="error", message="Login failed — check your credentials.")
        sys.exit(1)

    total_books = len(urls)
    outputs = []
    for k, url in enumerate(urls, start=1):
        book_dir = os.path.join(work, f"book{k}")
        os.makedirs(book_dir, exist_ok=True)
        out_file = process_book(aod, session, url, args, k, total_books, book_dir)
        if out_file:
            outputs.append(out_file)

    if not outputs:
        emit(event="error", message="No books could be downloaded.")
        sys.exit(1)

    if len(outputs) == 1:
        final = os.path.join(args.out, os.path.basename(outputs[0]))
        shutil.move(outputs[0], final)
        out_name = os.path.basename(final)
    else:
        # ponytail: index-prefix each entry for stable order + no name clashes
        out_name = "books.zip"
        width = len(str(len(outputs)))
        with zipfile.ZipFile(os.path.join(args.out, out_name), "w", zipfile.ZIP_DEFLATED) as z:
            for i, f in enumerate(outputs, start=1):
                z.write(f, f"{str(i).zfill(width)}-{os.path.basename(f)}")

    shutil.rmtree(work, ignore_errors=True)
    emit(event="done", id=args.job_id, filename=out_name)


def selftest():
    assert parse_book_id("https://archive.org/details/abc123") == "abc123"
    assert parse_book_id("https://archive.org/details/abc123/") == "abc123"
    assert parse_book_id("https://archive.org/details/abc123?foo=1") == "abc123"
    assert parse_book_id("https://archive.org/details/abc123/page/n1") == "abc123"
    # missing creds path emits an error and exits non-zero
    import subprocess
    r = subprocess.run(
        [sys.executable, os.path.abspath(__file__), "--url",
         "https://archive.org/details/x", "--out", "/tmp/x", "--job-id",
         "0" * 32],
        capture_output=True, text=True, env={k: v for k, v in os.environ.items()
                                             if k not in ("ARCHIVE_EMAIL", "ARCHIVE_PASSWORD")},
    )
    assert r.returncode == 1, r.returncode
    assert '"event": "error"' in r.stdout or '"event":"error"' in r.stdout, r.stdout

    # an unexpected exception anywhere in run() must still emit ONE error event
    # (not a bare traceback that leaves the UI hanging)
    r2 = subprocess.run(
        [sys.executable, os.path.abspath(__file__), "--url",
         "https://archive.org/details/x", "--out", "/tmp/x", "--job-id", "0" * 32],
        capture_output=True, text=True,
        env={**os.environ, "ARCHIVE_EMAIL": "x@example.com",
             "ARCHIVE_PASSWORD": "pw", "WORKER_CRASHTEST": "1"},
    )
    assert r2.returncode == 1, r2.returncode
    assert '"event": "error"' in r2.stdout or '"event":"error"' in r2.stdout, r2.stdout
    print("selftest OK")


def main():
    if "--selftest" in sys.argv:
        selftest()
        return
    p = argparse.ArgumentParser()
    p.add_argument("--url", action="append", help="Book URL (repeatable)")
    p.add_argument("--resolution", type=int, default=3)
    p.add_argument("--format", choices=["pdf", "jpg"], default="pdf")
    p.add_argument("--meta", action="store_true")
    p.add_argument("--print-disabled", dest="print_disabled", action="store_true")
    p.add_argument("--out", required=True)
    p.add_argument("--job-id", dest="job_id", required=True)
    args = p.parse_args()
    try:
        run(args)
    except SystemExit:
        raise  # clean exits from run() already emitted their error event
    except Exception as e:
        # full detail to stderr (server logs), only the exception type to the
        # client — avoids leaking internals over a public endpoint
        import traceback
        traceback.print_exc(file=sys.stderr)
        emit(event="error", message=f"Download failed ({type(e).__name__}).")
        sys.exit(1)


if __name__ == "__main__":
    main()
