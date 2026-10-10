import { spawn } from "node:child_process";
import { NextRequest } from "next/server";
import { newJobId, jobDir } from "@/lib/jobs";
import { createLineBuffer } from "@/lib/sse";
import { buildWorkerArgs } from "@/lib/worker";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const url = body?.url;
  const email = body?.email;
  const password = body?.password;
  const resolution = Number(body?.resolution ?? 3);
  const format = body?.format === "jpg" ? "jpg" : "pdf";
  const meta = Boolean(body?.meta);
  const printDisabled = Boolean(body?.printDisabled);

  if (typeof url !== "string" || !url.startsWith("https://archive.org/details/"))
    return new Response("Invalid book URL", { status: 400 });
  if (!email || !password)
    return new Response("Missing credentials", { status: 400 });
  if (!Number.isInteger(resolution) || resolution < 0 || resolution > 10)
    return new Response("Resolution must be an integer 0–10", { status: 400 });

  const id = newJobId();
  const out = jobDir(id);
  const python = process.env.PYTHON_BIN || "python3";
  const argv = buildWorkerArgs({ url, resolution, format, meta, printDisabled, out, jobId: id });

  const child = spawn(python, argv, {
    cwd: process.cwd(),
    env: { ...process.env, ARCHIVE_EMAIL: email, ARCHIVE_PASSWORD: password },
  });

  const encoder = new TextEncoder();
  const buffer = createLineBuffer();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const send = (line: string) => { if (!closed) controller.enqueue(encoder.encode(`data: ${line}\n\n`)); };
      const close = () => { if (!closed) { closed = true; controller.close(); } };

      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => { for (const l of buffer.push(chunk)) send(l); });
      child.on("close", () => { for (const l of buffer.flush()) send(l); close(); });
      child.on("error", (e) => { send(JSON.stringify({ event: "error", message: String(e) })); close(); });

      req.signal.addEventListener("abort", () => { child.kill("SIGTERM"); close(); });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
