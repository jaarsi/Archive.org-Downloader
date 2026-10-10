import { createReadStream } from "node:fs";
import { readdir } from "node:fs/promises";
import { Readable } from "node:stream";
import path from "node:path";
import { jobDir, cleanup } from "@/lib/jobs";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let dir: string;
  try {
    dir = jobDir(id);
  } catch {
    return new Response("Not found", { status: 404 });
  }

  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const name = files.find((f) => f.endsWith(".pdf") || f.endsWith(".zip"));
  if (!name) return new Response("Not found", { status: 404 });

  const nodeStream = createReadStream(path.join(dir, name));
  nodeStream.on("close", () => { cleanup(id).catch(() => {}); });
  const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream;

  const type = name.endsWith(".pdf") ? "application/pdf" : "application/zip";
  return new Response(webStream, {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
    },
  });
}
