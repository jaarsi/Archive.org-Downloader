"use client";
import { useState } from "react";

type Phase = "idle" | "running" | "done" | "error";

export default function Home() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [pct, setPct] = useState<number | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const urls = String(f.get("urls") ?? "")
      .split("\n")
      .map((u) => u.trim())
      .filter(Boolean);

    setPhase("running"); setError(""); setWarnings([]); setPct(null); setStatus("Starting…");

    const res = await fetch("/api/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        urls,
        resolution: Number(f.get("resolution")),
        format: f.get("format"),
        meta: f.get("meta") === "on",
        printDisabled: f.get("printDisabled") === "on",
      }),
    });

    if (!res.ok || !res.body) {
      setPhase("error");
      setError(await res.text().catch(() => "Request failed"));
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const frames = buf.split("\n\n");
      buf = frames.pop() ?? "";
      for (const frame of frames) {
        const line = frame.replace(/^data: /, "").trim();
        if (!line) continue;
        handleEvent(JSON.parse(line));
      }
    }
  }

  // Overall progress across all books: completed books + fraction of current.
  function overall(book: number, books: number, frac: number) {
    return Math.round(((book - 1 + frac) / books) * 100);
  }

  function handleEvent(ev: any) {
    switch (ev.event) {
      case "login": setStatus("Logging in…"); break;
      case "info":
        setStatus(`Book ${ev.book}/${ev.books}: “${ev.title}” — ${ev.pages} pages`);
        setPct(overall(ev.book, ev.books, 0));
        break;
      case "page":
        setStatus(`Book ${ev.book}/${ev.books}: downloading pages ${ev.done}/${ev.total}`);
        setPct(overall(ev.book, ev.books, ev.done / ev.total));
        break;
      case "building":
        setStatus(`Book ${ev.book}/${ev.books}: building…`);
        setPct(overall(ev.book, ev.books, 1));
        break;
      case "book-error":
        setWarnings((w) => [...w, `Book ${ev.book}/${ev.books} skipped: ${ev.message}`]);
        break;
      case "done":
        setPhase("done"); setStatus(`Ready: ${ev.filename}`); setPct(100);
        window.location.href = `/api/file/${ev.id}`;
        break;
      case "error": setPhase("error"); setError(ev.message); break;
    }
  }

  const busy = phase === "running";
  return (
    <main>
      <h1>Archive.org Downloader</h1>
      <form onSubmit={onSubmit}>
        <label htmlFor="urls">Book URLs (one per line)</label>
        <textarea id="urls" name="urls" rows={4} required
          placeholder={"https://archive.org/details/…\nhttps://archive.org/details/…"}
          style={{ width: "100%", padding: "0.5rem", borderRadius: 6, border: "1px solid #333", background: "#1a1d24", color: "#e6e6e6", fontFamily: "inherit", resize: "vertical" }} />

        <div className="row">
          <div>
            <label htmlFor="resolution">Resolution (0 = best … 10)</label>
            <input id="resolution" name="resolution" type="number" min={0} max={10} defaultValue={3} />
          </div>
          <div>
            <label htmlFor="format">Format</label>
            <select id="format" name="format" defaultValue="pdf">
              <option value="pdf">PDF</option>
              <option value="jpg">JPGs (ZIP)</option>
            </select>
          </div>
        </div>

        <div className="check"><input id="meta" name="meta" type="checkbox" /><label htmlFor="meta">Include metadata.json (ZIP only)</label></div>
        <div className="check"><input id="printDisabled" name="printDisabled" type="checkbox" /><label htmlFor="printDisabled">Allow print-disabled books (whitelisted accounts)</label></div>

        <button type="submit" disabled={busy}>{busy ? "Downloading…" : "Download"}</button>
      </form>

      {pct !== null && phase !== "error" && <progress value={pct} max={100} />}
      {status && <p className="status">{status}</p>}
      {warnings.map((w, i) => <p key={i} className="error" style={{ color: "#fbbf24" }}>{w}</p>)}
      {error && <p className="error">{error}</p>}
      <p className="status" style={{ marginTop: "1rem", fontSize: "0.8rem" }}>
        Multiple URLs are bundled into a single <code>books.zip</code>.
      </p>
    </main>
  );
}
