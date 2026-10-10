"use client";
import { useState } from "react";

type Phase = "idle" | "running" | "done" | "error";

export default function Home() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [pct, setPct] = useState<number | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setPhase("running"); setError(""); setPct(null); setStatus("Starting…");

    const res = await fetch("/api/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: f.get("url"),
        email: f.get("email"),
        password: f.get("password"),
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

  function handleEvent(ev: any) {
    switch (ev.event) {
      case "login": setStatus("Logging in and borrowing the book…"); break;
      case "info": setStatus(`“${ev.title}” — ${ev.pages} pages`); setPct(0); break;
      case "page": setPct(Math.round((ev.done / ev.total) * 100)); setStatus(`Downloading pages ${ev.done}/${ev.total}`); break;
      case "building": setPct(100); setStatus("Building the file…"); break;
      case "done":
        setPhase("done"); setStatus(`Ready: ${ev.filename}`);
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
        <label htmlFor="url">Book URL</label>
        <input id="url" name="url" placeholder="https://archive.org/details/…" required />

        <div className="row">
          <div>
            <label htmlFor="email">archive.org email</label>
            <input id="email" name="email" type="email" required />
          </div>
          <div>
            <label htmlFor="password">Password</label>
            <input id="password" name="password" type="password" required />
          </div>
        </div>

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
      {error && <p className="error">{error}</p>}
    </main>
  );
}
