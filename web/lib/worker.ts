export interface WorkerOpts {
  url: string;
  resolution: number;
  format: "pdf" | "jpg";
  meta: boolean;
  printDisabled: boolean;
  out: string;
  jobId: string;
}

export function buildWorkerArgs(o: WorkerOpts): string[] {
  const argv = [
    "worker.py",
    "--url", o.url,
    "--resolution", String(o.resolution),
    "--format", o.format,
    "--out", o.out,
    "--job-id", o.jobId,
  ];
  if (o.meta) argv.push("--meta");
  if (o.printDisabled) argv.push("--print-disabled");
  return argv;
}
