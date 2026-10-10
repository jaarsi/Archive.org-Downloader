import { spawn } from "node:child_process";
import { NextRequest } from "next/server";
import { newJobId, jobDir, cleanup, sweepOld } from "@/lib/jobs";
import { createLineBuffer } from "@/lib/sse";
import { buildWorkerArgs } from "@/lib/worker";
import { createGate } from "@/lib/gate";
import { resolveCreds } from "@/lib/creds";

export const runtime = "nodejs";

const MAX_CONCURRENT = Number(process.env.MAX_CONCURRENT || 2);
const WORKER_TIMEOUT_MS = Number(process.env.WORKER_TIMEOUT_MS || 20 * 60 * 1000);
const JOB_TTL_MS = Number(process.env.JOB_TTL_MS || 60 * 60 * 1000);

// One gate per server process (public endpoint guard).
const gate = createGate(MAX_CONCURRENT);

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const urls = Array.isArray(body?.urls) ? body.urls : [];
  const { email, password } = resolveCreds(body ?? {}, process.env);
  const resolution = Number(body?.resolution ?? 3);
  const format = body?.format === "jpg" ? "jpg" : "pdf";
  const meta = Boolean(body?.meta);
  const printDisabled = Boolean(body?.printDisabled);

  if (urls.length === 0)
    return new Response("Provide at least one book URL", { status: 400 });
  if (!urls.every((u: unknown) => typeof u === "string" && u.startsWith("https://archive.org/details/")))
    return new Response("Every URL must start with https://archive.org/details/", { status: 400 });
  if (!email || !password)
    return new Response("No archive.org credentials: enter an account or configure a default on the server.", { status: 400 });
  if (!Number.isInteger(resolution) || resolution < 0 || resolution > 10)
    return new Response("Resolution must be an integer 0–10", { status: 400 });

  // Opportunistically reap abandoned/undownloaded jobs (no cron needed).
  sweepOld(JOB_TTL_MS).catch(() => {});

  if (!gate.tryAcquire())
    return new Response("Server busy — too many downloads in progress. Try again shortly.", { status: 429 });

  const id = newJobId();
  const out = jobDir(id);
  const python = process.env.PYTHON_BIN || "python3";
  const argv = buildWorkerArgs({ urls, resolution, format, meta, printDisabled, out, jobId: id });

  const child = spawn(python, argv, {
    cwd: process.cwd(),
    env: { ...process.env, ARCHIVE_EMAIL: email, ARCHIVE_PASSWORD: password },
  });

  let released = false;
  const release = () => { if (!released) { released = true; gate.release(); } };

  const encoder = new TextEncoder();
  const buffer = createLineBuffer();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const send = (line: string) => { if (!closed) controller.enqueue(encoder.encode(`data: ${line}\n\n`)); };
      const close = () => { if (!closed) { closed = true; controller.close(); } };

      const timer = setTimeout(() => {
        send(JSON.stringify({ event: "error", message: "Download timed out." }));
        child.kill("SIGTERM");
        cleanup(id).catch(() => {});
        close(); release();
      }, WORKER_TIMEOUT_MS);

      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => { for (const l of buffer.push(chunk)) send(l); });

      child.on("close", (code) => {
        for (const l of buffer.flush()) send(l);
        clearTimeout(timer);
        if (code !== 0) cleanup(id).catch(() => {}); // success leaves the file for /api/file
        close(); release();
      });

      child.on("error", (e) => {
        clearTimeout(timer);
        send(JSON.stringify({ event: "error", message: String(e) }));
        cleanup(id).catch(() => {});
        close(); release();
      });

      req.signal.addEventListener("abort", () => {
        clearTimeout(timer);
        child.kill("SIGTERM");
        cleanup(id).catch(() => {});
        close(); release();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
